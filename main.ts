/**
 * Link Inbox Processor
 * ------------------------
 * Reads 0. Inbox/0. Inbox.md, finds lines below the iOS Share-Target marker,
 * fetches og:title/og:description/og:image for each URL, renders a note
 * from the configured template, writes it to 0. Inbox/Links/ (or a per-type
 * destination), and atomically removes only the successfully-processed lines
 * from the inbox file.
 *
 * Atomic & idempotent: each line is processed independently; failures leave
 * the line in place for the next run. The inbox file is rewritten via a
 * temp-file + rename pattern to keep Obsidian Sync happy.
 */

import {
  App,
  ButtonComponent,
  Editor,
  MarkdownView,
  Menu,
  Modal,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  requestUrl,
  RequestUrlParam,
  Setting,
  TFile,
} from "obsidian";

// In-process project template scaffolder. Replaces the Python
// `init-project.py` shell-out path; the plugin imports this directly
// rather than spawning a subprocess.
import {
  plan as scaffoldPlan,
  scaffold as scaffoldProject,
  ScaffoldAction,
} from "./src/init-project";

// ============================================================================
// Settings
// ============================================================================

// One entry per "link-type". The LLM classifies each URL into one of these
// (by `linkType` value), and the plugin picks the matching template at render
// time. Defaults cover the three PARA subfolders in the inbox; users add
// more rows for custom types.
interface TemplateSlot {
  linkType: string;            // e.g. "link", "media", "task", "shopping"
  templatePath: string;        // vault-relative path to the .md template
  hint: string;                // sent to the LLM so it can classify correctly
  defaultDestination: string;  // folder the rendered note lands in, e.g. "0. Inbox/Links"
}

interface KusterInboxSettings {
  inboxFile: string;
  shareMarker: string;
  templates: TemplateSlot[];
  defaultTemplatePath: string; // fallback when LLM returns an unknown linkType
  // OpenRouter (https://openrouter.ai) — single endpoint, model-agnostic.
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterReferer: string;
  openrouterAppName: string;
  llmEnabled: boolean;
  // Optional CLAUDE.md inside the inbox — passed to the LLM as system context
  // so it knows your conventions. Created/seeded from settings; never
  // overwritten if it already exists.
  claudeContextPath: string;
  // Allowed root for LLM-suggested destinations. Anything outside fails closed
  // to the per-template defaultDestination. Paths are vault-relative.
  allowedDestinationRoots: string[];
  maxLinksPerRun: number;
  notifyOnError: boolean;
  notifyUrl: string;
  // Show a per-link "Fetching via LLM…" notice while the LLM is processing.
  showFetchNotices: boolean;
  // Cron-style automatic inbox processing. Off by default to avoid surprise.
  cronEnabled: boolean;
  cronIntervalMinutes: number;
  cronRunOnStartup: boolean;
  // Archive root — "Move to archive" mirrors source path under this folder.
  archiveRoot: string;
  // Project scaffold — reads subfolders of projectsRoot/ at modal-open time.
  projectsRoot: string;
  // Vault-relative path to init-project.py (the Python scaffolding tool).
  templateScriptPath: string;
  // Debug mode — when on, every console.log/info/warn/error call
  // (including the ones in catch blocks) also gets written to
  // debug.log in the plugin's app-data directory. Off by default;
  // turn on for triage / bug reports.
  debugEnabled: boolean;
}

const DEFAULT_SETTINGS: KusterInboxSettings = {
  inboxFile: "0. Inbox/0. Inbox.md",
  shareMarker: "<!-- New iOS-shared links should land BELOW this comment -->",
  templates: [
    {
      linkType: "link",
      templatePath: "5. System/Templates/Inbox/Link Template.md",
      hint: "Web articles, tools, tutorials, repos, blog posts — anything read-once.",
      defaultDestination: "0. Inbox/Links",
    },
    {
      linkType: "media",
      templatePath: "5. System/Templates/Inbox/Media Template.md",
      hint: "Movies, TV shows, books, games, podcasts, albums — anything to watch/read/play later.",
      defaultDestination: "0. Inbox/Media",
    },
    {
      linkType: "task",
      templatePath: "5. System/Templates/Inbox/Task Template.md",
      hint: "Action items, to-dos, things to fix or set up — anything that needs doing.",
      defaultDestination: "0. Inbox/Tasks",
    },
  ],
  defaultTemplatePath: "5. System/Templates/Inbox/Link Template.md",
  openrouterApiKey: "",
  openrouterModel: "openrouter/auto-beta",
  openrouterReferer: "https://github.com/BigHoss/obsidian-inboxprocessor-plugin",
  openrouterAppName: "Link Inbox Processor",
  llmEnabled: false,
  claudeContextPath: "0. Inbox/CLAUDE.md",
  allowedDestinationRoots: [
    "0. Inbox",
    "1. Projects",
    "2. Areas",
    "3. Resources",
    "4. Archive",
  ],
  maxLinksPerRun: 50,
  notifyOnError: false,
  notifyUrl: "",
  showFetchNotices: true,
  cronEnabled: false,
  cronIntervalMinutes: 15,
  cronRunOnStartup: false,
  archiveRoot: "4. Archive",
  projectsRoot: "1. Projects",
  templateScriptPath: "5. System/Templates/Project Folder Template/scripts/init-project.py",
  debugEnabled: false,
};

// ============================================================================
// Types
// ============================================================================

interface ParsedLine {
  title: string | null;
  url: string;
  raw: string;
}

// The LLM does all fetching (it has its own web-fetch / browser tools via
// OpenRouter). We pass the URL and let the model read the page itself. The
// response includes everything we used to scrape out of og:tags.
interface LlmEnrichment {
  refinedTitle: string;
  suggestedDestination: string;
  suggestedTags: string[];
  linkType: string;          // one of the configured TemplateSlot.linkType values
  description: string;       // short summary the LLM read off the page
  siteName: string;          // publisher / domain the LLM read off the page
}

// Read the CLAUDE.md context file if it exists. Returns empty string if not
// found or unreadable. Never throws — the plugin must keep working even if
// the user hasn't created the file yet.
async function readClaudeContext(
  app: App,
  path: string,
): Promise<string> {
  const f = app.vault.getAbstractFileByPath(path);
  if (!(f instanceof TFile)) return "";
  try {
    return await app.vault.cachedRead(f);
  } catch {
    return "";
  }
}

// Returns true if `dest` starts with one of the allowed roots. Fails closed.
function isDestinationAllowed(
  dest: string,
  allowedRoots: string[],
): boolean {
  if (!dest) return false;
  // Normalize: strip leading "./" or "/", no trailing slash
  const norm = dest.replace(/^\.?\//, "").replace(/\/+$/, "");
  return allowedRoots.some((root) => {
    const r = root.replace(/\/+$/, "");
    return norm === r || norm.startsWith(r + "/");
  });
}

// ============================================================================
// Line parsing
// ============================================================================

const RE_MD_LINK = /^\s*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s*$/;
const RE_BARE_URL = /^(?:https?:\/\/)?(?:[\w-]+\.)+[\w-]+(?:\/[^\s)]*)?/i;

function parseLine(line: string): ParsedLine | null {
  const md = line.match(RE_MD_LINK);
  if (md) {
    return { title: md[1].trim(), url: md[2].trim(), raw: line };
  }
  const bare = line.match(RE_BARE_URL);
  if (bare) {
    let url = bare[0];
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    return { title: null, url, raw: line };
  }
  return null;
}

// Strip filesystem-hostile characters from a candidate filename.
function sanitizeFilename(s: string): string {
  return s
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// Humanize a title the LLM or iOS Share Sheet produced. Strips site suffixes
// (" | GitHub", " — Reddit", " - YouTube"), trailing parenthetical groups
// (" (post)"), bracket-wrapped site names ("[thingiverse.com]"), emojis,
// multiple whitespace, query-string-looking cruft, and truncates at the last
// word boundary under 100 chars. Pure function — no side effects.
function cleanTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim();

  // If the whole title is wrapped in ONE matching bracket pair, unwrap it.
  // Handles "[thingiverse thing]" → "thingiverse thing". Repeated until no
  // more wrapping brackets — catches "[[nested]]" too.
  let prev = "";
  while (prev !== s) {
    prev = s;
    const m = s.match(/^\s*([\[\{\(])\s*(.+?)\s*([\]\}\)])\s*$/);
    if (m && m[1] === "[" && m[3] === "]") s = m[2];
    else if (m && m[1] === "(" && m[3] === ")") s = m[2];
    else if (m && m[1] === "{" && m[3] === "}") s = m[2];
  }

  // Drop query-string-style fragments anywhere.
  s = s.replace(/\?[^\s]*/g, "");

  // Drop emoji (basic surrogate-pair range + common unicode blocks).
  s = s.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu,
    "",
  );

  // Site-suffix stripper: " | GitHub", " - Reddit", " — Printables", etc.
  // Anchored at end-of-string only so it doesn't gut middle content.
  s = s.replace(
    /\s*[\|—–\-]\s*(github|reddit|printables|thingiverse|youtube|twitter|x|imdb|hacker\s*news|medium|stackoverflow|stack\s*overflow|producthunt|ycombinator)\.?(com)?\s*$/i,
    "",
  );

  // Collapse multiple spaces.
  s = s.replace(/\s+/g, " ").trim();

  // Truncate at last word boundary under 100 chars.
  if (s.length > 100) {
    const cut = s.slice(0, 100);
    const lastSpace = cut.lastIndexOf(" ");
    s = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
    s = s.trim();
  }
  return s;
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

// ============================================================================
// OpenRouter LLM enrichment — the LLM does all page fetching via its own
// web-search / browser tool. We never call requestUrl on the destination URL.
// ============================================================================

async function enrichWithLlm(
  app: App,
  settings: KusterInboxSettings,
  url: string,
): Promise<LlmEnrichment | null> {
  if (!settings.llmEnabled || !settings.openrouterApiKey) return null;

  // Build the catalogue of linkTypes + allowed destination roots so the LLM
  // is constrained to safe choices.
  const typeList = settings.templates
    .map((t) => `- "${t.linkType}": ${t.hint} (default: ${t.defaultDestination})`)
    .join("\n");
  const allowed = settings.allowedDestinationRoots.join(", ");

  const claudeContext = await readClaudeContext(app, settings.claudeContextPath);

  const systemPrompt =
    `You classify URLs for an Obsidian PARA vault. The vault has these PARA folders:\n` +
    `0. Inbox (capture zone), 1. Projects (active outcomes), 2. Areas (ongoing responsibilities),\n` +
    `3. Resources (reference material), 4. Archive (completed/dormant). Within 0. Inbox there are\n` +
    `subfolders: Links/, Media/, Tasks/, Research/, Reference/, Decision Records/, Handoffs/, Dailies/.\n\n` +
    `Allowed destination roots: ${allowed}.\n` +
    `Never return a destination outside these roots — if uncertain, return one of the link-type defaults.\n\n` +
    `Available link-types:\n${typeList}\n\n` +
    (claudeContext
      ? `## User's classification context (from 0. Inbox/CLAUDE.md)\n\n${claudeContext}\n\n`
      : "") +
    `## Page fetching\n` +
    `Use your web-fetch / web-search / browser tool to read the URL yourself. If your tool surface does\n` +
    `not include a fetch capability, fall back to whatever you can infer from the URL alone (domain +\n` +
    `path) and set description / siteName to empty strings.\n\n` +
    `Return ONLY a JSON object with these fields:\n` +
    `- refinedTitle: 3-7 words, Title Case, human-readable (use the page's H1 or <title> if you fetched it)\n` +
    `- linkType: one of the link-type strings above (e.g. "link", "media", "task")\n` +
    `- suggestedDestination: vault-relative path under one of the allowed roots, e.g. "3. Resources/AI" or "0. Inbox/Tasks"\n` +
    `- suggestedTags: array of 2-5 lower-case tags\n` +
    `- description: 1-2 sentence summary of what the page is about (empty string if you could not fetch)\n` +
    `- siteName: the publisher / domain (e.g. "github.com", empty string if you could not fetch)\n\n` +
    `No prose, no code fences.`;

  const userPrompt = `URL: ${url}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openrouterApiKey}`,
    };
    if (settings.openrouterReferer) headers["HTTP-Referer"] = settings.openrouterReferer;
    if (settings.openrouterAppName) headers["X-Title"] = settings.openrouterAppName;

    const body: RequestUrlParam = {
      url: "https://openrouter.ai/api/v1/chat/completions",
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.openrouterModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
      }),
      throw: false,
    };
    appendDebugLog(
      app,
      ".obsidian/plugins/kuster-inbox-processor",
      "DEBUG",
      `enrichWithLlm request: url=${url}, model=${settings.openrouterModel}`,
      settings.debugEnabled,
    );
    const r = await requestUrl(body);
    appendDebugLog(
      app,
      ".obsidian/plugins/kuster-inbox-processor",
      "DEBUG",
      `enrichWithLlm response: status=${r.status}, body=${(r.text ?? "").slice(0, 200)}`,
      settings.debugEnabled,
    );
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`OpenRouter HTTP ${r.status}`);
    }
    const text = r.json?.choices?.[0]?.message?.content ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) {
      throw new Error("LLM returned no JSON in response");
    }
    const parsed = JSON.parse(json);

    // Resolve linkType against configured slots. Defensive guard:
    // if templates is undefined / non-array (partial data.json), fall
    // back to an empty slot rather than crashing the LLM enrichment.
    const requestedType = String(parsed.linkType ?? "").trim();
    const templates = Array.isArray(settings.templates) && settings.templates.length > 0
      ? settings.templates
      : [];
    const slot =
      templates.find((t) => t.linkType === requestedType) ??
      templates[0];
    if (!slot) {
      // No templates at all — can't continue.
      throw new Error("No templates configured; can't classify link");
    }

    // Validate destination — if LLM gave something unsafe, fall back to the
    // slot's defaultDestination.
    const requestedDest = String(parsed.suggestedDestination ?? "").trim();
    const safeDest = isDestinationAllowed(requestedDest, settings.allowedDestinationRoots)
      ? requestedDest
      : slot.defaultDestination;

    appendDebugLog(
      app,
      ".obsidian/plugins/kuster-inbox-processor",
      "DEBUG",
      `enrichWithLlm ok: url=${url}, type=${slot.linkType}, dest=${safeDest}`,
      settings.debugEnabled,
    );

    return {
      refinedTitle: String(parsed.refinedTitle ?? parsed.title ?? "Untitled").trim(),
      suggestedDestination: safeDest,
      suggestedTags: Array.isArray(parsed.suggestedTags)
        ? parsed.suggestedTags
            .map((t: unknown) => String(t).toLowerCase().trim())
            .filter(Boolean)
        : [],
      linkType: slot.linkType,
      description: String(parsed.description ?? "").trim(),
      siteName: String(parsed.siteName ?? "").trim(),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendDebugLog(
      app,
      ".obsidian/plugins/kuster-inbox-processor",
      "ERROR",
      `enrichWithLlm failed: url=${url} — ${msg}`,
      settings.debugEnabled,
    );
    throw new Error(`LLM enrichment failed: ${msg}`);
  }
}

