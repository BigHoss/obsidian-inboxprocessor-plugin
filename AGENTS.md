# Agent Memory — obsidian-inboxprocessor-plugin

## Product

Obsidian plugin that processes iOS-shared links from `0. Inbox/0. Inbox.md`
into templated notes (per the iOS Share Target on Raphael's vault dashboard).
TypeScript, bundled with esbuild, distributed via BRAT. Current version: 0.6.6.

## Docs live in the vault, not in this repo

Plugin docs are maintained in the **Obsidian vault**, not under `docs/` here:

```
Vault: C:\Users\rapha\Documents\Kuster.live
Folder: 1. Projects/3. Coding/Inbox Processor Plugin/
```

The canonical vault-level rules live in `C:\Users\rapha\Documents\Kuster.live\CLAUDE.md`
— that file is the source of truth for naming, frontmatter, the Tasks triplet,
and the project-folder scaffold convention. Always defer to it; don't duplicate
its content here.

### Current docs folder state (as observed 2026-09-03)

```
Inbox Processor Plugin.md                        ← mislabeled (holds Project Folder Template README; needs replacement with real project index)
CLAUDE.md                                       ← not yet present
Initialize Obsidian Project - 2026-09-04.md      ← bootstrap plan, 8 steps across 3 phases, NOT yet executed
LINK - Pending decisions.md                      ← active-questions note, empty `## Pending decisions` block, Tasks triplet present but unchecked
Research/                                       ← empty, needs CLAUDE.md
  CLAUDE.md                                     ← not yet present
Decision Records/                               ← empty, needs CLAUDE.md + ADR-001
  CLAUDE.md                                     ← not yet present
v0.4/LINK - Implementation Plan v0.4.md         ← WRONG shape (type: Plan, not Project/Work; no Tasks triplet)
v0.6/LINK - Implementation Plan v0.6.md         ← WRONG shape (same)
```

The `Initialize Obsidian Project - 2026-09-04.md` plan describes exactly what
needs to change. Its `## Tasks` triplet (read/reviewed/handled) is unchecked,
so the work has **not been approved or executed**. Don't act on it without
explicit approval.

## Vault conventions that matter for this project

- **Project pattern:** `Name/` + `Name.md` index (the folder name and the
  index note name match, with a `Link ` prefix used elsewhere — follow the
  precedent in the bootstrap plan).
- **Type taxonomy** (YAML frontmatter `type:`): `Inbox/...` types, `Project`,
  `Project/Index`, `Project/Work`, `Project/Research`, `Project/Reference`,
  `Archive`. The bootstrap plan renames the v0.4/v0.6 plans from
  `type: "Plan"` → `type: "Project/Work"`.
- **Work-note canonical shape:**
  `# Title` → brief goal → `---` → `# Work` → `## Tasks` (3-checkbox triplet)
  → `## Review by Raphael` → `---` → `# Content` → body.
- **Tasks triplet** (non-negotiable, easy to violate):
  - `read #task/pending` — Raphael ticks after opening + reading the doc.
  - `reviewed #task/review` — Raphael only. **The agent must NEVER tick this.**
  - `handled #task/pending` — agent only, after the called-for work is verifiably done.
  - Don't ask the user to tick `handled`; if unsure whether work is done,
    read the file's `## Tasks` + verify deliverables on disk.

## Working-style notes (from vault CLAUDE.md)

- Plan research first; wait for approval before files. Inline work by default;
  don't dispatch subagents for small tasks.
- Short answers when nothing's pending. Push back on verbose output.
- Don't broadcast tool failures — surface the error and propose a path.
- If Raphael corrects tool behavior, update the model without argument.
