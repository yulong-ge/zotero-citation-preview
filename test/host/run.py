import argparse
import base64
import errno
import json
import os
from pathlib import Path
import socket
import signal
import uuid
import subprocess
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--zotero", type=Path, required=True)
parser.add_argument("--xpi", type=Path, required=True)
parser.add_argument("--pdf", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--destination", default="cite.fixture2")
parser.add_argument(
    "--case",
    choices=[
        "success",
        "metadata-failure",
        "parser-failure",
        "multiple",
        "issue-1",
        "issue-1-live",
    ],
    default="success",
)
args = parser.parse_args()
for path in (args.zotero, args.xpi, args.pdf):
    if not path.is_file():
        raise FileNotFoundError(path)
for port in (23129, 23130):
    with socket.socket() as reservation:
        reservation.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        reservation.bind(("127.0.0.1", port))
run_id = uuid.uuid4().hex
root = args.output.resolve()
root.mkdir(parents=True, exist_ok=False)
profile, data = root / "profile", root / "data"
profile.mkdir()
data.mkdir()
prefs = {
    "extensions.zotero.useDataDir": True,
    "extensions.zotero.dataDir": str(data),
    "extensions.zotero.firstRun2": False,
    "extensions.zotero.firstRunGuidance": False,
    "extensions.zotero.sync.autoSync": False,
    "extensions.zotero.automaticScraperUpdates": False,
    "extensions.zotero.httpServer.enabled": True,
    "extensions.zotero.httpServer.port": 23129,
    "extensions.zotero.httpServer.localAPI.enabled": True,
    "app.update.auto": False,
    "extensions.autoDisableScopes": 0,
    "extensions.startupScanScopes": 15,
    "extensions.sideloadScopes": 1,
    "extensions.zoteroMacWordIntegration.skipInstallation": True,
    "extensions.zoteroOpenOfficeIntegration.skipInstallation": True,
    "devtools.debugger.remote-enabled": True,
    "devtools.chrome.enabled": True,
    "devtools.debugger.prompt-connection": False,
    "devtools.debugger.force-local": True,
}
(profile / "user.js").write_text(
    "".join(f"user_pref({json.dumps(k)}, {json.dumps(v)});\n" for k, v in prefs.items())
)


def receive(connection):
    header = b""
    while not header.endswith(b":"):
        chunk = connection.recv(1)
        if not chunk:
            raise ConnectionError("Debugger closed before its response header")
        header += chunk
    size, body = int(header[:-1]), b""
    while len(body) < size:
        chunk = connection.recv(size - len(body))
        if not chunk:
            raise ConnectionError("Debugger closed during its response body")
        body += chunk
    return json.loads(body)


def request(connection, target, method, **params):
    body = json.dumps({"to": target, "type": method, **params}).encode()
    connection.sendall(str(len(body)).encode() + b":" + body)
    while True:
        result = receive(connection)
        if result.get("from") == target:
            if "error" in result:
                raise RuntimeError(f"{method} failed: {result}")
            return result


opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
base_url = "http://127.0.0.1:23129"
env = {
    **os.environ,
    "MOZ_HEADLESS": "1",
    "HOST_CASE_PDF": str(args.pdf.resolve()),
    "HOST_CASE_MODE": args.case,
    "HOST_CASE_DEST": args.destination,
    "HOST_CASE_RUN_ID": run_id,
    "XRE_CONSOLE_LOG": str(root / "console.log"),
}
with (root / "process.log").open("wb") as log:
    process = subprocess.Popen(
        [
            str(args.zotero.resolve()),
            "-headless",
            "-no-remote",
            "-profile",
            str(profile),
            "-start-debugger-server",
            "23130",
        ],
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    try:
        deadline = time.monotonic() + 120
        while True:
            if process.poll() is not None:
                raise RuntimeError(
                    f"Isolated Zotero exited with {process.returncode}; see process.log"
                )
            try:
                with opener.open(base_url + "/api/", timeout=2) as response:
                    response.read()
                break
            except urllib.error.URLError as error:
                if (
                    isinstance(error, urllib.error.HTTPError)
                    or time.monotonic() >= deadline
                ):
                    raise
                time.sleep(0.5)
        with socket.create_connection(("127.0.0.1", 23130), timeout=10) as connection:
            receive(connection)
            actors = request(connection, "root", "getRoot")
            request(
                connection,
                actors["addonsActor"],
                "installTemporaryAddon",
                addonPath=str(args.xpi.resolve()),
                openDevTools=False,
            )
            request(
                connection,
                actors["addonsActor"],
                "installTemporaryAddon",
                addonPath=str(Path(__file__).parent.resolve() / "addon"),
                openDevTools=False,
            )
        while time.monotonic() < deadline:
            try:
                with opener.open(
                    base_url + "/citation-preview-host/status", timeout=5
                ) as response:
                    raw = response.read()
            except urllib.error.HTTPError as error:
                if error.code != 404:
                    raise
                time.sleep(0.5)
                continue
            status = json.loads(raw)
            if (
                status.get("runID") != run_id
                or status.get("destination") != args.destination
            ):
                raise RuntimeError(
                    f"GUI status belongs to a different process or test case: {status}"
                )
            if status["stage"] in ("passed", "failed"):
                (root / "result.json").write_bytes(raw)
                if status.get("hasScreenshot"):
                    with opener.open(
                        base_url + "/citation-preview-host/screenshot", timeout=5
                    ) as response:
                        (root / "screenshot.png").write_bytes(
                            base64.b64decode(response.read(), validate=True)
                        )
                if status["stage"] != "passed":
                    raise RuntimeError(f"GUI test failed: {status}")
                print(json.dumps(status))
                break
            time.sleep(0.5)
        else:
            raise TimeoutError("Isolated Zotero GUI test exceeded 120 seconds")
    finally:
        # The Linux launcher has child processes; stopping only its shell leaves the old HTTP server alive.
        def group_exists():
            try:
                os.killpg(process.pid, 0)
                return True
            except ProcessLookupError:
                return False

        if group_exists():
            os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=5)
        if group_exists():
            os.killpg(process.pid, signal.SIGKILL)
        # Child socket shutdown can finish after the launcher exits.
        cleanup_deadline = time.monotonic() + 5
        for port in (23129, 23130):
            while True:
                try:
                    with socket.socket() as reservation:
                        reservation.setsockopt(
                            socket.SOL_SOCKET, socket.SO_REUSEADDR, 1
                        )
                        reservation.bind(("127.0.0.1", port))
                    break
                except OSError as error:
                    if (
                        error.errno != errno.EADDRINUSE
                        or time.monotonic() >= cleanup_deadline
                    ):
                        raise
                    time.sleep(0.05)
