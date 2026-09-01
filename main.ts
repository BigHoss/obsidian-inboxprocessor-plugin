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
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  RequestUrlParam,
  Setting,
  TFile,
} from "obsidian";

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
  fetchTimeoutSeconds: number;
  maxLinksPerRun: number;
  notifyOnError: boolean;
  notifyUrl: string;
  userAgent: string;
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
  fetchTimeoutSeconds: 10,
  maxLinksPerRun: 50,
  notifyOnError: false,
  notifyUrl: "",
  userAgent: "Mozilla/5.0 (Link-InboxProcessor/0.2)",
};

// ============================================================================
// Types
// ============================================================================

interface ParsedLine {
  title: string | null;
  url: string;
  raw: string;
}

interface FetchedMeta {
  title: string;
  description: string;
  image: string;
  siteName: string;
}

interface LlmEnrichment {
  refinedTitle: string;
  suggestedDestination: string;
  suggestedTags: string[];
  linkType: string; // one of the configured TemplateSlot.linkType values
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

function sanitizeFilename(s: string): string {
  return s
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
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
// HTML meta extraction (no DOM parser dependency)
// ============================================================================

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n) => {
      try {
        return String.fromCodePoint(parseInt(n, 10));
      } catch {
        return _m;
      }
    });
}

function matchMeta(html: string, attr: string, value: string): string | null {
  // matches <meta property="og:X" content="..."> in any order of attributes
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1]);
  // try the reverse attribute order
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${value}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]) : null;
}

function extractMeta(html: string): FetchedMeta {
  const title =
    matchMeta(html, "property", "og:title") ??
    matchMeta(html, "name", "twitter:title") ??
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ??
    "";
  const description =
    matchMeta(html, "property", "og:description") ??
    matchMeta(html, "name", "description") ??
    "";
  const image =
    matchMeta(html, "property", "og:image") ??
    matchMeta(html, "name", "twitter:image") ??
    "";
  const siteName = matchMeta(html, "property", "og:site_name") ?? "";
  return {
    title: decodeEntities(title),
    description: decodeEntities(description),
    image: decodeEntities(image),
    siteName: decodeEntities(siteName),
  };
}

// ============================================================================
// Hermes LLM enrichment (optional)
// ============================================================================

