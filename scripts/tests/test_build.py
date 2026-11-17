"""Preserve the existing package gate, including rejecting invalid manifests."""

import json
from pathlib import Path
import shutil
import subprocess
import struct
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "scripts").mkdir()
        shutil.copyfile(ROOT / "scripts/build.py", self.root / "scripts/build.py")
        for name in ("manifest.json", "bootstrap.js", "core.js", "preview.js"):
            shutil.copyfile(ROOT / name, self.root / name)

        if (ROOT / "icons").exists():
            shutil.copytree(ROOT / "icons", self.root / "icons")

    def run_build(self):
        return subprocess.run(
            [sys.executable, str(self.root / "scripts/build.py")],
            capture_output=True,
            text=True,
        )

    def test_declared_icons_packaged_and_reproducible_bytes(self):
        manifest = json.loads((self.root / "manifest.json").read_text())
        icons = {str(size): f"icons/icon-{size}.png" for size in (32, 64, 128)}
        self.assertEqual(
            manifest.get("icons"), icons, "Addon must declare its custom icons"
        )
        first = self.run_build()
        self.assertEqual(first.returncode, 0, first.stderr)
        package = Path(first.stdout.strip())
        content = package.read_bytes()
        with zipfile.ZipFile(package) as archive:
            self.assertEqual(
                set(archive.namelist()),
                {
                    "manifest.json",
                    "bootstrap.js",
                    "core.js",
                    "preview.js",
                    *icons.values(),
                },
            )
            for size, name in icons.items():
                image = archive.read(name)
                self.assertEqual(image[:8], b"\x89PNG\r\n\x1a\n")
                self.assertEqual(
                    struct.unpack(">II", image[16:24]), (int(size), int(size))
                )
            self.assertIsNone(archive.testzip())
        self.assertEqual(self.run_build().returncode, 0)
        self.assertEqual(package.read_bytes(), content)

    def test_invalid_manifest_is_rejected_before_writing_package(self):
        original = json.loads((self.root / "manifest.json").read_text())
        for key, value in [("manifest_version", 3), ("version", "../../escape")]:
            with self.subTest(key=key):
                (self.root / "manifest.json").write_text(
                    json.dumps({**original, key: value})
                )
                result = self.run_build()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("ValueError", result.stderr)
                self.assertFalse((self.root / "dist").exists())

    def test_invalid_icon_is_rejected_before_writing_package(self):
        (self.root / "icons/icon-32.png").write_bytes(b"invalid PNG")
        result = self.run_build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Invalid 32 pixel PNG icon", result.stderr)
        self.assertFalse((self.root / "dist").exists())

    def test_unexpected_icon_path_is_rejected(self):
        manifest = json.loads((self.root / "manifest.json").read_text())
        manifest["icons"]["32"] = "../outside.png"
        (self.root / "manifest.json").write_text(json.dumps(manifest))
        result = self.run_build()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Expected bundled", result.stderr)
        self.assertFalse((self.root / "dist").exists())
