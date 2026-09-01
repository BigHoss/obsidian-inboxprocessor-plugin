# Link Inbox Processor

An Obsidian plugin that turns iOS-shared links into templated vault notes
for a **PARA vault**, archives notes on demand, and scaffolds new projects
from inbox selections — atomic, idempotent, LLM-optional.

## What it does

**Link inbox processing.** Reads the iOS Share-Target block at the bottom
of `0. Inbox/0. Inbox.md` (delimited by the marker comment), and for each
link:

1. Parses `[title](url)` or bare URL
2. *(Optional, LLM enabled)* Sends the URL to OpenRouter — the LLM fetches
   the page itself via its web-fetch / browser tool, classifies the link
   into a `linkType`, picks a PARA destination, and returns
   `{ refinedTitle, linkType, suggestedDestination, suggestedTags,
   description, siteName }`
3. Picks the template whose `linkType` matches (falls back to the default
   if LLM is off)
4. Writes the note to the LLM-suggested destination (or the slot's
   default), e.g. `0. Inbox/Links/<stamp> - <Title>.md` or
   `3. Resources/AI/<stamp> - <Title>.md`
5. Atomically removes only the successfully-processed lines from the
   inbox file

Failed lines are kept in the inbox for the next run — eventual progress,
never a stuck state. Every failure is also appended to an **out-of-vault
log** so you can audit them later.

**Move to archive.** Right-click any file → "Move to archive (with
archivedAt timestamp)" mirrors the source path under `<archiveRoot>/`
and writes an ISO `archivedAt` timestamp into the frontmatter.
`1. Projects/Homelab Manager/Plan.md` →
`4. Archive/1. Projects/Homelab Manager/Plan.md`.

**Create project from selection.** Select text in any note → run command
→ the plugin reads numbered subfolders of `<projectsRoot>/` live, asks
which type + name + key, then shells out to your existing
`init-project.py` (Project Folder Template script). The selected text
seeds the new project's `v0.1/Plan.md`.

**Cron.** Opt-in automatic inbox processing every N minutes. Notices
suppressed during cron runs; failures still go to the failure log.

**No more direct page fetching from Obsidian.** The plugin never calls
`requestUrl` on the destination URL anymore — that dodges Cloudflare
bot-protection (the 403 you used to see on `printables.com` etc.)
because OpenRouter's providers have real browsers.



## How this fits a PARA vault

This plugin is built for a vault organised by Tiago Forte's **PARA** method:

```
0. Inbox/      ← capture zone, processed by this plugin
  Links/       ← web resources (linkType: link)
  Media/       ← movies, books, games (linkType: media)
  Tasks/       ← action items (linkType: task)
  Research/    ← long-form investigation notes
  Reference/   ← curated reference material
  Handoffs/    ← agent-to-agent or agent-to-human handoff notes
  Dailies/     ← journal entries
  CLAUDE.md    ← plugin-specific classification context (read by the LLM)

1. Projects/   ← active outcomes (each project = one folder + v0.1/, v0.2/...)
2. Areas/      ← ongoing responsibilities (no finish line)
3. Resources/  ← reference material grouped by topic
4. Archive/    ← completed/dormant notes
5. System/     ← tooling, templates, agents, personas
```

### The flow

```
iOS Share Sheet
     │
     ▼
Obsidian iOS app / Shortcuts  ── appends raw links below the marker
     │
     ▼
0. Inbox/0. Inbox.md  (the iOS Share-Target section)
     │
     ▼   ctrl+shift+P / ribbon click / hotkey
Link Inbox Processor
     │
     ├── LLM classifies  → linkType + suggestedDestination
     ├── renders template by linkType
     └── writes note to   0. Inbox/Links/  (or Media/, Tasks/, or deeper PARA paths)
     │
     ▼
You process notes, tick `read` once acknowledged, tick `processed` when done.
Plugin can also scan subfolders and move "done" notes to their final PARA destination.
```