// ============================================================================
// Render note from template
// ============================================================================

function renderNote(
  template: string,
  title: string,
  url: string,
  llm: LlmEnrichment | null,
  stamp: string,
  destination: string,
): string {
  const finalTitle = llm?.refinedTitle ?? title ?? "Untitled Link";
  const tags = llm?.suggestedTags ?? [];

  // Build all the {{date:...}} placeholders the templates use.
  // - {{date:YYYYMMDDHHmmss}}        → compact stamp for filenames + frontmatter
  // - {{date:YYYY-MM-DD HH:mm}}      → human-readable (replaces "T" with " ")
  // - {{date:YYYY-MM-DDTHH:mm}}      → ISO style used by existing templates
  // - {{date:YYYY-MM-DD}}            → date-only
  // - {{date}}                       → full ISO
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const compactStamp = stamp;
  const dateDashTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const isoLike = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dateOnly = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let out = template
    .replace(/\{\{date:YYYYMMDDHHmmss\}\}/g, compactStamp)
    .replace(/\{\{date:YYYY-MM-DD HH:mm\}\}/g, dateDashTime)
    .replace(/\{\{date:YYYY-MM-DDTHH:mm\}\}/g, isoLike)
    .replace(/\{\{date:YYYY-MM-DD\}\}/g, dateOnly)
    .replace(/\{\{title\}\}/g, finalTitle);

  // Fill in blank `destination:`, `url:`, and `tags: []` lines if the
  // template uses them. Otherwise prepend a small metadata block.
  if (/^destination:\s*$/m.test(out)) {
    out = out.replace(/^destination:\s*$/m, `destination: "${destination}"`);
  }
  if (/^url:\s*$/m.test(out)) {
    out = out.replace(/^url:\s*$/m, `url: ${url}`);
  }
  if (/^tags:\s*\[\]\s*$/m.test(out)) {
    out = out.replace(/^tags:\s*\[\]\s*$/m, `tags: [${tags.join(", ")}]`);
  }
  // Also fill a `URL: ` blank line in the body if template uses it
  if (/^(\s*-\s*)?URL:\s*$/m.test(out)) {
    out = out.replace(/^(\s*-\s*)?URL:\s*$/m, `$1URL: ${url}`);
  }
  return out;
}

// Replace all `{{date:...}}` placeholders in a string with their
// runtime-rendered values, using the supplied compact stamp for the
// `YYYYMMDDHHmmss` form. `{{title}}` is intentionally left as-is —
// reprocessed notes aren't authored to have a title, so leaving the
// placeholder visible tells the user to set the title themselves.
//
// This is a smaller helper than `renderNote`: it doesn't fill in
// destination / url / tags / URL lines (those are LLM-driven and
// already handled by `spliceFields` in the reprocessor). It's only
// here so that `{{date:YYYYMMDDHHmmss}}` placeholders left over
// from the template don't end up as literal strings in reprocessed
// notes.
function renderDatePlaceholders(text: string, stamp: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateDashTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const isoLike = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const dateOnly = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return text
    .replace(/\{\{date:YYYYMMDDHHmmss\}\}/g, stamp)
    .replace(/\{\{date:YYYY-MM-DD HH:mm\}\}/g, dateDashTime)
    .replace(/\{\{date:YYYY-MM-DDTHH:mm\}\}/g, isoLike)
    .replace(/\{\{date:YYYY-MM-DD\}\}/g, dateOnly);
}

// ============================================================================
// Telegram notify (apprise-shaped POST)
// ============================================================================

async function notifyError(settings: KusterInboxSettings, msg: string): Promise<void> {
  if (!settings.notifyOnError || !settings.notifyUrl) return;
  try {
    await requestUrl({
      url: settings.notifyUrl,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Link Inbox Processor", body: msg }),
      throw: false,
    });
  } catch {
    /* swallow */
  }
}

// ============================================================================
// Main plugin
// ============================================================================

export default class KusterInboxPlugin extends Plugin {
  settings: KusterInboxSettings = DEFAULT_SETTINGS;
  private statusBarEl: HTMLElement | null = null;
  private cronIntervalId: number | null = null;
  private lastRunAt: number | null = null;

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Defensive: a partial data.json migration or a manual edit can leave
    // `templates` undefined or non-array. The original bug (minified
    // "p is not iterable" from the v0.4 plan) is exactly that — `for...of
    // undefined` — and was the worst kind of silent crash. Restore the
    // defaults and surface a Notice so the user knows their config was
    // bad rather than the plugin failing on every command.
    if (!Array.isArray(this.settings.templates) || this.settings.templates.length === 0) {
      this.settings.templates = DEFAULT_SETTINGS.templates.slice();
      await this.saveData(this.settings);
      new Notice(
        "Templates settings were invalid (empty / non-array). Restored to defaults — please review in Settings.",
        10000,
      );
    }

    this.addRibbonIcon("inbox", "Process inbox now", () => this.processInbox());

