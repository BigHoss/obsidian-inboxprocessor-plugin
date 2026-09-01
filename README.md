# Kuster Inbox Processor

An Obsidian plugin that turns iOS-shared links into templated vault notes — atomic, idempotent, LLM-optional.

## What it does

Reads the iOS Share-Target block at the bottom of `0. Inbox/0. Inbox.md` (delimited by the marker comment), and for each link:

1. Parses `[title](url)` or bare URL
2. Fetches the page → extracts `og:title`, `og:description`, `og:image`, `og:site_name`
3. *(Optional)* Calls OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) for refined title + destination + tags — any model on the catalog, default `openai/gpt-5-mini`
4. Renders a note from `5. System/Templates/Inbox/Link Template.md`
5. Writes the note to `0. Inbox/Links/<YYYYMMDDHHmmss> - <Title>.md`
6. Atomically removes only the successfully-processed lines from the inbox file

Failed lines are kept in the inbox for the next run — eventual progress, never a stuck state.

## Install

### From disk (this repo)

```bash
git clone https://github.com/BigHoss/obsidian-inboxprocessor-plugin.git
cd obsidian-inboxprocessor-plugin
npm install
npm run build
```

Then in Obsidian:
1. Settings → Community Plugins → turn off Restricted Mode
2. Settings → Community Plugins → **Install plugin from disk** → pick this folder (or copy `main.js` + `manifest.json` + `styles.css` into `<vault>/.obsidian/plugins/kuster-inbox-processor/`)
3. Enable **Kuster Inbox Processor**
4. *(Optional)* Settings → Hotkeys → bind "Process inbox links now" — default is `Ctrl+Shift+P`

### Manual

Drop `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/kuster-inbox-processor/`, then enable the plugin in Obsidian settings.

## Configuration

Open Obsidian → Settings → Kuster Inbox Processor.

| Field | Default |
|---|---|
| Inbox file | `0. Inbox/0. Inbox.md` |
| Links directory | `0. Inbox/Links` |
| Template file | `5. System/Templates/Inbox/Link Template.md` |
| Share marker | `<!-- New iOS-shared links should land BELOW this comment -->` |
| Max links per run | `50` |
| Fetch timeout (s) | `10` |
| Enable LLM enrichment | `false` |
| OpenRouter API key | *(empty)* |
| OpenRouter model | `openai/gpt-5-mini` |
| HTTP-Referer | *(empty — recommended for free-tier rate limits)* |
| X-Title | `Kuster Inbox Processor` |
| Notify on error | `false` |
| Notify URL | *(empty — apprise-shaped POST)* |

## Commands

- **Process inbox links now** — `Ctrl+Shift+P` (default). Process every line below the marker.
- **Process the link on the current line** — only the cursor's line, regardless of position in the file.

A status-bar item shows pending count: `Inbox: 22 pending` or `Inbox: clean`. A ribbon icon (inbox) does the same as the hotkey.

## How it stays safe

- **Atomic inbox rewrite** — failed lines never leave the inbox. A crash mid-batch leaves the original file intact.
- **Idempotent** — `parseLine` skips malformed lines; rerunning never produces duplicates.
- **Obsidian-Sync friendly** — the plugin rewrites the inbox file in one `vault.modify` call after the batch is committed; the temp-file pattern is provided by Obsidian's adapter.
- **No network on idle** — the plugin only fires when you trigger it (hotkey, ribbon, status-bar, or `Ctrl+Shift+P`). It does not poll.
- **Per-URL failure isolation** — a 4xx/5xx from one URL never blocks the others.

## Template

The plugin reuses whatever template you point it at. `5. System/Templates/Inbox/Link Template.md` from your vault is the default. Supported placeholders:

- `{{date:YYYYMMDDHHmmss}}` — replaced in both frontmatter and filename
- `{{date:YYYY-MM-DD HH:mm}}` — human-readable timestamp
- `{{title}}` — refined title (LLM) → `og:title` → markdown-link text → domain

The plugin will additionally fill blank `URL:`, `destination:`, and `tags: []` lines so a generated note is never ambiguous.

## Architecture choice

Replaces the **Option A: Pure filesystem polling** plan from the vault's `0. Inbox/Research/Inbox Processor Architecture.md` with a plugin that runs **inside Obsidian's process** and reacts to user actions rather than a host cron. No Docker, no cron, no Python container — just a 350-line TypeScript plugin that ships with the repo.

## License

MIT — see `LICENSE`.