The plugin **never** writes directly into `1. Projects/`, `2. Areas/`, `3. Resources/`, `4. Archive/`, or `5. System/` based on LLM guesses alone — unless you enable `auto-move-to-destination` (planned, see [Roadmap](#roadmap)). The inbox stays the inbox.

### Allowed destination roots (configurable)

The LLM is constrained to suggest destinations under **only** the roots you whitelist in settings:

```
0. Inbox/      (default)
1. Projects/   (opt-in)
2. Areas/      (opt-in)
3. Resources/  (opt-in)
4. Archive/    (opt-in)
```

Anything else falls back to the slot's `defaultDestination`. This is a safety rail so a hallucinated path like `6. Misc/garbage` never creates a folder.

---

## Install

1. Make sure `0. Inbox/CLAUDE.md` exists (use the **Create if missing** button in settings to seed it).
2. Restart Obsidian (after copying the plugin files) and enable **Link Inbox Processor** in **Settings → Community Plugins**.
3. Set your OpenRouter API key in settings if you want LLM enrichment.

### From this repo

```bash
git clone https://github.com/BigHoss/obsidian-inboxprocessor-plugin.git
cd obsidian-inboxprocessor-plugin
npm install
npm run build
```

Copy `main.js`, `manifest.json`, `styles.css` to `<vault>/.obsidian/plugins/kuster-inbox-processor/`.

### Manual

Drop `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/kuster-inbox-processor/`, then enable the plugin in Obsidian settings.

### Distribution via BRAT (recommended for cross-device sync)

The repo is private. To install on every device and auto-update on every
`git push` to `main`, use **Obsidian42 - BRAT**:

1. Install **BRAT** from Community Plugins on each device.
2. Open BRAT settings → **Add Beta plugin** →
   `BigHoss/obsidian-inboxprocessor-plugin`.
3. BRAT will ask for a GitHub PAT if the repo is private. Generate one at
   <https://github.com/settings/tokens> (scope: `repo`). Paste it into
   BRAT's settings page (not the plugin entry — BRAT stores the token
   globally).
4. Enable **Link Inbox Processor** in **Settings → Community Plugins**.
5. Every push to `main` triggers a BRAT update on each device within ~1h.

No GitHub Releases needed — BRAT pulls `main.js` + `manifest.json` directly.

### Optional: GitHub Releases for versioned installs

A `.github/workflows/release.yml` Action runs on every push to `main`.
It uses [`standard-version`](https://github.com/conventional-changelog/standard-version)
to read commit messages, bump the version, generate `CHANGELOG.md`,
commit the bump, create the matching `vX.Y.Z` tag, push the tag, and
publish a GitHub Release with `main.js` + `manifest.json` + `styles.css`
attached. **Zero manual steps after the push.**

**Release flow:**

1. You commit your work to `main` with a Conventional Commits prefix
   (e.g. `feat:`, `fix:`, `chore:`, `BREAKING CHANGE:`).
2. You push `main` from your IDE.
3. The GH Action runs `standard-version`, which auto-detects the
   bump type from the commits since the last tag.
4. The Action pushes the resulting `chore(release): vX.Y.Z` commit
   and the `vX.Y.Z` tag back to `main`, then publishes the GitHub
   Release.

**Bump types and how to trigger them:**

| Bump | Trigger |
|---|---|
| patch | a `fix:` commit |
| minor | a `feat:` commit |
| major | a commit with `BREAKING CHANGE:` footer, OR a `feat!:` / `fix!:` prefix |

**Forcing a specific bump type:** when you don't want to write a
special commit, run the Action manually with the override:

1. Go to <https://github.com/BigHoss/obsidian-inboxprocessor-plugin/actions>
2. Click **Release** → **Run workflow** → main branch
3. Set the "releaseAs" dropdown to `patch` / `minor` / `major`
4. Click green **Run workflow**

The action runs `npx standard-version --release-as <type>` which forces
that bump regardless of commit messages.

**Pre-1.0 quirk:** for versions `0.x.y`, `standard-version` treats
`feat:` as **patch** (not minor) because pre-1.0 software is considered
"anything may change." Use the workflow_dispatch override or craft a
`BREAKING CHANGE:` commit to force the right bump.

**Note on `v0.4.1`:** the v0.4.1 release was created before the
`standard-version` flow existed, and the `versions.json` had a stray
`v0.4.1` entry (with the `v` prefix). The new flow's custom updater
in `scripts/obsidian-versions-updater.cjs` writes bare semver keys only.
The next release through the new pipeline cleans this up.

---

## Configuration

Open Obsidian → Settings → Link Inbox Processor.

### Vault paths
| Field | Default |
|---|---|
| Inbox file | `0. Inbox/0. Inbox.md` |
| Default template path | `5. System/Templates/Inbox/Link Template.md` |
| Share marker | `<!-- New iOS-shared links should land BELOW this comment -->` |

### Templates (one row per link-type)
Each link is classified by the LLM into one of these `linkType` values. The matching template is rendered.

Default rows:
- `link` → `5. System/Templates/Inbox/Link Template.md` → `0. Inbox/Links`
- `media` → `5. System/Templates/Inbox/Media Template.md` → `0. Inbox/Media`
- `task` → `5. System/Templates/Inbox/Task Template.md` → `0. Inbox/Tasks`

Add custom rows (e.g. `paper`, `video`, `shopping`) via the **+ Add link-type** button. Each row has a **Generate default template** button that drops a starter template at the path if no file exists there yet — never overwrites.

### Classification context (CLAUDE.md)
| Field | Default |
|---|---|
| Path | `0. Inbox/CLAUDE.md` |
| Allowed destination roots | `0. Inbox, 1. Projects, 2. Areas, 3. Resources, 4. Archive` |

The **Create if missing** button writes a starter `CLAUDE.md` describing your PARA layout, link-type catalogue, and tagging conventions. The LLM reads this as system context. Edit it freely — the plugin never overwrites it.

### OpenRouter LLM enrichment
| Field | Default |
|---|---|
| Enable LLM enrichment | `false` |
| OpenRouter API key | *(empty — get one at https://openrouter.ai/keys)* |
| OpenRouter model | `openrouter/auto-beta` (cheapest routing; switch to any model on https://openrouter.ai/models) |
| HTTP-Referer | `https://github.com/BigHoss/obsidian-inboxprocessor-plugin` |
| X-Title | `Link Inbox Processor` |

### Behavior
| Field | Default |
|---|---|
| Max links per run | `50` |
| Show per-link fetch notices | `true` |

### Failure log
Per-link failures are appended to a log file **outside the vault**:
- Windows: `%APPDATA%\Link Inbox Processor\process-failures.log`
- macOS: `~/Library/Application Support/Link Inbox Processor/process-failures.log`
- Linux: `$XDG_CONFIG_HOME/Link Inbox Processor/process-failures.log`
- Mobile: falls back to the plugin folder inside the vault

Use the **View** / **Clear** buttons in the Failure log section of settings to open or wipe it. Right-click the status-bar item for the same options.

### Notifications
| Field | Default |
|---|---|
| Notify on error | `false` |
| Notify URL | *(empty — apprise-shaped POST)* |

---

## Inbox checkbox convention (ADR-001)

Every note the plugin writes carries a 2-checkbox pair immediately after the title:

```markdown
- [ ] read #inbox/pending
- [ ] processed #inbox/processed
```

- `read` — you tick this when you've read the note
- `processed` — the plugin ticks this when it has finished with the note (moved it to its final PARA destination, or — for Media/Reference/Tasks — marked it as settled)

This is the convention locked by [`ADR-001`](https://github.com/BigHoss/obsidian-inboxprocessor-plugin) and documented at `5. System/Templates/Inbox/README - Inbox Templates.md`. The MSC / Homelab project `read / reviewed / handled` triplet does **not** apply to the inbox — it's project-scoped.

## Commands

- **Process inbox links now** — `Ctrl+Shift+P` (default). Process every line below the marker.
- **Process the link on the current line** — only the cursor's line.

A status-bar item shows pending count: `Inbox: 22 pending` or `Inbox: clean`. **Right-click it** for a context menu with: Process inbox now, Open inbox file, Refresh pending count, View failure log, Clear failure log. A ribbon icon (inbox) does the same as the hotkey.

---

## How it stays safe

- **Atomic inbox rewrite** — failed lines never leave the inbox. A crash mid-batch leaves the original file intact.
- **Idempotent** — `parseLine` skips malformed lines; rerunning never produces duplicates.
- **Obsidian-Sync friendly** — uses `app.vault.create` per file (atomic per-file) and one `vault.modify` for the inbox file.
- **No network on idle** — the plugin only fires when you trigger it (hotkey, ribbon, command). It does not poll.
- **Per-URL failure isolation** — a 4xx/5xx from one URL never blocks the others.
- **LLM destination validation** — anything the LLM returns outside `allowedDestinationRoots` falls back to the slot's default. No path traversal, no hallucinated folders.

---

## Templates

The plugin reuses whatever template you point each slot at. Supported placeholders:

| Placeholder | Replaced with |
|---|---|
| `{{title}}` | refined title (LLM) → `og:title` → markdown-link text → domain |
| `{{date:YYYYMMDDHHmmss}}` | compact stamp (used in filenames + frontmatter) |
| `{{date:YYYY-MM-DD HH:mm}}` | human-readable timestamp |
| `{{date:YYYY-MM-DDTHH:mm}}` | ISO-style (matches your existing templates) |
| `{{date:YYYY-MM-DD}}` | date only |
| `{{date}}` | full ISO timestamp |

The plugin also fills blank `destination:`, `url:`, and `tags: []` frontmatter lines so a generated note is never ambiguous.

---

## Roadmap

- [ ] **Auto-move on `processed`** — after the inbox pass, scan `0. Inbox/Links/`, `Media/`, `Tasks/`, `Research/` for notes whose `- [x] processed #inbox/processed` checkbox is ticked, then move them to their frontmatter `destination:` path. Dry-run by default; real move behind a second confirmation.
- [ ] **Bulk class-rebalance** — re-classify notes in a folder if you change the rules in `CLAUDE.md`.
- [ ] **Daily-note auto-processing** — pick up links pasted into today's daily note and route them through the same pipeline.
- [ ] **Capture status in inbox** — show a small per-line checkmark next to lines that the LLM already classified, so you don't reprocess them.

---

## Architecture choice

Replaces the **Option A: Pure filesystem polling** plan from the vault's `0. Inbox/Research/Inbox Processor Architecture.md` with a plugin that runs **inside Obsidian's process** and reacts to user actions rather than a host cron. No Docker, no cron, no Python container — just a single TypeScript file that ships with the repo.

## Known limitations

### Notebook Navigator (NN) — file right-click

The "Move to archive" and "Convert to project…" right-click commands
work in Obsidian's default file explorer, but **do not appear in
Notebook Navigator's right-click menu**. NN replaces Obsidian's file
tree with its own UI and does not fire the standard
`workspace.on('file-menu')` event that plugins hook into.

**Workaround:** open the file in an editor, then either:

1. Select text in the editor → right-click → "Create project from
   selection" (works because the editor-menu event fires)
2. Use the Command Palette (Ctrl/Cmd+P) → "Move to archive" or
   "Create project from selection" (works always)

A feature request to Notebook Navigator for a public context-menu
API is the only proper fix. Until then, NN users get the editor +
palette paths.

---

## License

MIT — see `LICENSE`.
