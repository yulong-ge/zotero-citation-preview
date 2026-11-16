# Documentation ownership

- Root README owns installation and entry points, not implementation detail.
- [reference.md](reference.md) owns current reader behavior, metadata matching, privacy and compatibility limits.
- [architecture.md](architecture.md) owns reader integration, caching, cancellation and diagnostics.
- [development.md](development.md) owns dependencies, checks, hooks and local artifact locations.
- [releasing.md](releasing.md) owns the manual release gate; [validation.md](validation.md) owns version-specific observations and coverage gaps.
- [../test/host/README.md](../test/host/README.md) owns native GUI harness inputs, execution and evidence.
- [.agents/notes](../.agents/notes/README.md) owns lasting decision rationale. Temporary debugging and session status belong in ignored `.local/`; do not promote them into current reference pages.

Use [maintain-docs](../.agents/skills/maintain-docs/SKILL.md) and its references. Update the owner of each fact and fix incoming links when moving it. Do not run duplicate-content detection. This plugin is not a research project; scientific experiment templates are optional references, not required test-report structure.
