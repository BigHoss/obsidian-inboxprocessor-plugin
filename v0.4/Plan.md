---
type: "Plan"
project: "obsidian-inboxprocessor-plugin"
version: "v0.4"
created: 2026-09-01
status: "working"
tags: [plan, plugin, v0.4]
---

# v0.4 — Filename Cleaner + Move-to-Archive + Project Scaffolding + Cron + BRAT

## Tasks

- [ ] read #task/pending
- [ ] reviewed #task/review
- [ ] handled #task/pending

## Review by Raphael

- [ ] Agree / Disagree
- [ ] Action items for me
- [ ] Dead or proceed?

## Context

The plugin reached v0.3.0 with the LLM-fetches-the-URL refactor and the
out-of-vault failure log. Two lingering issues remain from real-world
testing, plus three new features Raphael asked for:

1. Two leftover printables.com links still in the inbox after a v0.3.0
   re-run. The plugin's filename generation produced "Untitled Link" /
   sanitized-junk names that the LLM's title text wasn't cleaning up.
   Need a `cleanTitle()` helper that strips site suffixes, query
   strings, trailing parentheticals, etc.

2. The plugin shells out to `5. System/Templates/Project Folder Template/
   scripts/init-project.py` for the "Create project from selection"
   command — keeps the existing Python tooling as the single source of
   truth for project scaffolding.

3. New commands:
   - "Create project from selection" (editorCallback)
   - "Move to archive" (file-menu right-click hook)

4. New settings for cron-style automatic inbox processing.

5. README gets a BRAT install section for cross-device distribution.

## Stages

### Stage 1 — Filename cleaner
- New helper `cleanTitle(raw: string): string` in main.ts
- Strips: site-suffix pipes (` | GitHub`, ` | Reddit`), trailing
  parenthetical groups (`(...)`), query-string-style cruft
  (`?ref=...`), brackets with site names (`[thingiverse.com]`), emojis,
  multiple whitespace
- Truncates at word boundary to 80 chars
- Used in `processOne` to derive `finalTitle` from `llm.refinedTitle` /
  markdown-link text / URL hostname+path

### Stage 2 — Move-to-archive right-click command
- Register via `this.registerEvent(this.app.workspace.on('file-menu',
  (menu, file) => ...))`
- Source: `1. Projects/Homelab Manager/Plan.md` →
  `4. Archive/1. Projects/Homelab Manager/Plan.md` (keep original path
  tree, prepend `4. Archive/`)
- Frontmatter edit: add `archivedAt: <ISO timestamp>` to YAML
  frontmatter (insert between `---` markers)
- Atomic move via `app.fileManager.renameFile()`
- Skip if already in 4. Archive/ (no-op)
- Notification on success

### Stage 3 — Project scaffolding command
- Trigger: select text in inbox → run "Create project from selection"
- Modal asks:
  1. Project type (dropdown — dynamically reads `1. Projects/<Type>/`
     subfolders at modal-open time, NOT hardcoded)
  2. Project name (text input, auto-derives project key uppercase + dashes)
  3. Destination base (read-only display: `1. Projects/<Type>/<Name>/`)
- Spawn: `python init-project.py --name <Name> --key <KEY> --dst
  <vault>/1. Projects/<Type>/<Name>/`
- Python detection: try `python`, `python3`, `py -3` in sequence, cache
  the first one that works per session
- On exit 0: open the new project's index note in Obsidian
- On non-zero: show error, log to failure log

### Stage 4 — Cron settings + interval
- New settings:
  - `cronEnabled: boolean` (default false)
  - `cronIntervalMinutes: number` (default 15)
  - `cronRunOnStartup: boolean` (default false)
- When enabled, plugin registers `this.registerInterval(window.
  setInterval(() => this.processInbox({ silent: true }), ms))`
- Hot-reload on setting change: unregister old interval, register new
- `processInbox` gets a `silent: boolean` parameter that suppresses
  per-link Notices (only writes to failure log + final batch notice)
- Default off to avoid surprising users with auto-processing

### Stage 5 — Status-bar last-run timestamp
- When cron is enabled, status-bar text format becomes:
  `Inbox: clean (last: 14:35)` or `Inbox: 2 pending (last: 14:30)`
- `lastRunAt: number | null` field in plugin state (not persisted)
- Updated after each `processInbox` completes

### Stage 6 — README + BRAT section + version bump
- README gets new "Distribution via BRAT" section:
  - Install BRAT on each device
  - Add `BigHoss/obsidian-inboxprocessor-plugin` (needs PAT for private
    repo)
  - Auto-updates on every push to main
- Document the three new commands
- Document cron settings
- Bump version to 0.4.0 in manifest.json / package.json / versions.json

## Consequences

- Cron auto-processing is opt-in (default off) — no surprise behavior
- "Move to archive" preserves the source tree under `4. Archive/` so
  archived notes are still locatable by their original PARA path
- "Create project from selection" shells out to existing Python tooling
  instead of duplicating Jinja template logic in TS
- Filename cleaner fixes the printables.com failure mode where the LLM
  returns a long messy title that survives sanitizeFilename as a
  non-empty but ugly string

## Alternatives considered

- Porting `init-project.py` to TS — rejected. The Python handles
  manifest, jinja, edge cases, exit codes; ~500 lines of duplication
  is too much for an MVP
- Hardcoding project-type subfolders — rejected per Raphael
- Adding cron via OS-level Task Scheduler — rejected, requires per-OS
  setup, defeats plugin portability

## Consequences — testing

After install:
1. Process inbox — both printables.com links should produce notes with
   clean filenames (no "Untitled Link" / messy suffixes)
2. Right-click a note → "Move to archive" → note moves, frontmatter
   has `archivedAt`
3. In inbox, select text → run command → project modal appears with
   project-type dropdown populated from `1. Projects/` subfolders
4. Enable cron, set interval 5 min, wait, observe status-bar timestamp
   update
5. From a different device, install via BRAT → plugin appears

## Review by Raphael

- [ ] Agree / Disagree
- [ ] Action items for me
- [ ] Dead or proceed?