async function enrichWithLlm(
  app: App,
  settings: KusterInboxSettings,
  url: string,
  meta: FetchedMeta,
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
    `Return ONLY a JSON object with these fields:\n` +
    `- refinedTitle: 3-7 words, Title Case, human-readable\n` +
    `- linkType: one of the link-type strings above (e.g. "link", "media", "task")\n` +
    `- suggestedDestination: vault-relative path under one of the allowed roots, e.g. "3. Resources/AI" or "0. Inbox/Tasks"\n` +
    `- suggestedTags: array of 2-5 lower-case tags\n\n` +
    `No prose, no code fences.`;

  const userPrompt =
    `URL: ${url}\nog:title: ${meta.title}\nog:description: ${meta.description}\nog:site_name: ${meta.siteName}`;

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
    const r = await requestUrl(body);
    if (r.status < 200 || r.status >= 300) return null;
    const text = r.json?.choices?.[0]?.message?.content ?? "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const parsed = JSON.parse(json);

    // Resolve linkType against configured slots
    const requestedType = String(parsed.linkType ?? "").trim();
    const slot =
      settings.templates.find((t) => t.linkType === requestedType) ??
      settings.templates[0];

    // Validate destination — if LLM gave something unsafe, fall back to the
    // slot's defaultDestination.
    const requestedDest = String(parsed.suggestedDestination ?? "").trim();
    const safeDest = isDestinationAllowed(requestedDest, settings.allowedDestinationRoots)
      ? requestedDest
      : slot.defaultDestination;

    return {
      refinedTitle: String(parsed.refinedTitle ?? meta.title ?? "Untitled").trim(),
      suggestedDestination: safeDest,
      suggestedTags: Array.isArray(parsed.suggestedTags)
        ? parsed.suggestedTags
            .map((t: unknown) => String(t).toLowerCase().trim())
            .filter(Boolean)
        : [],
      linkType: slot.linkType,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Render note from template
// ============================================================================

function renderNote(
  template: string,
  title: string,
  url: string,
  meta: FetchedMeta,
  llm: LlmEnrichment | null,
  stamp: string,
  destination: string,
): string {
  const finalTitle = llm?.refinedTitle ?? meta.title ?? title ?? "Untitled Link";
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

  async onload(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

    // Ribbon icon — one-click process
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

    this.addSettingTab(new KusterInboxSettingTab(this.app, this));

    // Status bar — pending count
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.setText("Inbox: …");
    this.app.workspace.onLayoutReady(() => this.refreshStatusBar());

    this.registerEvent(
      this.app.workspace.on("file-open", () => this.refreshStatusBar()),
    );
    this.registerEvent(
      this.app.vault.on("modify", (f) => {
        if (f.path === this.settings.inboxFile) this.refreshStatusBar();
      }),
    );
  }

  onunload(): void {
    this.statusBarEl?.remove();
  }

  async refreshStatusBar(): Promise<void> {
    if (!this.statusBarEl) return;
    const count = await this.countPending();
    this.statusBarEl.setText(
      count > 0 ? `Inbox: ${count} pending` : "Inbox: clean",
    );
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

  async processInbox(): Promise<void> {
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

    if (lines.length === 0) {
      new Notice("Inbox is clean — no links to process");
      this.refreshStatusBar();
      return;
    }

    // Pre-load all configured templates
    const templatesByType = new Map<string, string>();
    for (const slot of this.settings.templates) {
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
    let failCount = 0;
    const cap = Math.min(lines.length, this.settings.maxLinksPerRun);

    for (let i = 0; i < cap; i++) {
      const line = lines[i];
      const parsed = parseLine(line);
      if (!parsed) {
        survivors.push(line);
        continue;
      }
      try {
        await this.processOne(parsed, templatesByType, defaultTemplate);
        processedLines.push(line);
        okCount++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        new Notice(`✗ ${parsed.url} — ${msg}`);
        survivors.push(line);
        failCount++;
        await notifyError(this.settings, `Failed: ${parsed.url}\n${msg}`);
      }
    }
    for (let i = cap; i < lines.length; i++) survivors.push(lines[i]);

    const tail = survivors.length > 0 ? "\n" + survivors.join("\n") + "\n" : "\n";
    const updated = head + tail;
    await this.app.vault.modify(file, updated);

    new Notice(
      `Inbox: ${okCount} processed, ${failCount} kept for retry${
        cap < lines.length ? `, ${lines.length - cap} deferred` : ""
      }`,
    );
    this.refreshStatusBar();
  }

  async processSingleLine(line: string): Promise<void> {
    const parsed = parseLine(line.trim());
    if (!parsed) {
      new Notice("Current line is not a recognized link");
      return;
    }
    const templatesByType = new Map<string, string>();
    for (const slot of this.settings.templates) {
      const tf = this.resolveFile(slot.templatePath);
      if (tf) templatesByType.set(slot.linkType, await this.app.vault.read(tf));
    }
    const defaultTemplateFile = this.resolveFile(this.settings.defaultTemplatePath);
    const defaultTemplate = defaultTemplateFile
      ? await this.app.vault.read(defaultTemplateFile)
      : DEFAULT_TEMPLATE;
    try {
      const path = await this.processOne(parsed, templatesByType, defaultTemplate);
      new Notice(`✓ ${path}`);
      this.refreshStatusBar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(`✗ ${parsed.url} — ${msg}`);
    }
  }

  private async processOne(
    parsed: ParsedLine,
    templatesByType: Map<string, string>,
    defaultTemplate: string,
  ): Promise<string> {
    // 1. Fetch metadata
    const r = await requestUrl({
      url: parsed.url,
      method: "GET",
      headers: { "User-Agent": this.settings.userAgent },
      throw: false,
    });
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`HTTP ${r.status}`);
    }
    const meta = extractMeta(r.text);

    // 2. Optional LLM enrichment (now classifies linkType + validates destination)
    const llm = await enrichWithLlm(this.app, this.settings, parsed.url, meta);

    // 3. Pick template + destination
    const slot =
      this.settings.templates.find((t) => t.linkType === (llm?.linkType ?? "")) ??
      this.settings.templates[0];
    const template = templatesByType.get(slot.linkType) ?? defaultTemplate;
    const destinationDir = (llm?.suggestedDestination || slot.defaultDestination).trim();

    // 4. Compose title + filename
    const baseTitle = parsed.title ?? meta.title ?? parsed.url;
    const finalTitle = sanitizeFilename(llm?.refinedTitle ?? baseTitle);
    const stamp = nowStamp();
    const filename = `${stamp} - ${finalTitle || "Untitled Link"}.md`;
    const notePath = `${destinationDir}/${filename}`;

    // 5. Render
    const body = renderNote(template, baseTitle, parsed.url, meta, llm, stamp, destinationDir);

    // 6. Write atomically — vault.create auto-creates parent folders
    await this.app.vault.create(notePath, body);

    return notePath;
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

- [ ] {{title}} #inbox/pending

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
      .setName("Fetch timeout (seconds)")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.fetchTimeoutSeconds))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            this.plugin.settings.fetchTimeoutSeconds = Number.isFinite(n)
              ? n
              : 10;
            await this.plugin.saveData(this.plugin.settings);
          }),
      );

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
// Template generation + CLAUDE.md seed
// ============================================================================

// Default templates keyed by linkType. The plugin generates whichever the
// slot needs. Each one matches the shape of the existing 0. Inbox templates
// (read/reviewed/handled triplet, `{{title}}` placeholder, frontmatter
// `destination`/`url`/`tags` lines that the plugin fills in).
const DEFAULT_TEMPLATES: Record<string, string> = {
  link: `---
created: {{date:YYYY-MM-DDTHH:mm}}
updated: {{date:YYYY-MM-DDTHH:mm}}
status: "⏳ To Process"
destination:
url:
tags: []
source: "{{title}}"
---

# {{title}}

- [ ] read #inbox/pending
- [ ] reviewed #inbox/reviewed
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
created: {{date:YYYY-MM-DDTHH:mm}}
updated: {{date:YYYY-MM-DDTHH:mm}}
status: "📺 To Watch"
category: # tv-show | movie | book | game | podcast
rating:
destination:
url:
tags: [media]
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## User Feedback

Users feedback for the note goes here

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
created: {{date:YYYY-MM-DDTHH:mm}}
updated: {{date:YYYY-MM-DDTHH:mm}}
status: "⏳ To Do"
category: task
priority: # high | medium | low
destination:
url:
tags: [task]
---

# {{title}}

- [ ] read #inbox/pending
- [ ] processed #inbox/processed

## User Feedback

Users feedback for the note goes here

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
created: {{date:YYYY-MM-DDTHH:mm}}
updated: {{date:YYYY-MM-DDTHH:mm}}
status: "⏳ To Process"
destination:
url:
tags: []
source: "{{title}}"
---

# {{title}}

- [ ] read #inbox/pending
- [ ] reviewed #inbox/reviewed
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
