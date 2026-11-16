# Maintenance rules and source

Adapted from [WncFht/agent-maintenance](https://github.com/WncFht/agent-maintenance/tree/527af880f6feb0e352cae42b2c7601dc443b2b70), commit `527af880f6feb0e352cae42b2c7601dc443b2b70`. Its [MIT license](licenses/agent-maintenance-MIT.txt), including the original copyright, applies to the copied material; it does not assign a license to unrelated plugin code.

Adopted material includes the three `.agents/skills` entries, their shared references and templates, Agent Notes rules, document/anchor/budget and Notes/archive checkers, staged snapshot checks, the two-stage hook installer, and relevant checker tests. References and runtime commands are adjusted to this repository. The maintenance package's process Notes, research history, preview resources and check scheduler are not copied.

The existing Node tests and native Zotero workflow remain product checks. npm scripts are the single local/CI check entry; uv owns Python and packaged shell/workflow tools. Formatter/lint configuration is scoped to the languages actually present. Formatting cannot prove a document's claims or a popup's behavior; use the [ownership rules](AGENTS.md) and real host evidence.
