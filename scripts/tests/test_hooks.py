"""Verify real partial commits and failure propagation in disposable repositories."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import install_hooks  # noqa: E402


class HooksTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        (self.root / "node_modules").symlink_to(
            ROOT / "node_modules", target_is_directory=True
        )
        (self.root / ".gitignore").write_text("node_modules/\n")
        (self.root / "README.md").write_text("# Title\n\nOriginal.\n")
        (self.root / "check.py").write_text(
            "from pathlib import Path\nraise SystemExit(7 if 'INVALID' in Path('README.md').read_text() else 0)\n"
        )
        config = {
            "repos": [
                {
                    "repo": "local",
                    "hooks": [
                        {
                            "id": "format",
                            "name": "format",
                            "entry": 'node_modules/.bin/git-format-staged --formatter "node_modules/.bin/prettier --stdin-filepath {}"',
                            "language": "system",
                            "files": r"\.(md|json)$",
                            "stages": ["manual"],
                        },
                        {
                            "id": "content",
                            "name": "content",
                            "entry": f"{sys.executable} check.py",
                            "language": "system",
                            "pass_filenames": False,
                            "always_run": True,
                        },
                    ],
                }
            ]
        }
        (self.root / ".pre-commit-config.yaml").write_text(yaml.safe_dump(config))
        self.git("add", ".")
        self.git("commit", "-qm", "initial")
        install_hooks.install(self.root)

    def git(self, *args, check=True):
        environment = os.environ.copy()
        environment.pop("SKIP", None)
        return subprocess.run(
            ["git", "-C", str(self.root), *args],
            env=environment,
            text=True,
            capture_output=True,
            check=check,
        )

    def test_real_partial_staging_preserves_unstaged_text(self):
        page = self.root / "README.md"
        page.write_text("# Title   \n\nStaged.\n")
        self.git("add", "README.md")
        page.write_text(page.read_text() + "\nUnstaged.\n")
        result = self.git("commit", "-qm", "partial", check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        committed = self.git("show", "HEAD:README.md").stdout
        self.assertEqual(committed, "# Title\n\nStaged.\n")
        self.assertIn("Unstaged.", page.read_text())
        self.assertIn("Unstaged.", self.git("diff").stdout)

    def test_unstaged_fix_cannot_hide_staged_violation(self):
        page = self.root / "README.md"
        page.write_text("# Title\n\nINVALID\n")
        self.git("add", "README.md")
        page.write_text("# Title\n\nValid working copy.\n")
        before = self.git("rev-parse", "HEAD").stdout
        result = self.git("commit", "-qm", "must fail", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("content", result.stdout + result.stderr)
        self.assertEqual(self.git("rev-parse", "HEAD").stdout, before)
        self.assertIn("Valid working copy.", page.read_text())
        self.assertIn("INVALID", self.git("show", ":README.md").stdout)

    def test_formatter_error_blocks_commit_even_with_valid_worktree(self):
        page = self.root / "bad.json"
        page.write_text("{ broken")
        self.git("add", "bad.json")
        page.write_text("{}\n")
        result = self.git("commit", "-qm", "must fail", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SyntaxError", result.stdout + result.stderr)
        self.assertEqual(page.read_text(), "{}\n")

    def test_foreign_hook_is_preserved(self):
        hook = self.root / ".git/hooks/pre-commit"
        hook.write_text("#!/bin/sh\necho custom\n")
        with self.assertRaises(SystemExit):
            install_hooks.install(self.root)
        self.assertEqual(hook.read_text(), "#!/bin/sh\necho custom\n")
