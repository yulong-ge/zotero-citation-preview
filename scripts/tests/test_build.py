"""Preserve the existing package gate, including rejecting invalid manifests."""

import json
from pathlib import Path
import shutil
import subprocess
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

    def run_build(self):
        return subprocess.run(
            [sys.executable, str(self.root / "scripts/build.py")],
            capture_output=True,
            text=True,
        )

    def test_exact_four_entries_and_reproducible_bytes(self):
        first = self.run_build()
        self.assertEqual(first.returncode, 0, first.stderr)
        package = Path(first.stdout.strip())
        content = package.read_bytes()
        with zipfile.ZipFile(package) as archive:
            self.assertEqual(
                set(archive.namelist()),
                {"manifest.json", "bootstrap.js", "core.js", "preview.js"},
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