    // Command palette + hotkey
    this.addCommand({
      id: "process-inbox",
      name: "Process inbox links now",
      hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "P" }],
      callback: () => this.processInbox(),
    });

    // Command: process current line under cursor
    this.addCommand({
      id: "process-current-line",
      name: "Process the link on the current line",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        const line = editor.getLine(editor.getCursor().line);
        void this.processSingleLine(line);
      },
    });

    // Command: create project from selection (reads projectsRoot/<Type>/
    // subfolders live from vault; shells out to init-project.py).
    this.addCommand({
      id: "create-project-from-selection",
      name: "Create project from selection",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        try {
          const selection = editor.getSelection();
          await this.createProjectFromSelection(selection);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.pluginLog(
            "ERROR",
            `create-project-from-selection failed: ${msg}`,
          );
          new Notice(`Create project failed: ${msg}`, 15000);
        }
      },
    });

    // Command: move the current file to archive (mirrors source path under
    // <archiveRoot>/). Adds `archivedAt` to frontmatter.
    this.addCommand({
      id: "move-to-archive",
      name: "Move to archive (with archivedAt timestamp)",
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const ok = f instanceof TFile && !f.path.startsWith(this.settings.archiveRoot + "/");
        if (checking) return ok;
        if (ok) void this.moveToArchive(f as TFile);
      },
    });

    // File-menu hook — injects "Move to archive" into the right-click menu
    // for any file that isn't already in the archive root.
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile)) return;
        if (file.path.startsWith(this.settings.archiveRoot + "/")) return;

        // "Convert to project" — file-menu variant. Reads the file content
        // and passes it as the initial plan seed (instead of an editor
        // selection, which doesn't apply in the file explorer context).
        menu.addItem((item) =>
          item
            .setTitle("Convert to project…")
            .setIcon("folder-plus")
            .onClick(async () => {
              try {
                const content = await this.app.vault.cachedRead(file);
                await this.createProjectFromSelection(content);
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                // Both: persistent Notice (so the user sees what failed)
                // and pluginLog ERROR (so the developer can debug — also
                // goes to debug.log when settings.debugEnabled is on).
                // Notice auto-dismisses after 15s — longer than usual so
                // it's not missed.
                this.pluginLog(
                  "ERROR",
                  `convert-to-project failed: ${msg}`,
                );
                new Notice(`Convert to project failed: ${msg}`, 15000);
              }
            }),
        );

        menu.addItem((item) =>
          item
            .setTitle("Move to archive (with archivedAt timestamp)")
            .setIcon("archive")
            .onClick(async () => {
              await this.moveToArchive(file);
            }),
        );
      }),
    );

    // Command: check projects against templates — shows a modal listing
    // misaligned projects (v0.5 template) and lets the user apply fixes
    // per-project via the in-process TypeScript scaffolder.
    this.addCommand({
      id: "check-projects-against-templates",
      name: "Check projects against templates",
      callback: async () => {
        const basePath = this.app.vault.adapter.basePath.replace(/[/\\]+$/, "");
        const sep = basePath.includes("\\") ? "\\" : "/";
        const misalignments = await scanProjectsAgainstTemplate(
          this.app, this.settings,
        );
        await new Promise<void>((resolve) => {
          new ProjectCheckModal(this.app, {
            misalignments,
            basePath,
            sep,
            onDone: () => resolve(),
          }).open();
        });
        this.refreshStatusBar();
      },
    });

    // Command: reprocess inbox subdirectory notes — fills missing
    // frontmatter fields via LLM, trashes notes that can't be filled.
    this.addCommand({
      id: "reprocess-inbox-subdirectories",
      name: "Reprocess inbox subdirectory notes",
      callback: async () => {
        if (!this.settings.llmEnabled || !this.settings.openrouterApiKey) {
          new Notice(
            "Enable OpenRouter LLM enrichment in settings first (needs API key + LLM enabled).",
            10000,
          );
          return;
        }
        const onProgress = (msg: string) =>
          new Notice(`Reprocess: ${msg}`, 2500);
        try {
          const result = await reprocessInboxSubdirs(
            this.app, this.settings, onProgress,
          );
          new Notice(
            `Inbox reprocess done: ${result.processed} processed, ${result.skipped} already complete, ${result.failed} failed, ${result.trashed} trashed (missing irrecoverable fields).`,
            12000,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.pluginLog("ERROR", `reprocess failed: ${msg}`);
          new Notice(`Reprocess failed: ${msg}`, 15000);
        }
        this.refreshStatusBar();
      },
    });

    this.addSettingTab(new KusterInboxSettingTab(this.app, this));

    // Status bar — pending count, with a right-click context menu
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText("Inbox: …");
    this.statusBarEl.addEventListener("contextmenu", (e) => {
      const ev = e as MouseEvent;
      ev.preventDefault();
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle("Process inbox now")
          .setIcon("inbox")
          .onClick(() => this.processInbox()),
      );
      menu.addItem((item) =>
        item
          .setTitle("Open inbox file")
          .setIcon("file-text")
          .onClick(async () => {
            const f = this.resolveFile(this.settings.inboxFile);
            if (f) await this.app.workspace.getLeaf(false).openFile(f);
            else new Notice("Inbox file not found");
          }),
      );
      menu.addItem((item) =>
        item
          .setTitle("Refresh pending count")
          .setIcon("refresh-cw")
          .onClick(() => this.refreshStatusBar()),
      );
      menu.addSeparator();
      // Project-template check + reprocess — discoverable from the status
      // bar so NN users (no file-menu event) can find them.
      menu.addItem((item) =>
        item
          .setTitle("Check projects against templates")
          .setIcon("check-circle")
          .onClick(async () => {
            const basePath = this.app.vault.adapter.basePath.replace(/[/\\]+$/, "");
            const sep = basePath.includes("\\") ? "\\" : "/";
            const misalignments = await scanProjectsAgainstTemplate(
              this.app, this.settings,
            );
            await new Promise<void>((resolve) => {
              new ProjectCheckModal(this.app, {
                misalignments,
                basePath,
                sep,
                onDone: () => resolve(),
              }).open();
            });
          }),
      );
      menu.addItem((item) =>
        item
          .setTitle("Reprocess inbox subdirectory notes")
          .setIcon("refresh-ccw")
          .onClick(async () => {
            if (!this.settings.llmEnabled || !this.settings.openrouterApiKey) {
              new Notice(
                "Enable OpenRouter LLM enrichment in settings first.",
                10000,
              );
              return;
            }
            try {
              const onProgress = (msg: string) =>
                new Notice(`Reprocess: ${msg}`, 2500);
              const result = await reprocessInboxSubdirs(
                this.app, this.settings, onProgress,
              );
              new Notice(
                `Reprocess: ${result.processed} processed, ${result.skipped} complete, ${result.failed} failed, ${result.trashed} trashed.`,
                12000,
              );
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              this.pluginLog("ERROR", `reprocess failed: ${msg}`);
              new Notice(`Reprocess failed: ${msg}`, 15000);
            }
          }),
      );
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle("View failure log")
          .setIcon("file-warning")
          .onClick(async () => {
            const text = await readFailureLog(this.app, this.manifest.dir);
            if (text === null) {
              new Notice("No failures recorded yet");
              return;
            }
            const dir = await pluginDataDir(this.app, this.manifest.dir);
            await this.app.workspace.openLinkText(`${dir}/process-failures.log`, "", false);
          }),
      );
      menu.addItem((item) =>
        item
          .setTitle("Clear failure log")
          .setIcon("trash")
          .onClick(async () => {
            const cleared = await clearFailureLog(this.app, this.manifest.dir);
            new Notice(cleared ? "Failure log cleared" : "Nothing to clear");
          }),
      );
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle("View debug log")
          .setIcon("file-cog")
          .onClick(async () => {
            const text = await readDebugLog(this.app, this.manifest.dir);
            if (text === null) {
              new Notice(
                "Debug log is empty (or debug mode is off and no entries yet).",
                5000,
              );
              return;
            }
            const dir = await pluginDataDir(this.app, this.manifest.dir);
            const logPath = `${dir}/debug.log`;
            await this.app.workspace.openLinkText(logPath, "", false);
          }),
      );
      menu.addItem((item) =>
        item
          .setTitle("Clear debug log")
          .setIcon("eraser")
          .onClick(async () => {
            const cleared = await clearDebugLog(this.app, this.manifest.dir);
            new Notice(cleared ? "Debug log cleared" : "Nothing to clear");
          }),
      );
      menu.showAtMouseEvent(ev);
    });
    this.app.workspace.onLayoutReady(() => this.refreshStatusBar());

    this.registerEvent(
      this.app.workspace.on("file-open", () => this.refreshStatusBar()),
    );
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (f.path === this.settings.inboxFile) this.refreshStatusBar();
      }),
    );

    // Cron-style automatic inbox processing. Off by default — user must
    // opt in. If enabled, register an interval that calls processInbox
    // silently. Reload Obsidian after changing cron settings (no live
    // re-registration — keeps the registration path simple).
    if (this.settings.cronEnabled) {
      this.applyCron();
      if (this.settings.cronRunOnStartup) {
        // Fire-and-forget; doesn't block onload.
        void this.processInbox({ silent: true });
      }
    }
  }

  // Register (or clear) the cron interval based on current settings.
  private applyCron(): void {
    if (this.cronIntervalId !== null) {
      window.clearInterval(this.cronIntervalId);
      this.cronIntervalId = null;
    }
    if (!this.settings.cronEnabled) return;
    const ms = Math.max(1, this.settings.cronIntervalMinutes) * 60 * 1000;
    this.cronIntervalId = window.setInterval(() => {
      void this.processInbox({ silent: true });
    }, ms);
  }

  onunload(): void {
    this.statusBarEl?.remove();
  }

  async refreshStatusBar(): Promise<void> {
    if (!this.statusBarEl) return;
    const count = await this.countPending();
    const pending = count > 0 ? `${count} pending` : "clean";
    const lastRun =
      this.lastRunAt !== null
        ? ` (last: ${formatHm(new Date(this.lastRunAt))})`
        : "";
    this.statusBarEl.setText(`Inbox: ${pending}${lastRun}`);
  }

  /**
   * Write to console + (when settings.debugEnabled) append to debug.log.
   * Safe to call from anywhere; never throws.
   */
  pluginLog(level: DebugLevel, msg: string): void {
    try {
      // Mirror to console unconditionally — Obsidian's console is always
      // available and that's where you'll see it during development.
      console[level === "DEBUG" ? "debug" : level === "INFO" ? "info" : level === "WARN" ? "warn" : "error"](msg);
      if (this.settings.debugEnabled) {
        // Fire-and-forget; appendDebugLog swallows its own errors and
        // short-circuits when debug mode is off.
        void appendDebugLog(
          this.app,
          this.manifest.dir,
          level,
          msg,
          this.settings.debugEnabled,
        );
      }
    } catch {
      // Never let logging take down the host command.
    }
  }

  async countPending(): Promise<number> {
    const file = this.resolveFile(this.settings.inboxFile);
    if (!file) return 0;
    const raw = await this.app.vault.read(file);
    const idx = raw.indexOf(this.settings.shareMarker);
    if (idx === -1) return 0;
    const below = raw.slice(idx + this.settings.shareMarker.length);
    return below
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && parseLine(l) !== null).length;
  }

  private resolveFile(path: string): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(path);
    return f instanceof TFile ? f : null;
  }

  async processInbox(opts?: { silent?: boolean }): Promise<void> {
    const silent = opts?.silent === true;
    const file = this.resolveFile(this.settings.inboxFile);
    if (!file) {
      new Notice(`Inbox file not found: ${this.settings.inboxFile}`);
      return;
    }
    const raw = await this.app.vault.read(file);
    const markerIdx = raw.indexOf(this.settings.shareMarker);
    if (markerIdx === -1) {
      new Notice(`Share marker not found in ${this.settings.inboxFile}`);
      return;
    }
    const head = raw.slice(0, markerIdx + this.settings.shareMarker.length);
    const below = raw.slice(markerIdx + this.settings.shareMarker.length);

    const lines = below
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    this.pluginLog(
      "INFO",
      `processInbox start: file=${this.settings.inboxFile}, ${lines.length} line(s) below marker, cap=${this.settings.maxLinksPerRun}, llm=${this.settings.llmEnabled ? "on" : "off"}`,
    );

    if (lines.length === 0) {
      new Notice("Inbox is clean — no links to process");
      this.refreshStatusBar();
      return;
    }

    // Pre-load all configured templates. Belt-and-braces with the
    // onload() guard above: if a race / partial state ever leaves
    // settings.templates as undefined or non-array here, fall back to
    // the defaults rather than crashing the whole command.
    const templates = Array.isArray(this.settings.templates) && this.settings.templates.length > 0
      ? this.settings.templates
      : DEFAULT_SETTINGS.templates;
    const templatesByType = new Map<string, string>();
    for (const slot of templates) {
      const tf = this.resolveFile(slot.templatePath);
      if (tf) templatesByType.set(slot.linkType, await this.app.vault.read(tf));
    }
    const defaultTemplateFile = this.resolveFile(this.settings.defaultTemplatePath);
    const defaultTemplate = defaultTemplateFile
      ? await this.app.vault.read(defaultTemplateFile)
      : DEFAULT_TEMPLATE;

    const processedLines: string[] = [];
    const survivors: string[] = [];
    let okCount = 0;
    let skipCount = 0;
    let failCount = 0;
    let aborted = false;
    const cap = Math.min(lines.length, this.settings.maxLinksPerRun);

    for (let i = 0; i < cap; i++) {
      const line = lines[i];
      const parsed = parseLine(line);
      if (!parsed) {
        this.pluginLog(
          "DEBUG",
          `processInbox skip unparseable line ${i + 1}/${cap}: ${line.slice(0, 80)}`,
        );
        survivors.push(line);
        continue;
      }
      this.pluginLog(
        "DEBUG",
        `processInbox line ${i + 1}/${cap} parsed: url=${parsed.url}, title=${parsed.title ?? "(none)"}`,
      );
      try {
        const onProgress =
          this.settings.showFetchNotices && !silent
            ? (msg: string) => new Notice(`Inbox: ${i + 1}/${cap} — ${msg}`, 3000)
            : undefined;
        const result = await this.processOne(parsed, templatesByType, defaultTemplate, onProgress);
        if (result === null) {
          // user chose Skip — link stays in inbox for next run
          this.pluginLog("INFO", `processInbox line ${i + 1}/${cap}: user skipped ${parsed.url}`);
          survivors.push(line);
          skipCount++;
        } else if (typeof result === "object" && "abort" in result) {
          // user chose Abort — stop the entire batch here
          this.pluginLog("INFO", `processInbox line ${i + 1}/${cap}: user aborted at ${parsed.url}`);
          for (let j = i; j < cap; j++) survivors.push(lines[j]);
          for (let j = cap; j < lines.length; j++) survivors.push(lines[j]);
          aborted = true;
          break;
        } else {
          this.pluginLog("INFO", `processInbox line ${i + 1}/${cap}: created ${result}`);
          processedLines.push(line);
          okCount++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!silent) new Notice(`✗ ${parsed.url} — ${msg}`, 8000);
        survivors.push(line);
        failCount++;
        await appendFailureLog(this.app, this.manifest, parsed.url, msg);
        this.pluginLog("ERROR", `processInbox line ${i + 1}/${cap}: ${parsed.url} — ${msg}`);
        await notifyError(this.settings, `Failed: ${parsed.url}\n${msg}`);
      }
    }
    if (!aborted) {
      for (let i = cap; i < lines.length; i++) survivors.push(lines[i]);
    }

    const tail = survivors.length > 0 ? "\n" + survivors.join("\n") + "\n" : "\n";
    const updated = head + tail;
    await this.app.vault.modify(file, updated);

    this.lastRunAt = Date.now();
    this.pluginLog(
      "INFO",
      `processInbox done: ok=${okCount}, skipped=${skipCount}, failed=${failCount}, deferred=${aborted ? 0 : Math.max(0, lines.length - cap)}, aborted=${aborted}`,
    );
    if (!silent) {
      new Notice(
        `Inbox: ${okCount} processed, ${skipCount} skipped, ${failCount} kept for retry${
          cap < lines.length && !aborted ? `, ${lines.length - cap} deferred` : ""
        }${aborted ? " (aborted)" : ""}`,
      );
    }
    this.refreshStatusBar();
  }

  async processSingleLine(line: string): Promise<void> {
    const parsed = parseLine(line.trim());
    if (!parsed) {
      new Notice("Current line is not a recognized link");
      return;
    }
    const templates = Array.isArray(this.settings.templates) && this.settings.templates.length > 0
      ? this.settings.templates
      : DEFAULT_SETTINGS.templates;
    const templatesByType = new Map<string, string>();
    for (const slot of templates) {
      const tf = this.resolveFile(slot.templatePath);
      if (tf) templatesByType.set(slot.linkType, await this.app.vault.read(tf));
    }
    const defaultTemplateFile = this.resolveFile(this.settings.defaultTemplatePath);
    const defaultTemplate = defaultTemplateFile
      ? await this.app.vault.read(defaultTemplateFile)
      : DEFAULT_TEMPLATE;
    try {
      const onProgress = this.settings.showFetchNotices
        ? (msg: string) => new Notice(msg, 3000)
        : undefined;
      const result = await this.processOne(parsed, templatesByType, defaultTemplate, onProgress);
      if (result === null) {
        new Notice("Skipped duplicate");
      } else if (typeof result === "object" && "abort" in result) {
        new Notice("Aborted");
      } else {
        new Notice(`✓ ${result}`);
      }
      this.refreshStatusBar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(`✗ ${parsed.url} — ${msg}`, 8000);
      await appendFailureLog(this.app, this.manifest, parsed.url, msg);
    }
  }

  private async processOne(
    parsed: ParsedLine,
    templatesByType: Map<string, string>,
    defaultTemplate: string,
    onProgress?: (msg: string) => void,
  ): Promise<string | null | { abort: true }> {
    // 1. Optional LLM enrichment — the LLM fetches the URL itself via its
    // web-fetch / browser tool. We never call requestUrl on the destination.
    onProgress?.(`Fetching ${parsed.url} via LLM…`);
    const llm = await enrichWithLlm(this.app, this.settings, parsed.url);

    // 2. Pick template + destination. Defensive guard mirrors the one
    // in enrichWithLlm above: if templates is undefined / non-array
    // (partial data.json), fall back to empty + let the caller notice.
    const safeTemplates = Array.isArray(this.settings.templates) && this.settings.templates.length > 0
      ? this.settings.templates
      : [];
    const slot =
      safeTemplates.find((t) => t.linkType === (llm?.linkType ?? "")) ??
      safeTemplates[0];
    if (!slot) {
      new Notice("Templates settings are missing. Reload the plugin to restore defaults.", 10000);
      return null;
    }
    const template = templatesByType.get(slot.linkType) ?? defaultTemplate;
    const destinationDir = (llm?.suggestedDestination || slot.defaultDestination).trim();

    // 3. Compose title + filename
    const baseTitle = parsed.title ?? parsed.url;
    const finalTitle = sanitizeFilename(
      cleanTitle(llm?.refinedTitle) || cleanTitle(baseTitle) || "",
    );
    const stamp = nowStamp();
    const filename = `${stamp} - ${finalTitle || "Untitled Link"}.md`;
    const notePath = `${destinationDir}/${filename}`;

    // 4. Render
    const body = renderNote(template, baseTitle, parsed.url, llm, stamp, destinationDir);

    // 5. Resolve filename collisions against existing files. Obsidian's
    // vault.create throws "File already exists" if the path is taken; we
    // want to give the user a real choice instead of failing the batch.
    const resolution = await this.resolveCollision(notePath, parsed.url);
    if (resolution.kind === "skip") return null;            // count as skipped, batch continues
    if (resolution.kind === "abort") return { abort: true }; // stop the entire batch
    const resolvedPath = resolution.path;

    // 7. Write atomically — vault.create auto-creates parent folders
    await this.app.vault.create(resolvedPath, body);

    return resolvedPath;
  }

  // Decide what to do when the destination filename already exists.
  // Pre-checks cheaply with adapter.exists so we don't depend on the throw
  // from vault.create. If the file appears between our check and the
  // create call (unlikely but possible), the catch in processInbox still
  // surfaces it as a per-link failure.
  private async resolveCollision(
    notePath: string,
    sourceUrl: string,
  ): Promise<
    | { kind: "write"; path: string }
    | { kind: "skip" }
    | { kind: "abort" }
  > {
    const exists = await this.app.vault.adapter.exists(notePath);
    if (!exists) return { kind: "write", path: notePath };

    const choice = await new Promise<DuplicateChoice>((resolve) => {
      new DuplicateNoteModal(this.app, {
        notePath,
        sourceUrl,
        onChoose: (c) => resolve(c),
      }).open();
    });

    if (choice === "skip") {
      new Notice(`Skipped duplicate: ${notePath}`);
      return { kind: "skip" };
    }
    if (choice === "abort") {
      new Notice(`Aborted batch at duplicate: ${notePath}`);
      return { kind: "abort" };
    }
    if (choice === "overwrite") {
      // Delete the existing file first; vault.create refuses to overwrite.
      const existing = this.app.vault.getAbstractFileByPath(notePath);
      if (existing instanceof TFile) {
        await this.app.vault.delete(existing);
      }
      return { kind: "write", path: notePath };
    }
    // rename: append -2, -3, ... until a free name is found
    const dir = notePath.includes("/") ? notePath.slice(0, notePath.lastIndexOf("/")) : "";
    const ext = ".md";
    const stem = notePath.slice(dir.length + 1, -ext.length);
    for (let n = 2; n < 1000; n++) {
      const candidate = `${dir}/${stem} - ${n}${ext}`;
      if (!(await this.app.vault.adapter.exists(candidate))) {
        new Notice(`Renamed to: ${candidate}`);
        return { kind: "write", path: candidate };
      }
    }
    // Pathological — give up and let create throw
    return { kind: "write", path: notePath };
  }

  // Read live: numbered subfolders under <projectsRoot>/, sorted by leading
  // number. Used to populate the project-type dropdown in the scaffold modal.
  private async listProjectTypes(): Promise<ProjectTypeOption[]> {
    const adapter = this.app.vault.adapter;
    const root = this.settings.projectsRoot.replace(/\/+$/, "");
    if (!(await adapter.exists(root))) return [];
    const listing = await adapter.list(root);
    const subsAll = await Promise.all(
      listing.map(async (p) => {
        const isDir =
          (p as { isDirectory?: boolean }).isDirectory === true ||
          (await adapter.exists(p.path));
        return { p, isDir };
      }),
    );
    const subs = subsAll
      .filter(({ isDir }) => isDir)
      .map(({ p }) => p)
      .filter((p) => /^\d+\./.test(p.name))
      .sort((a, b) => {
        const na = parseInt(a.name, 10);
        const nb = parseInt(b.name, 10);
        return na - nb;
      });
    return subs.map((p) => ({
      label: p.name,
      value: p.name,
      absPath: p.path,
    }));
  }

  // Read the current note's selection (already passed in by editorCallback),
  // show the modal, then spawn init-project.py. On success, open the new
  // project's index note.
  private async createProjectFromSelection(selection: string): Promise<void> {
    const types = await this.listProjectTypes();
    if (types.length === 0) {
      new Notice(
        `No numbered subfolders under "${this.settings.projectsRoot}/". Add at least one (e.g. "1. Coding") and retry.`,
        10000,
      );
      return;
    }
    const result = await new Promise<ProjectScaffoldResult | null>((resolve) => {
      new ProjectScaffoldModal(this.app, {
        types,
        projectsRoot: this.settings.projectsRoot,
        templateScriptPath: this.settings.templateScriptPath,
        initialPlan: selection,
        onDone: (r) => resolve(r),
      }).open();
    });
    if (!result) return;

    const destDir = `${this.settings.projectsRoot}/${result.typeValue}/${result.name}`;
    new Notice(`Scaffolding ${destDir}…`, 5000);

    // Resolve vault-relative template directory to absolute.
    const basePath = this.app.vault.adapter.basePath.replace(/[/\\]+$/, "");
    const sep = basePath.includes("\\") ? "\\" : "/";
    const templateDirAbs = this.settings.templateScriptPath.startsWith(basePath)
      ? this.settings.templateScriptPath
      : `${basePath}${sep}${this.settings.templateScriptPath.replace(/\//g, sep)}`;
    // templateScriptPath is the path to init-project.py; the template
    // directory is one level up (parent of /scripts/).
    const templateDir = templateDirAbs.replace(/[/\\]scripts[/\\]init-project\.py$/, "");

    let actions: ScaffoldAction[];
    try {
      actions = await scaffoldProject(templateDir, destDir, {
        name: result.name,
        key: result.key,
        status: "working",
        vaultRoot: basePath,
        projectRelpath: destDir,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(`Scaffold failed: ${msg}`, 10000);
      await appendFailureLog(
        this.app,
        this.manifest,
        "create-project-from-selection",
        `scaffold failed: ${msg}`,
      );
      return;
    }

    // Surface any unresolved placeholders so the user notices.
    const unresolved = actions.flatMap((a) => a.unresolved ?? []);
    if (unresolved.length > 0) {
      new Notice(
        `Scaffold completed with unresolved placeholders: ${unresolved.join(", ")}. Check templates.`,
        15000,
      );
    }

    // Try to open the new project's index note.
    const indexPath = `${destDir}/${result.name}.md`;
    const indexFile = this.app.vault.getAbstractFileByPath(indexPath);
    if (indexFile instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(indexFile);
      new Notice(`Created ${destDir}`);
    } else {
      new Notice(`Scaffold succeeded but couldn't find ${indexPath} — check the folder manually.`);
    }
  }

  // Move a file under <archiveRoot>/ mirroring its source path. Adds (or
  // updates) `archivedAt` in the YAML frontmatter before the move. Skips
  // files that already live under archiveRoot. Uses fileManager.renameFile
  // (atomic, Obsidian Sync-safe).
  async moveToArchive(file: TFile): Promise<void> {
    if (file.path.startsWith(this.settings.archiveRoot + "/")) {
      new Notice(`Already in ${this.settings.archiveRoot}: ${file.path}`);
      return;
    }
    const destPath = `${this.settings.archiveRoot}/${file.path}`;
    const destExists = this.app.vault.getAbstractFileByPath(destPath);
    if (destExists) {
      new Notice(`Archive destination already exists: ${destPath}`);
      return;
    }

    // 1. Read current content, add archivedAt to frontmatter
    const raw = await this.app.vault.read(file);
    const updated = this.injectArchivedAt(raw);
    if (updated !== raw) {
      await this.app.vault.modify(file, updated);
    }

    // 2. Ensure parent dir exists, then rename
    const parentDir = destPath.includes("/")
      ? destPath.slice(0, destPath.lastIndexOf("/"))
      : "";
    if (parentDir && !(await this.app.vault.adapter.exists(parentDir))) {
      await this.app.vault.adapter.mkdir(parentDir);
    }
    try {
      await this.app.fileManager.renameFile(file, destPath);
      new Notice(`Archived → ${destPath}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(`Archive failed: ${msg}`, 8000);
    }
  }

  // Insert (or replace) `archivedAt: <ISO>` in YAML frontmatter. If there is
  // no frontmatter, prepend one. Returns the (possibly) modified text.
  private injectArchivedAt(raw: string): string {
    const ts = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const line = `archivedAt: ${ts}`;
    // Match the frontmatter block but DO NOT consume the trailing newline —
    // we want to preserve the blank-line separator between frontmatter and
    // body content.
    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fmMatch) {
      return `---\n${line}\n---\n\n${raw}`;
    }
    const body = fmMatch[1];
    const rest = raw.slice(fmMatch[0].length);
    if (/^archivedAt\s*:/m.test(body)) {
      const replaced = body.replace(/^archivedAt\s*:.*$/m, line);
      return `---\n${replaced}\n---${rest}`;
    }
    const trimmed = body.endsWith("\n") ? body.slice(0, -1) : body;
    return `---\n${trimmed}\n${line}\n---${rest}`;
  }

  // Generate the default template body for a slot and write it to
  // `slot.templatePath` if no file exists there yet. Never overwrites.
  async generateTemplate(slot: TemplateSlot): Promise<void> {
    const existing = this.app.vault.getAbstractFileByPath(slot.templatePath);
    if (existing instanceof TFile) return;
    const parent = slot.templatePath.split("/").slice(0, -1).join("/");
    if (parent && !(await this.app.vault.adapter.exists(parent))) {
      await this.app.vault.adapter.mkdir(parent);
    }
    const body =
      DEFAULT_TEMPLATES[slot.linkType] ?? DEFAULT_TEMPLATES["custom"];
    await this.app.vault.create(slot.templatePath, body);
  }
}

// ============================================================================
// Default fallback template (only used if user hasn't configured one)
// ============================================================================

const DEFAULT_TEMPLATE = `---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "⏳ To Process"
destination:
url:
tags: []
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## 🔗 Source
URL:

## 📝 Context

*Quick note about why this is saved*

## 🔖 Key Points

*Fill during processing*

## 🔗 Related
- 

---

**Captured:** {{date:YYYY-MM-DD HH:mm}}
`;

// ============================================================================
// Project-template verifier + inbox reprocessor (v0.5.0)
// ============================================================================

// Per ADR-001 + per-template defaults, these are the frontmatter fields
// the plugin considers "must be filled" before a note is considered ready.
// Empty placeholders in the template files (e.g. `destination:` with no
// value) define the canonical set. New template = new required field, no
// code change needed.
function isFieldEmptyInYaml(yaml: string, fieldName: string): boolean {
  // Match the field name at the start of a line (with optional whitespace),
  // followed by `:` and an optional value. We treat the value as "empty" if
  // it's blank, an empty string `""`, or an empty array `[]`.
  // Examples that are NOT empty: `priority: medium`, `category: tv-show`,
  //   `tags: [media]`, `created: 2026-09-01`.
  // Examples that ARE empty: `url:`, `destination:`, `priority:`,
  //   `tags: []`.
  const re = new RegExp(
    `^${fieldName}\\s*:\\s*(.*)$`,
    "m",
  );
  const m = yaml.match(re);
  if (!m) return true; // field absent entirely counts as empty
  const v = m[1].trim();
  if (v === "") return true; // bare `field:`
  if (v === '""' || v === "''") return true; // explicit empty string
  if (v === "[]" || v === "[ ]") return true; // empty array
  return false;
}

// Parse YAML frontmatter from a markdown file. Returns null if the file
// doesn't have a frontmatter block.
function parseFrontmatter(
  text: string,
): { yaml: string; body: string } | null {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  const yaml = m[1];
  const body = text.slice(m[0].length);
  return { yaml, body };
}

// Parse the frontmatter of a template file and return the field names whose
// values are empty placeholders. These are the "must-fill" fields for
// notes of that template's type.
async function readTemplateRequiredFields(
  app: App,
  templatePath: string,
): Promise<string[]> {
  const f = app.vault.getAbstractFileByPath(templatePath);
  if (!(f instanceof TFile)) return [];
  const text = await app.vault.cachedRead(f);
  const fm = parseFrontmatter(text);
  if (!fm) return [];
  const required: string[] = [];
  for (const line of fm.yaml.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, name, value] = m;
    const v = value.trim();
    // Empty = bare `field:`, explicit `""` or `''`, or `[]` / `[ ]`.
    const isEmpty =
      v === "" || v === '""' || v === "''" || v === "[]" || v === "[ ]";
    // Detect template placeholders like `{{date:...}}` or `{{title}}`.
    // These are renderer-managed (the runtime renderer fills them in
    // when the note is processed), NOT user-fillable. Treating them as
    // "required" would tell the LLM to fill a date placeholder, which
    // it can't do — the LLM returns empty, and the reprocessor then
    // trashes the note. Exclude placeholder fields from the required
    // list so the LLM is only asked for genuinely-empty fields.
    const isPlaceholder = /\{\{[^}]+\}\}/.test(v);
    if (isEmpty && !isPlaceholder) {
      required.push(name);
    }
  }
  return required;
}

// Maps the 5 inbox subdirectory names to their template type. Unknown
// subdirs are skipped by the reprocessor (they aren't inbox subdirs).
const INBOX_SUBDIR_TYPES: Record<string, string> = {
  Links: "link",
  Tasks: "task",
  Media: "media",
  Research: "research",
  Reference: "reference",
};

// Result of one project's dry-run scan.
interface ProjectMisalignment {
  typeValue: string;       // "3. Coding", "2. Private", etc.
  projectName: string;     // "Homelab Manager"
  projectPath: string;     // vault-relative, e.g. "1. Projects/3. Coding/Homelab Manager"
  projectKey: string;      // auto-derived via deriveProjectKey
  missingFiles: string[];  // ["v0.1/Plan.md", "CLAUDE.md", ...]
}

// Plan a scaffold against one project using the in-process TypeScript
// engine. Returns the list of files that would be created (i.e. missing
// from the destination).
async function dryRunProjectScaffold(
  basePath: string,
  sep: string,
  typeValue: string,
  projectName: string,
  projectPath: string,
): Promise<ProjectMisalignment | null> {
  const projectKey = deriveProjectKey(projectName);
  const templateScriptPath = "5. System/Templates/Project Folder Template/scripts/init-project.py";
  const scriptAbsPath = templateScriptPath.startsWith(basePath)
    ? templateScriptPath
    : `${basePath}${sep}${templateScriptPath.replace(/\//g, sep)}`;
  // templateScriptPath is the path to init-project.py; the template
  // directory is one level up (parent of /scripts/).
  const templateDir = scriptAbsPath.replace(/[/\\]scripts[/\\]init-project\.py$/, "");

  let actions: ScaffoldAction[];
  try {
    actions = await scaffoldPlan(templateDir, projectPath, {
      name: projectName,
      key: projectKey,
      status: "working",
      vaultRoot: basePath,
      projectRelpath: projectPath,
      merge: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Surface the verification failure as a misalignment so the user
    // knows something went wrong rather than silently passing.
    return {
      typeValue,
      projectName,
      projectPath,
      projectKey,
      missingFiles: [`(verification failed: ${msg})`],
    };
  }

  // Map ScaffoldAction[] to the missingFiles list. Each render/copy
  // action whose destination does NOT already exist represents a missing
  // file. Skip actions (merge: file exists) are NOT missing.
  const missing: string[] = [];
  for (const a of actions) {
    if (a.action === "render" || a.action === "copy") {
      missing.push(a.dstPath);
    }
  }
  return {
    typeValue,
    projectName,
    projectPath,
    projectKey,
    missingFiles: missing,
  };
}

// Walk all projects under settings.projectsRoot, run dry-run against each,
// return the list of misaligned ones.
async function scanProjectsAgainstTemplate(
  app: App,
  settings: KusterInboxSettings,
): Promise<ProjectMisalignment[]> {
  const basePath = app.vault.adapter.basePath.replace(/[/\\]+$/, "");
  const sep = basePath.includes("\\") ? "\\" : "/";
  const root = settings.projectsRoot.replace(/[/\\]+$/, "");
  if (!(await app.vault.adapter.exists(root))) return [];
  const listing = await app.vault.adapter.list(root);
  const misaligned: ProjectMisalignment[] = [];
  for (const dirEntry of listing) {
    if (await app.vault.adapter.exists(dirEntry.path) === false) continue;
    // dirEntry.path is the project-type subfolder (e.g. "1. Projects/3. Coding")
    const typeName = dirEntry.name;
    const subListing = await app.vault.adapter.list(dirEntry.path);
    for (const projEntry of subListing) {
      const projName = projEntry.name;
      if (await app.vault.adapter.exists(projEntry.path) === false) continue;
      const result = await dryRunProjectScaffold(
        basePath, sep, typeName, projName, projEntry.path,
      );
      if (result && result.missingFiles.length > 0) {
        misaligned.push(result);
      }
    }
  }
  return misaligned;
}

// ============================================================================
// Modal: display the misalignment report and let the user trigger fixes
// ============================================================================

class ProjectCheckModal extends Modal {
  private app: App;
  private misalignments: ProjectMisalignment[];
  private basePath: string;
  private sep: string;
  private onDone: (results: { fixed: string[]; skipped: string[]; failed: { name: string; error: string }[] }) => void;

  constructor(
    app: App,
    opts: {
      misalignments: ProjectMisalignment[];
      basePath: string;
      sep: string;
      onDone: (r: ProjectMisalignment[]) => void;
    },
  ) {
    super(app);
    this.app = app;
    this.misalignments = opts.misalignments;
    this.basePath = opts.basePath;
    this.sep = opts.sep;
    this.onDone = opts.onDone as ProjectCheckModal["onDone"];
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Project template check" });

    if (this.misalignments.length === 0) {
      contentEl.createEl("p", {
        text: "All projects under 1. Projects/ match the v0.5 template. Nothing to fix.",
        cls: "setting-item-description",
      });
      const closeBtn = contentEl.createEl("button", { text: "Close" });
      closeBtn.addEventListener("click", () => {
        this.close();
        this.onDone({ fixed: [], skipped: [], failed: [] });
      });
      return;
    }

    contentEl.createEl("p", {
      text:
        `${this.misalignments.length} project(s) are misaligned against the v0.5 template. ` +
        `Click a project to apply fixes (init-project.py --merge; safe to re-run).`,
      cls: "setting-item-description",
    });

    const list = contentEl.createDiv({ cls: "kip-check-list" });
    list.style.cssText = "margin-top: 12px; max-height: 50vh; overflow-y: auto;";
    for (const m of this.misalignments) {
      const row = list.createDiv({ cls: "kip-check-row" });
      row.style.cssText =
        "padding: 8px 10px; margin-bottom: 6px; border: 1px solid var(--background-modifier-border); border-radius: 6px;";
      const header = row.createDiv();
      header.createEl("strong", { text: `${m.typeValue}/${m.projectName}` });
      header.createEl("br");
      const missingEl = header.createEl("span", { text: "Missing: " });
      missingEl.createEl("code", {
        text: m.missingFiles.length <= 4
          ? m.missingFiles.join(", ")
          : m.missingFiles.slice(0, 4).join(", ") + ` (+${m.missingFiles.length - 4} more)`,
      });
      const actions = row.createDiv();
      actions.style.cssText = "margin-top: 6px; display: flex; gap: 6px;";
      const fixBtn = actions.createEl("button", { text: "Apply fixes" });
      fixBtn.addEventListener("click", async () => {
        fixBtn.disabled = true;
        fixBtn.setText("Applying…");
        const result = await applyProjectFix(this.app, this.basePath, this.sep, m);
        fixBtn.setText(result.ok ? "Fixed ✓" : `Failed: ${result.error}`);
      });
      const skipBtn = actions.createEl("button", { text: "Skip" });
      skipBtn.addEventListener("click", () => {
        this.close();
        this.onDone({ fixed: [], skipped: [m.projectPath], failed: [] });
      });
    }

    const closeAllBtn = contentEl.createEl("button", { text: "Close" });
    closeAllBtn.style.marginTop = "12px";
    closeAllBtn.addEventListener("click", () => {
      this.close();
      this.onDone({ fixed: [], skipped: [], failed: [] });
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// Run init-project.py --merge (no --dry-run) for one project. Returns
// {ok: true} on success or {ok: false, error: string} on failure.
async function applyProjectFix(
  app: App,
  basePath: string,
  sep: string,
  m: ProjectMisalignment,
): Promise<{ ok: boolean; error?: string }> {
  const templateScriptPath = "5. System/Templates/Project Folder Template/scripts/init-project.py";
  const scriptAbsPath = templateScriptPath.startsWith(basePath)
    ? templateScriptPath
    : `${basePath}${sep}${templateScriptPath.replace(/\//g, sep)}`;
  // templateScriptPath is the path to init-project.py; the template
  // directory is one level up (parent of /scripts/).
  const templateDir = scriptAbsPath.replace(/[/\\]scripts[/\\]init-project\.py$/, "");

  try {
    await scaffoldProject(templateDir, m.projectPath, {
      name: m.projectName,
      key: m.projectKey,
      status: "working",
      vaultRoot: basePath,
      projectRelpath: m.projectPath,
      merge: true,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ============================================================================
// Inbox subdirectory reprocessor
// ============================================================================

interface ReprocessResult {
  processed: number;       // successfully filled
  skipped: number;         // already had all required fields
  failed: number;          // LLM call or write failed
  trashed: number;         // moved to .trash/ because unrecoverable
}

// Walk 0. Inbox/{Links,Tasks,Media,Research,Reference}/, check each .md
// against its template's required fields, fill missing via LLM, save.
async function reprocessInboxSubdirs(
  app: App,
  settings: KusterInboxSettings,
  onProgress?: (msg: string) => void,
): Promise<ReprocessResult> {
  const result: ReprocessResult = { processed: 0, skipped: 0, failed: 0, trashed: 0 };
  // Early-return guard: without the LLM we can scan + report missing
  // fields, but we can't fill them. The original code had this as a
  // dead expression (`!t.llmEnabled||t.openrouterApiKey;`) that the
  // minifier stripped, so the reprocess ran anyway and then trashed
  // every note because no fields could be filled. Catch it now.
  if (!settings.llmEnabled || !settings.openrouterApiKey) {
    return result;
  }
  const inboxRoot = "0. Inbox";
  if (!(await app.vault.adapter.exists(inboxRoot))) return result;

  for (const [subdir, ttype] of Object.entries(INBOX_SUBDIR_TYPES)) {
    const subdirPath = `${inboxRoot}/${subdir}`;
    if (!(await app.vault.adapter.exists(subdirPath))) continue;
    // adapter.list() is documented to return TAbstractFile[] but can
    // return undefined on corrupted vault state. The minified
    // 'c is not iterable' bug from the v0.6.2 release was exactly
    // that: `for (let g of c)` where c was the listing. Fall back
    // to an empty array rather than crashing the whole command.
    const rawListing = await app.vault.adapter.list(subdirPath);
    const listing = Array.isArray(rawListing) ? rawListing : [];
    // adapter.list() returns TAbstractFile[]; we want only files whose
    // adapter.exists returns true (this filters out folders whose paths
    // appear in the listing). Async filter via map+reduce.
    const mdFiles: TFile[] = [];
    for (const l of listing) {
      if (!l.name.endsWith(".md")) continue;
      if (!(await app.vault.adapter.exists(l.path))) continue;
      const abs = app.vault.getAbstractFileByPath(l.path);
      if (abs instanceof TFile) mdFiles.push(abs);
    }

    // Determine required fields for this type from the configured template
    const templatePath = Array.isArray(settings.templates) && settings.templates.length > 0
      ? settings.templates.find((t) => t.linkType === ttype)?.templatePath
      : null;
    if (!templatePath) continue;
    const requiredFields = await readTemplateRequiredFields(app, templatePath);
    if (requiredFields.length === 0) continue;

    for (const file of mdFiles) {
      await processOneFile(app, file, ttype, requiredFields, settings, onProgress, result);
    }
  }
  return result;
}

async function processOneFile(
  app: App,
  file: TFile,
  ttype: string,
  requiredFields: string[],
  settings: KusterInboxSettings,
  onProgress: ((msg: string) => void) | undefined,
  result: ReprocessResult,
): Promise<void> {
  onProgress?.(`Reprocessing ${file.path}…`);
  const text = await app.vault.cachedRead(file);
  const fm = parseFrontmatter(text);
  if (!fm) {
    // No frontmatter — skip; the template has required fields so this file
    // doesn't even match the template shape.
    result.skipped++;
    return;
  }
  const emptyFields = requiredFields.filter((f) => isFieldEmptyInYaml(fm.yaml, f));
  if (emptyFields.length === 0) {
    result.skipped++;
    return;
  }

  // Try the LLM. If it can't fill the value (e.g. URL truly missing for
  // a Link note), we trash the file rather than half-fill it.
  let filled: Record<string, string> = {};
  if (settings.llmEnabled && settings.openrouterApiKey) {
    filled = await tryFillFieldsViaLlm(app, settings, file, ttype, emptyFields);
  }

  // Verify all the originally-empty fields are now filled. Anything still
  // missing after the LLM call means we can't safely write this file —
  // move to .trash/ for human triage.
  const stillEmpty = emptyFields.filter((f) => !filled[f] || filled[f].length === 0);
  if (stillEmpty.length > 0) {
    await trashFile(app, file, stillEmpty);
    result.trashed++;
    return;
  }

  // Splice filled values into the YAML, preserve the rest of the file.
  const newYaml = spliceFields(fm.yaml, filled);
  // Render any leftover `{{date:...}}` placeholders in both YAML and
  // body. Without this step, reprocessed notes still carry literal
  // `{{date:YYYYMMDDHHmmss}}` strings — same as `renderNote`'s date
  // pass for new notes. `{{title}}` is intentionally not rendered.
  const stamp = nowStamp();
  const renderedYaml = renderDatePlaceholders(newYaml, stamp);
  const renderedBody = renderDatePlaceholders(fm.body, stamp);
  const newText = `---\n${renderedYaml}\n---\n${renderedBody}`;
  try {
    await app.vault.modify(file, newText);
    result.processed++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Free function — can't use this.pluginLog. console.error stays;
    // debug log entries for free-function paths aren't supported yet.
    console.error(`Link Inbox Processor: failed to modify ${file.path}`, e);
    await appendFailureLog(app, { dir: ".obsidian/plugins/kuster-inbox-processor" }, file.path, msg);
    result.failed++;
  }
}

function spliceFields(yaml: string, filled: Record<string, string>): string {
  const lines = yaml.split(/\r?\n/);
  const out: string[] = [];
  const written = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (m) {
      const [, name, value] = m;
      if (filled[name] !== undefined) {
        const v = filled[name];
        // Preserve the original quoting style if present.
        if (value.startsWith('"') && value.endsWith('"')) {
          out.push(`${name}: "${v}"`);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          out.push(`${name}: '${v}'`);
        } else if (value.startsWith("[") && value.endsWith("]")) {
          // Tags-like field. We won't get a tag here from the LLM usually,
          // so if the LLM provided tags we'll pass them through as
          // comma-separated text — caller should pre-format.
          out.push(`${name}: ${v}`);
        } else {
          out.push(`${name}: ${v}`);
        }
        written.add(name);
      } else {
        out.push(line);
      }
    } else {
      out.push(line);
    }
  }
  // Any fields the LLM filled that didn't appear in the original YAML get
  // appended at the end (rare — happens for fields missing entirely).
  for (const name of Object.keys(filled)) {
    if (!written.has(name)) {
      out.push(`${name}: ${filled[name]}`);
    }
  }
  return out.join("\n");
}

async function tryFillFieldsViaLlm(
  app: App,
  settings: KusterInboxSettings,
  file: TFile,
  ttype: string,
  fields: string[],
): Promise<Record<string, string>> {
  // Use the existing enrichWithLlm-style call, but ask for ONLY the
  // missing fields. We piggyback on the same OpenRouter endpoint.
  const systemPrompt =
    `You classify a ${ttype} note from an Obsidian PARA vault. ` +
    `For each field name below, return the value that should fill it. ` +
    `If you genuinely cannot determine the value (e.g. the URL is not ` +
    `in the file body), return an empty string for that field. ` +
    `Return ONLY a JSON object like {"field1": "value1", "field2": "value2"}. ` +
    `Fields: ${fields.join(", ")}.`;

  const text = await app.vault.cachedRead(file);
  const userPrompt = `File path: ${file.path}\n\nFile contents:\n${text}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openrouterApiKey}`,
    };
    if (settings.openrouterReferer) headers["HTTP-Referer"] = settings.openrouterReferer;
    if (settings.openrouterAppName) headers["X-Title"] = settings.openrouterAppName;

    const r = await requestUrl({
      url: "https://openrouter.ai/api/v1/chat/completions",
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.openrouterModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
      }),
      throw: false,
    });
    if (r.status < 200 || r.status >= 300) return {};
    const reply = r.json?.choices?.[0]?.message?.content ?? "";
    const json = reply.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return {};
    const parsed = JSON.parse(json);
    const out: Record<string, string> = {};
    for (const field of fields) {
      const v = parsed[field];
      if (typeof v === "string" && v.trim().length > 0) {
        out[field] = v.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function trashFile(app: App, file: TFile, missingFields: string[]): Promise<void> {
  const trashDir = ".trash";
  if (!(await app.vault.adapter.exists(trashDir))) {
    await app.vault.adapter.mkdir(trashDir);
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = file.basename;
  const destPath = `${trashDir}/${ts}__${baseName}__missing-${missingFields.join(",")}.md`;
  await app.vault.rename(file, destPath);
  console.warn(
    `Link Inbox Processor: trashed ${file.path} (missing: ${missingFields.join(", ")}) -> ${destPath}`,
  );
}

// ============================================================================
// Settings tab
// ============================================================================

class KusterInboxSettingTab extends PluginSettingTab {
  private plugin: KusterInboxPlugin;

  constructor(app: App, plugin: KusterInboxPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Link Inbox Processor" });

    // ---------------------------------------------------------------------
    // Vault paths
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "Vault paths" });
    new Setting(containerEl)
      .setName("Inbox file")
      .setDesc("Path to the dashboard note that holds the iOS-share marker.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.inboxFile)
          .onChange(async (v) => {
            this.plugin.settings.inboxFile = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("Default template path")
      .setDesc("Used when a link's classified type has no template registered.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.defaultTemplatePath)
          .onChange(async (v) => {
            this.plugin.settings.defaultTemplatePath = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("Share marker")
      .setDesc("The HTML comment that delimits the iOS-shared links block.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.shareMarker)
          .onChange(async (v) => {
            this.plugin.settings.shareMarker = v;
            await this.plugin.saveData(this.plugin.settings);
          }),
      );

    // ---------------------------------------------------------------------
    // Templates (one row per link-type)
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "Templates (one per link-type)" });
    containerEl.createEl("p", {
      text:
        "Each link is classified into one of these types by the LLM. The matching template is rendered. " +
        "Add rows for custom types (e.g. 'shopping', 'paper', 'video').",
      cls: "setting-item-description",
    });

    // Inject scoped CSS for the link-type table. This stays in the settings
    // tab only — we tear it down on every re-render so styles don't leak
    // when the user navigates away.
    if (!containerEl.querySelector("#kip-table-style")) {
      containerEl.createEl("style", {
        attr: { id: "kip-table-style" },
        text: `
          .kip-table { display: grid; gap: 6px; margin: 8px 0; }
          .kip-table-header, .kip-table-row {
            display: grid;
            grid-template-columns: 100px 1.4fr 1.6fr 1.2fr 1.4fr;
            gap: 8px;
            align-items: center;
          }
          .kip-table-header {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: var(--text-muted);
            padding: 0 4px;
          }
          .kip-table-row {
            background: var(--background-secondary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 6px;
            padding: 6px 8px;
          }
          .kip-table-row input[type="text"] {
            width: 100%;
            margin: 0;
            font-size: 12px;
          }
          .kip-table-actions {
            display: flex;
            gap: 4px;
            justify-content: flex-end;
          }
          .kip-table-actions button {
            padding: 2px 8px;
            font-size: 11px;
          }
          @media (max-width: 800px) {
            .kip-table-header { display: none; }
            .kip-table-row { grid-template-columns: 1fr; }
          }
        `,
      });
    }

    const renderTemplateRows = () => {
      const wrapId = "kip-template-rows";
      const existing = containerEl.querySelector(`#${wrapId}`);
      if (existing) existing.remove();
      const wrap = containerEl.createDiv({ attr: { id: wrapId, class: "kip-table" } });

      // Header row
      const header = wrap.createDiv({ cls: "kip-table-header" });
      header.createEl("div", { text: "linkType" });
      header.createEl("div", { text: "Hint (sent to LLM)" });
      header.createEl("div", { text: "Template path" });
      header.createEl("div", { text: "Default destination" });
      header.createEl("div", { text: "Actions", attr: { style: "text-align: right;" } });

      // Data rows
      this.plugin.settings.templates.forEach((slot, idx) => {
        const row = wrap.createDiv({ cls: "kip-table-row" });
        row.createEl("input", {
          attr: { type: "text", placeholder: "link" },
          value: slot.linkType,
        }).addEventListener("change", async (e) => {
          const v = (e.target as HTMLInputElement).value;
          this.plugin.settings.templates[idx].linkType = v.trim();
          await this.plugin.saveData(this.plugin.settings);
        });
        row.createEl("input", {
          attr: { type: "text", placeholder: "Web articles, tools, tutorials, repos" },
          value: slot.hint,
        }).addEventListener("change", async (e) => {
          const v = (e.target as HTMLInputElement).value;
          this.plugin.settings.templates[idx].hint = v;
          await this.plugin.saveData(this.plugin.settings);
        });
        row.createEl("input", {
          attr: { type: "text", placeholder: "5. System/Templates/Inbox/My Template.md" },
          value: slot.templatePath,
        }).addEventListener("change", async (e) => {
          const v = (e.target as HTMLInputElement).value;
          this.plugin.settings.templates[idx].templatePath = v.trim();
          await this.plugin.saveData(this.plugin.settings);
        });
        row.createEl("input", {
          attr: { type: "text", placeholder: "0. Inbox/Links" },
          value: slot.defaultDestination,
        }).addEventListener("change", async (e) => {
          const v = (e.target as HTMLInputElement).value;
          this.plugin.settings.templates[idx].defaultDestination = v.trim();
          await this.plugin.saveData(this.plugin.settings);
        });
        const actions = row.createDiv({ cls: "kip-table-actions" });
        const genBtn = actions.createEl("button", { text: "Generate" });
        genBtn.title = "Write a starter template to the path if no file exists there";
        genBtn.addEventListener("click", async () => {
          await this.plugin.generateTemplate(slot);
          new Notice(`Template written to ${slot.templatePath}`);
        });
        const delBtn = actions.createEl("button", { text: "✕" });
        delBtn.title = "Remove this link-type";
        delBtn.addEventListener("click", async () => {
          this.plugin.settings.templates.splice(idx, 1);
          await this.plugin.saveData(this.plugin.settings);
          renderTemplateRows();
        });
      });

      // Add-row footer
      const footer = wrap.createDiv({ attr: { style: "display: flex; justify-content: flex-end; padding-top: 4px;" } });
      const addBtn = footer.createEl("button", { text: "+ Add link-type" });
      addBtn.addEventListener("click", async () => {
        this.plugin.settings.templates.push({
          linkType: "custom",
          templatePath: "5. System/Templates/Inbox/Custom Template.md",
          hint: "Describe what this type is for.",
          defaultDestination: "0. Inbox/Links",
        });
        await this.plugin.saveData(this.plugin.settings);
        renderTemplateRows();
      });
    };
    renderTemplateRows();

    // ---------------------------------------------------------------------
    // CLAUDE.md context (read by the LLM as system context)
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "Classification context (CLAUDE.md)" });
    new Setting(containerEl)
      .setName("Path")
      .setDesc("Vault-relative path to the CLAUDE.md the LLM reads as system context.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.claudeContextPath)
          .onChange(async (v) => {
            this.plugin.settings.claudeContextPath = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("Allowed destination roots")
      .setDesc(
        "Comma-separated. The LLM may only suggest destinations under these roots — anything else falls back to the link-type default.",
      )
      .addText((t) =>
        t
          .setValue(this.plugin.settings.allowedDestinationRoots.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.allowedDestinationRoots = v
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("Seed CLAUDE.md (only if file is missing)")
      .setDesc(
        "Drops a starter file that lists your PARA conventions and link-type catalogue. Never overwrites an existing file.",
      )
      .addButton((b) =>
        b
          .setButtonText("Create if missing")
          .onClick(async () => {
            const path = this.plugin.settings.claudeContextPath;
            const f = this.plugin.app.vault.getAbstractFileByPath(path);
            if (f instanceof TFile) {
              new Notice(`Already exists: ${path}`);
              return;
            }
            const parent = path.split("/").slice(0, -1).join("/");
            if (parent && !(await this.plugin.app.vault.adapter.exists(parent))) {
              await this.plugin.app.vault.adapter.mkdir(parent);
            }
            await this.plugin.app.vault.create(path, seedClaudeContext());
            new Notice(`Created ${path}`);
          }),
      );

    // ---------------------------------------------------------------------
    // OpenRouter LLM
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "OpenRouter LLM enrichment" });
    new Setting(containerEl)
      .setName("Enable LLM enrichment")
      .setDesc("Call OpenRouter to classify links, refine titles, suggest destinations, suggest tags.")
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.llmEnabled)
          .onChange(async (v) => {
            this.plugin.settings.llmEnabled = v;
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("OpenRouter API key")
      .setDesc("Get one at https://openrouter.ai/keys")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("sk-or-...")
          .setValue(this.plugin.settings.openrouterApiKey)
          .onChange(async (v) => {
            this.plugin.settings.openrouterApiKey = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          });
      });
    new Setting(containerEl)
      .setName("OpenRouter model")
      .setDesc("Default: openrouter/auto-beta (cheapest routing). Set any model from https://openrouter.ai/models")
      .addText((t) =>
        t
          .setPlaceholder("openrouter/auto-beta")
          .setValue(this.plugin.settings.openrouterModel)
          .onChange(async (v) => {
            this.plugin.settings.openrouterModel = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("HTTP-Referer (optional)")
      .setDesc("Recommended by OpenRouter for free-tier rate limits.")
      .addText((t) =>
        t
          .setPlaceholder("https://github.com/BigHoss/obsidian-inboxprocessor-plugin")
          .setValue(this.plugin.settings.openrouterReferer)
          .onChange(async (v) => {
            this.plugin.settings.openrouterReferer = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("X-Title (optional)")
      .setDesc("App name shown on openrouter.ai rankings.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.openrouterAppName)
          .onChange(async (v) => {
            this.plugin.settings.openrouterAppName = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          }),
      );

    // ---------------------------------------------------------------------
    // Behavior
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "Behavior" });
    new Setting(containerEl)
      .setName("Max links per run")
      .setDesc("Cap to avoid blocking Obsidian if the inbox has hundreds of links.")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.maxLinksPerRun))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            this.plugin.settings.maxLinksPerRun = Number.isFinite(n) ? n : 50;
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("Show per-link fetch notices")
      .setDesc(
        "When enabled, a short Notice appears for each link as the LLM fetches it (e.g. 'Inbox: 3/22 — Fetching https://… via LLM…').",
      )
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.showFetchNotices)
          .onChange(async (v) => {
            this.plugin.settings.showFetchNotices = v;
            await this.plugin.saveData(this.plugin.settings);
          }),
      );

    // ---------------------------------------------------------------------
    // Cron (automatic inbox processing)
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "Cron (automatic processing)" });
    containerEl.createEl("p", {
      text:
        "Off by default. When enabled, the plugin processes the inbox every N minutes. " +
        "Notices are suppressed during cron runs (failures still go to the failure log). " +
        "Reload Obsidian after changing these settings.",
      cls: "setting-item-description",
    });
    new Setting(containerEl)
      .setName("Enable cron")
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.cronEnabled)
          .onChange(async (v) => {
            this.plugin.settings.cronEnabled = v;
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("Interval (minutes)")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.cronIntervalMinutes))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            this.plugin.settings.cronIntervalMinutes = Number.isFinite(n) && n > 0 ? n : 15;
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("Run on startup")
      .setDesc("Fire a processInbox immediately when Obsidian loads with cron enabled.")
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.cronRunOnStartup)
          .onChange(async (v) => {
            this.plugin.settings.cronRunOnStartup = v;
            await this.plugin.saveData(this.plugin.settings);
          }),
      );

    // ---------------------------------------------------------------------
    // Archive (move-to-archive command)
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "Archive" });
    containerEl.createEl("p", {
      text:
        "The 'Move to archive' right-click command mirrors the source path under this root. " +
        "Example: 1. Projects/Homelab Manager/Plan.md → 4. Archive/1. Projects/Homelab Manager/Plan.md. " +
        "Adds an `archivedAt` ISO timestamp to the note's frontmatter.",
      cls: "setting-item-description",
    });
    new Setting(containerEl)
      .setName("Archive root")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.archiveRoot)
          .onChange(async (v) => {
            this.plugin.settings.archiveRoot = v.trim() || "4. Archive";
            await this.plugin.saveData(this.plugin.settings);
          }),
      );

    // ---------------------------------------------------------------------
    // Project scaffold
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "Project scaffold" });
    containerEl.createEl("p", {
      text:
        "Used by 'Create project from selection'. The command reads numbered subfolders under " +
        "the projects root live, asks which type + name, then shells out to init-project.py.",
      cls: "setting-item-description",
    });
    new Setting(containerEl)
      .setName("Projects root")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.projectsRoot)
          .onChange(async (v) => {
            this.plugin.settings.projectsRoot = v.trim() || "1. Projects";
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("init-project.py path (vault-relative)")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.templateScriptPath)
          .onChange(async (v) => {
            this.plugin.settings.templateScriptPath = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          }),
      );

    // ---------------------------------------------------------------------
    // Failure log (lives outside the vault, in the OS app-data dir)
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "Failure log" });
    containerEl.createEl("p", {
      text:
        "Per-link failures are appended to a log file outside the vault. " +
        "Use the buttons below to view or clear it. The path is shown at the bottom.",
      cls: "setting-item-description",
    });
    new Setting(containerEl)
      .setName("View failure log")
      .setDesc("Opens the log in Obsidian if it has any entries.")
      .addButton((b) =>
        b.setButtonText("View").onClick(async () => {
          const text = await readFailureLog(
            this.plugin.app,
            this.plugin.manifest.dir,
          );
          if (text === null) {
            new Notice("No failures recorded yet");
            return;
          }
          const dir = await pluginDataDir(
            this.plugin.app,
            this.plugin.manifest.dir,
          );
          const logPath = `${dir}/process-failures.log`;
          await this.plugin.app.workspace.openLinkText(logPath, "", false);
        }),
      )
      .addButton((b) =>
        b
          .setButtonText("Clear")
          .setWarning()
          .onClick(async () => {
            const cleared = await clearFailureLog(
              this.plugin.app,
              this.plugin.manifest.dir,
            );
            new Notice(cleared ? "Failure log cleared" : "Nothing to clear");
          }),
      );
    const pathSetting = new Setting(containerEl)
      .setName("Log file location")
      .setDesc("Computed at runtime — shown for reference.");
    pathSetting.descEl.createEl("code", {
      text: "(populated when first failure occurs)",
    });
    (async () => {
      try {
        const dir = await pluginDataDir(
          this.plugin.app,
          this.plugin.manifest.dir,
        );
        pathSetting.descEl.empty();
        pathSetting.descEl.createEl("code", {
          text: `${dir}/process-failures.log`,
        });
      } catch {
        // best-effort
      }
    })();

    // ---------------------------------------------------------------------
    // Debug (toggle + log file outside the vault)
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "Debug" });
    containerEl.createEl("p", {
      text:
        "When Debug is on, every plugin log line (including errors) is " +
        "appended to debug.log in the OS app-data dir alongside the failure " +
        "log. Off by default — turn on for triage or to file a useful bug " +
        "report. Console output is unaffected by this toggle.",
      cls: "setting-item-description",
    });
    new Setting(containerEl)
      .setName("Enable debug logging")
      .setDesc(
        "Off by default. When on, plugin activity is mirrored to debug.log.",
      )
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.debugEnabled)
          .onChange(async (v) => {
            this.plugin.settings.debugEnabled = v;
            await this.plugin.saveData(this.plugin.settings);
            new Notice(
              v
                ? "Debug logging enabled. New entries go to debug.log."
                : "Debug logging disabled.",
              5000,
            );
          }),
      );
    new Setting(containerEl)
      .setName("View debug log")
      .setDesc("Opens debug.log in Obsidian if it has any entries.")
      .addButton((b) =>
        b.setButtonText("View").onClick(async () => {
          const text = await readDebugLog(
            this.plugin.app,
            this.plugin.manifest.dir,
          );
          if (text === null) {
            new Notice("Debug log is empty");
            return;
          }
          const dir = await pluginDataDir(
            this.plugin.app,
            this.plugin.manifest.dir,
          );
          const logPath = `${dir}/debug.log`;
          await this.plugin.app.workspace.openLinkText(logPath, "", false);
        }),
      )
      .addButton((b) =>
        b
          .setButtonText("Clear")
          .setWarning()
          .onClick(async () => {
            const cleared = await clearDebugLog(
              this.plugin.app,
              this.plugin.manifest.dir,
            );
            new Notice(cleared ? "Debug log cleared" : "Nothing to clear");
          }),
      );
    const debugPathSetting = new Setting(containerEl)
      .setName("Debug log file location")
      .setDesc("Computed at runtime — shown for reference.");
    debugPathSetting.descEl.createEl("code", {
      text: "(populated when debug mode writes its first entry)",
    });
    (async () => {
      try {
        const dir = await pluginDataDir(
          this.plugin.app,
          this.plugin.manifest.dir,
        );
        debugPathSetting.descEl.empty();
        debugPathSetting.descEl.createEl("code", {
          text: `${dir}/debug.log`,
        });
      } catch {
        // best-effort
      }
    })();

    // ---------------------------------------------------------------------
    // Notifications
    // ---------------------------------------------------------------------
    containerEl.createEl("h3", { text: "Notifications" });
    new Setting(containerEl)
      .setName("Notify on error")
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.notifyOnError)
          .onChange(async (v) => {
            this.plugin.settings.notifyOnError = v;
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("Notify URL (apprise-shaped)")
      .setDesc("e.g. http://10.0.0.202:8000/notify/kuster.inbox")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.notifyUrl)
          .onChange(async (v) => {
            this.plugin.settings.notifyUrl = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
  }
}

// ============================================================================
// Duplicate-resolution modal
// ============================================================================

type DuplicateChoice = "skip" | "rename" | "overwrite" | "abort";

// Shown when the destination filename already exists. Returns the user's
// choice via a promise so the caller can `await` it before continuing.
class DuplicateNoteModal extends Modal {
  private notePath: string;
  private sourceUrl: string;
  private onChoose: (choice: DuplicateChoice) => void;

  constructor(
    app: App,
    opts: { notePath: string; sourceUrl: string; onChoose: (c: DuplicateChoice) => void },
  ) {
    super(app);
    this.notePath = opts.notePath;
    this.sourceUrl = opts.sourceUrl;
    this.onChoose = opts.onChoose;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Note already exists" });

    contentEl.createEl("p", {
      text: "A note with this filename already exists in the destination folder.",
    });

    contentEl.createEl("p", { cls: "kip-conflict-path", text: this.notePath }).style.cssText =
      "font-family: var(--font-monospace); font-size: 12px; padding: 6px 8px; background: var(--background-secondary); border-radius: 4px; word-break: break-all;";

    const urlEl = contentEl.createEl("p");
    urlEl.createEl("span", { text: "Source: ", cls: "kip-conflict-label" });
    urlEl.createEl("span", { text: this.sourceUrl, attr: { style: "word-break: break-all;" } });

    const buttonRow = contentEl.createDiv({ cls: "kip-conflict-buttons" });
    buttonRow.style.cssText =
      "display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; flex-wrap: wrap;";

    const closeWith = (choice: DuplicateChoice) => () => {
      this.close();
      this.onChoose(choice);
    };

    // Order matters: most conservative on the left.
    new ButtonComponent(buttonRow)
      .setButtonText("Skip")
      .setTooltip("Keep the existing file. This link stays in the inbox for next time.")
      .onClick(closeWith("skip"));

    new ButtonComponent(buttonRow)
      .setButtonText("Rename (-2)")
      .setTooltip("Save with an incremented suffix, e.g. '... - 2.md'.")
      .onClick(closeWith("rename"));

    new ButtonComponent(buttonRow)
      .setButtonText("Overwrite")
      .setWarning()
      .setTooltip("Delete the existing file and write the new one in its place. Destructive — cannot be undone.")
      .onClick(closeWith("overwrite"));

    new ButtonComponent(buttonRow)
      .setButtonText("Abort batch")
      .setWarning()
      .setTooltip("Stop processing the rest of this batch. Already-processed links are kept.")
      .onClick(closeWith("abort"));

    // Keyboard shortcuts — Enter = Rename (the safe default)
    contentEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        closeWith("rename")();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeWith("skip")();
      }
    });
    // Focus the modal so keyboard works immediately
    setTimeout(() => {
      const btn = buttonRow.querySelector("button");
      btn?.focus();
    }, 0);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

// ============================================================================
// Project-scaffold modal (Create project from selection)
// ============================================================================

interface ProjectTypeOption {
  label: string;       // displayed
  value: string;       // folder name, e.g. "3. Coding"
  absPath: string;     // absolute path on disk for the scaffold destination
}

interface ProjectScaffoldResult {
  typeValue: string;
  name: string;
  key: string;
  initialPlan: string;
}

// Asks for project type (dropdown of <projectsRoot>/<Type>/ subfolders),
// project name, and shows the derived key. Optional initial-plan content
// from the inbox selection is passed through to the Python script.
class ProjectScaffoldModal extends Modal {
  private app: App;
  private types: ProjectTypeOption[];
  private projectsRoot: string;        // vault-relative, default "1. Projects"
  private templateScriptPath: string;  // vault-relative path to init-project.py
  private initialPlan: string;
  private selectedTypeIdx = 0;
  private onDone: (r: ProjectScaffoldResult | null) => void;

  constructor(
    app: App,
    opts: {
      types: ProjectTypeOption[];
      projectsRoot: string;
      templateScriptPath: string;
      initialPlan: string;
      onDone: (r: ProjectScaffoldResult | null) => void;
    },
  ) {
    super(app);
    this.app = app;
    this.types = opts.types;
    this.projectsRoot = opts.projectsRoot;
    this.templateScriptPath = opts.templateScriptPath;
    this.initialPlan = opts.initialPlan;
    this.onDone = opts.onDone;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Create project from selection" });

    if (this.types.length === 0) {
      contentEl.createEl("p", {
        text: `No project-type subfolders found under "${this.projectsRoot}/". Create at least one (e.g. "1. Coding", "2. Personal", etc.) and try again.`,
      });
      const closeBtn = contentEl.createEl("button", { text: "Close" });
      closeBtn.addEventListener("click", () => {
        this.close();
        this.onDone(null);
      });
      return;
    }

    // Project type dropdown
    const typeSetting = new Setting(contentEl)
      .setName("Project type")
      .setDesc("Subfolders of " + this.projectsRoot + "/ — read live from vault.");
    const typeSelect = typeSetting.controlEl.createEl("select");
    this.types.forEach((t, idx) => {
      const opt = typeSelect.createEl("option", { text: t.label, value: String(idx) });
      if (idx === this.selectedTypeIdx) opt.selected = true;
    });
    typeSelect.addEventListener("change", () => {
      this.selectedTypeIdx = parseInt(typeSelect.value, 10) || 0;
    });

    // Preview line is referenced by the nameInput.onChange callback below,
    // so it must be created before the name Setting block. Same for the
    // key input. (Hoisting `let`/`const` doesn't work inside closures that
    // capture by reference, so we declare top-down.)
    const previewEl = contentEl.createEl("p");
    previewEl.style.cssText =
      "font-family: var(--font-monospace); font-size: 12px; padding: 6px 8px; background: var(--background-secondary); border-radius: 4px; margin-top: 8px;";

    const keySetting = new Setting(contentEl)
      .setName("Project key")
      .setDesc("Auto-derived from name (^[A-Z][A-Z0-9-]{1,15}$). Edit if you want.");
    const keyInput = keySetting.controlEl.createEl("input", {
      type: "text",
      attr: { value: "" },
    });
    keyInput.style.width = "100%";
    keyInput.addEventListener("change", () => {
      keyValue = keyInput.value;
    });

    // Project name — must come AFTER keyInput and previewEl so the
    // captured refs are initialised when onChange fires.
    const nameSetting = new Setting(contentEl).setName("Project name");
    let nameValue = "";
    let keyValue = "";
    nameSetting.addText((t) => {
      t.setPlaceholder("My New Project").onChange((v) => {
        nameValue = v;
        keyValue = deriveProjectKey(v);
        keyInput.value = keyValue;
        previewEl.setText(this.previewPath());
      });
    });

    const initialNote = contentEl.createEl("p", {
      text:
        this.initialPlan.length > 0
          ? `Selected text (${this.initialPlan.length} chars) will seed the v0.1 plan.`
          : "No text was selected in the inbox. The new project's plan will start empty.",
      cls: "setting-item-description",
    });

    const buttons = contentEl.createDiv({ attr: { style: "display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px;" } });
    const cancel = buttons.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => {
      this.close();
      this.onDone(null);
    });
    const create = buttons.createEl("button", { text: "Create project" });
    create.addEventListener("click", () => {
      const t = this.types[this.selectedTypeIdx];
      if (!nameValue.trim()) {
        new Notice("Project name is required");
        return;
      }
      if (!/^[A-Z][A-Z0-9-]{1,15}$/.test(keyValue)) {
        new Notice("Project key must match ^[A-Z][A-Z0-9-]{1,15}$");
        return;
      }
      this.close();
      this.onDone({
        typeValue: t.value,
        name: nameValue.trim(),
        key: keyValue,
        initialPlan: this.initialPlan,
      });
    });

    // Focus name field
    setTimeout(() => {
      const input = nameSetting.controlEl.querySelector("input[type='text']") as HTMLInputElement | null;
      input?.focus();
    }, 0);
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  private previewPath(): string {
    const t = this.types[this.selectedTypeIdx];
    if (!t) return "(select a project type)";
    return `${this.projectsRoot}/${t.value}/<name>/`;
  }
}

function deriveProjectKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
}

