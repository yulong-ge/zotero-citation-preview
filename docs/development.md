# Development setup and checks

Use NVM Node 24 and uv Python 3.12. Dependencies belong to this project: `package-lock.json` locks Node tools and `uv.lock` locks Python tools, including ShellCheck, shfmt and actionlint wrappers. The addon version comes from `manifest.json`; dependency-project versions are not release versions.

```sh
source "$HOME/.nvm/nvm.sh"
nvm install
nvm use
npm ci
uv sync --locked
npm run setup:hooks
npm run check
```

`npm run check` checks formatting, JavaScript, Markdown, Python, shell, workflows, document links, Notes and frozen-history contracts. It runs maintenance tests, the existing Node product tests and the XPI with bundled icons build. It does not run the native GUI test locally; follow the [host guide](../test/host/README.md) or inspect the `Zotero GUI` workflow. No tool checks prose duplication or replaces behavioral review.

`npm run format` applies Prettier, Ruff, shfmt and Taplo (project TOML). ESLint targets JavaScript, including privileged Zotero globals; Ruff selects E4/E7/E9/F. Markdownlint and the adopted document checker validate structure and local anchors. Chinese prose spacing remains a review responsibility; this adoption does not add AutoCorrect rewriting of protocol strings or fixtures. No MPE preview resources are needed for this plugin.

## Two-stage hooks

The project installer refuses to overwrite foreign hooks or a configured `core.hooksPath`. It installs only repository-local pre-commit and pre-push hooks; it does not change global skills or Git settings. Run setup again if the project Python environment moves.

Pre-commit first runs `git-format-staged` on the index. Only then does pre-commit temporarily hide unstaged edits and run lint plus document contracts against an exported index snapshot. This order preserves partial staging. Do not replace this entry with `pre-commit install`.

A formatting merge conflict leaves the working-tree text intact and may leave the index formatted. Inspect both `git diff` and `git diff --cached`, resolve the conflict, and stage only intended changes. Any failed formatter/check stops the commit. Pre-push runs the same `npm run check` entry as CI.

## Files and artifacts

- Root contains the four plugin source files and repository configuration.
- `assets/` contains the generated icon source and its provenance; `icons/` contains the 32, 64 and 128 pixel PNGs shipped in the XPI.
- `docs/` contains maintained documentation; `test/` contains fixtures and tests; `scripts/` contains build and maintenance commands.
- `dist/` is ignored, disposable output from `npm run build`. Copy an installer to Downloads for installation or manual publication.
- `~/Downloads/zotero-citation-preview/` holds downloaded release assets and retained historical installers. `local-builds/` and `release-assets/` preserve their origin; these are not source files.
- `.local/evidence/` holds downloaded CI logs/screenshots. `.local/archive/2026-11-15/` preserves historical debugging material, including old isolated profiles. These are records, not current runnable environments.
- `.local/maintenance/` holds this machine's move inventory and temporary maintenance verification. `.local/cloud-gui/` is created by current native tests.

Do not commit personal PDFs, profiles, credentials or generated installers. Historical references use their original conditions; current test commands must use the maintained harness. No automatic release job is installed.