function formatHm(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============================================================================
// Template generation + CLAUDE.md seed
// ============================================================================

// Default templates keyed by linkType. The plugin generates whichever the
// slot needs. Each one matches the shape of the existing 0. Inbox templates
// (read/processed pair, `{{title}}` placeholder, frontmatter
// `destination`/`url`/`tags` lines that the plugin fills in). The 2-checkbox
// convention is locked by ADR-001 in 5. System/Decision Records/.
const DEFAULT_TEMPLATES: Record<string, string> = {
  link: `---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "⏳ To Process"
destination:
url:
tags: []
source: "{{title}}"
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## 🔗 Source
URL: {{url}}

## 📸 Screenshot
![[../attachments/{{date:YYYYMMDDHHmmss}}.jpg]]

## 📝 Context

*Quick note about why this is saved*

## 🔖 Key Points

*Fill during processing*

## 🔗 Related
-

---

**Captured:** {{date:YYYY-MM-DD HH:mm}}
`,
  media: `---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "📺 To Watch"
category: tv-show
rating:
destination:
url:
tags: [media]
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## User Feedback

User feedback for the note goes here

## 📊 Info

**Year:**
**Director/Author:**
**Genre:**

## 💭 Thoughts

*Add notes after watching/reading*

## ⭐ Rating

*Rate after completion*

---

**Added:** {{date:YYYY-MM-DD}}
`,
  task: `---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "⏳ To Do"
category: task
priority: medium
destination:
url:
tags: [task]
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## User Feedback

User feedback for the note goes here

## Steps

- [ ]

## Notes

*Context and details*

## 🔗 Related
-

---

**Created:** {{date:YYYY-MM-DD}}
`,
  custom: `---
created: {{date:YYYYMMDDHHmmss}}
updated: {{date:YYYYMMDDHHmmss}}
status: "⏳ To Process"
destination:
url:
tags: []
source: "{{title}}"
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## 🔗 Source
URL: {{url}}

## 📝 Context

*Quick note about why this is saved*

## 🔖 Key Points

*Fill during processing*

## 🔗 Related
-

---

**Captured:** {{date:YYYY-MM-DD HH:mm}}
`,
};

// ============================================================================
// Plugin-private data dir (failure log lives here, outside the vault)
// ============================================================================

// Cross-platform plugin data directory. Lives outside the vault so it never
// gets synced. On desktop we use the OS-standard app-data location; on mobile
// (iOS / Android) we fall back to the plugin's own folder inside the vault
// because there's no OS-level app-data dir accessible from a sandboxed plugin.
//
//   Windows: %APPDATA%\Link Inbox Processor\
//   macOS:   ~/Library/Application Support/Link Inbox Processor/
//   Linux:   $XDG_CONFIG_HOME/Link Inbox Processor/  (or ~/.config/...)
//   iOS/Android: <vault>/.obsidian/plugins/kuster-inbox-processor/state/
//
// Returned directory is created if it doesn't exist.
import * as os from "os";
import * as path from "path";

async function pluginDataDir(app: App, manifestDir: string): Promise<string> {
  const isMobile = Platform.isMobile === true;
  let base: string;
  if (isMobile) {
    base = manifestDir; // sandboxed inside vault — file is harmless to sync
  } else if (process.platform === "win32") {
    base = `${process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming")}/Link Inbox Processor`;
  } else if (process.platform === "darwin") {
    base = `${process.env.HOME ?? os.homedir()}/Library/Application Support/Link Inbox Processor`;
  } else {
    const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
    base = `${xdg}/Link Inbox Processor`;
  }
  await app.vault.adapter.mkdir(base).catch(() => undefined);
  return base;
}

async function appendFailureLog(
  app: App,
  manifest: { dir: string },
  url: string,
  errorMessage: string,
): Promise<void> {
  try {
    const dir = await pluginDataDir(app, manifest.dir);
    const logPath = `${dir}/process-failures.log`;
    const ts = new Date().toISOString();
    const line = `${ts} | ${url} | ${errorMessage.replace(/\n/g, " ").trim()}\n`;
    const existing = (await app.vault.adapter.exists(logPath))
      ? await app.vault.adapter.read(logPath)
      : "";
    await app.vault.adapter.write(logPath, existing + line);
  } catch {
    // Don't let logging failures break the main flow.
  }
}

async function clearFailureLog(app: App, manifestDir: string): Promise<boolean> {
  const dir = await pluginDataDir(app, manifestDir);
  const logPath = `${dir}/process-failures.log`;
  if (await app.vault.adapter.exists(logPath)) {
    await app.vault.adapter.remove(logPath);
    return true;
  }
  return false;
}

async function readFailureLog(app: App, manifestDir: string): Promise<string | null> {
  const dir = await pluginDataDir(app, manifestDir);
  const logPath = `${dir}/process-failures.log`;
  if (!(await app.vault.adapter.exists(logPath))) return null;
  return await app.vault.adapter.read(logPath);
}

// ============================================================================
// Debug log — append-only trace of plugin activity when settings.debugEnabled
// is true. Same on-disk directory as the failure log; different filename.
// One line per entry: ISO timestamp + level + message. Multi-line messages
// are joined with \u23ce to keep the file greppable.
// ============================================================================

const DEBUG_LOG_FILE = "debug.log";
type DebugLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

function formatDebugLine(level: DebugLevel, msg: string): string {
  const ts = new Date().toISOString();
  // Collapse multi-line messages so each log entry is one line.
  const flat = String(msg).replace(/\r?\n/g, "\u23ce");
  return `${ts} [${level}] ${flat}\n`;
}

async function appendDebugLog(
  app: App,
  manifestDir: string,
  level: DebugLevel,
  msg: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return; // no-op when debug mode is off
  try {
    const dir = await pluginDataDir(app, manifestDir);
    const logPath = `${dir}/${DEBUG_LOG_FILE}`;
    const line = formatDebugLine(level, msg);
    if (await app.vault.adapter.exists(logPath)) {
      const existing = await app.vault.adapter.read(logPath);
      await app.vault.adapter.write(logPath, existing + line);
    } else {
      await app.vault.adapter.write(logPath, line);
    }
  } catch {
    // Logging must never crash the host command. Swallow.
  }
}

async function readDebugLog(
  app: App,
  manifestDir: string,
): Promise<string | null> {
  const dir = await pluginDataDir(app, manifestDir);
  const logPath = `${dir}/${DEBUG_LOG_FILE}`;
  if (!(await app.vault.adapter.exists(logPath))) return null;
  return await app.vault.adapter.read(logPath);
}

async function clearDebugLog(
  app: App,
  manifestDir: string,
): Promise<boolean> {
  const dir = await pluginDataDir(app, manifestDir);
  const logPath = `${dir}/${DEBUG_LOG_FILE}`;
  if (!(await app.vault.adapter.exists(logPath))) return false;
  await app.vault.adapter.remove(logPath);
  return true;
}

// ============================================================================
// Project scaffolding is now in-process via src/init-project.ts. The
// previous Python-detection code was removed when we replaced
// `child_process.spawn(python, init-project.py, ...)` with a direct
// `import { scaffold } from "./init-project"`. Kept this comment as
// a breadcrumb for anyone reading the history.
// ============================================================================

function seedClaudeContext(): string {
  return `# Inbox Processor — Classification Context

This file is read by the **Link Inbox Processor** plugin and passed to the LLM
as system context. Anything you write here is treated as guidance for how to
classify iOS-shared links into PARA destinations and link-types.

## Vault layout (PARA)

- \`0. Inbox/\` — capture zone. Subfolders: \`Links/\`, \`Media/\`, \`Tasks/\`, \`Research/\`, \`Reference/\`, \`Decision Records/\`, \`Handoffs/\`, \`Dailies/\`, \`Copy Templates/\`.
- \`1. Projects/\` — active outcomes with a finish line. One folder per project.
- \`2. Areas/\` — ongoing responsibilities (no finish line). E.g. Health, Finance, Homelab.
- \`3. Resources/\` — reference material grouped by topic.
- \`4. Archive/\` — completed/dormant notes.
- \`5. System/\` — tooling, templates, agents, personas. NEVER classify here.

## Classification rules

1. If the link is a **movie, show, book, game, podcast, or album** → \`linkType: "media"\`, destination \`0. Inbox/Media/\`.
2. If the link describes **something to do** (a tutorial step, a config to apply, a bug to file, a setup to complete) → \`linkType: "task"\`, destination \`0. Inbox/Tasks/\`.
3. Otherwise it's **a read-once resource** (article, repo, video, blog post, tool page) → \`linkType: "link"\`, destination \`0. Inbox/Links/\`.
4. After it lands in the inbox, **I** will move it to a final PARA destination (\`1. Projects/<Name>/\`, \`2. Areas/<Name>/\`, or \`3. Resources/<topic>/\`). Don't pre-classify into those — keep the inbox the inbox.

## Inbox checkbox convention (locked by ADR-001)

Every note that lands in the inbox uses this 2-checkbox pair immediately after the title:

\`\`\`markdown
- [ ] read #inbox/pending
- [ ] processed #inbox/processed
\`\`\`

- \`read\` = the user has read/acknowledged this note
- \`processed\` = the plugin has finished with it (moved to final destination, or — for Media/Reference/Tasks — marked as settled)

Do not invent other checkbox states. The MSC / Homelab project convention uses a 3-checkbox \`read / reviewed / handled\` triplet but **that convention does NOT apply to the inbox** — it's project-scoped.

## Tagging guidance

- Prefer 2-5 lower-case tags.
- Reuse existing tags where possible (e.g. \`self-hosting\`, \`ai\`, \`3d-printing\`, \`dotnet\`).
- Don't invent compound tags like \`ai-tool\` — use \`ai\` + \`tools\`.
- Avoid generic tags like \`link\`, \`article\`, \`interesting\`.

## Examples

| URL | linkType | destination |
|---|---|---|
| github.com/some/repo | \`link\` | \`0. Inbox/Links\` |
| imdb.com/title/tt123 | \`media\` | \`0. Inbox/Media\` |
| "how to set up nginx" | \`link\` | \`0. Inbox/Links\` |
| "fix X bug by running Y" | \`task\` | \`0. Inbox/Tasks\` |
| youtube.com/watch?v=… (tutorial) | \`task\` | \`0. Inbox/Tasks\` |
| youtube.com/watch?v=… (talk/essay) | \`link\` | \`0. Inbox/Links\` |
`;
}
