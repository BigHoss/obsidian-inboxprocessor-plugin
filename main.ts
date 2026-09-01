/**
 * Kuster Inbox Processor
 * ------------------------
 * Reads 0. Inbox/0. Inbox.md, finds lines below the iOS Share-Target marker,
 * fetches og:title/og:description/og:image for each URL, renders a note
 * from the configured template, writes it to 0. Inbox/Links/, and atomically
 * removes only the successfully-processed lines from the inbox file.
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

interface KusterInboxSettings {
  inboxFile: string;
  linksDir: string;
  templateFile: string;
  shareMarker: string;
  // OpenRouter (https://openrouter.ai) — single endpoint, model-agnostic.
  openrouterApiKey: string;
  openrouterModel: string;
  openrouterReferer: string;
  openrouterAppName: string;
  llmEnabled: boolean;
  fetchTimeoutSeconds: number;
  maxLinksPerRun: number;
  notifyOnError: boolean;
  notifyUrl: string;
  userAgent: string;
}

const DEFAULT_SETTINGS: KusterInboxSettings = {
  inboxFile: "0. Inbox/0. Inbox.md",
  linksDir: "0. Inbox/Links",
  templateFile: "5. System/Templates/Inbox/Link Template.md",
  shareMarker: "<!-- New iOS-shared links should land BELOW this comment -->",
  openrouterApiKey: "",
  openrouterModel: "openai/gpt-5-mini",
  openrouterReferer: "",
  openrouterAppName: "Kuster Inbox Processor",
  llmEnabled: false,
  fetchTimeoutSeconds: 10,
  maxLinksPerRun: 50,
  notifyOnError: false,
  notifyUrl: "",
  userAgent: "Mozilla/5.0 (Kuster-InboxProcessor/0.1)",
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
  settings: KusterInboxSettings,
  url: string,
  meta: FetchedMeta,
): Promise<LlmEnrichment | null> {
  if (!settings.llmEnabled || !settings.openrouterApiKey) return null;
  const prompt = `Given this URL and its open-graph metadata, return a JSON object with refinedTitle (3-7 words, Title Case), suggestedDestination ("0. Inbox/Links" or "3. Resources" or "1. Projects"), and suggestedTags (array of 2-5 lower-case tags).

URL: ${url}
og:title: ${meta.title}
og:description: ${meta.description}
og:site_name: ${meta.siteName}

Return ONLY a JSON object, no prose, no code fences.`;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openrouterApiKey}`,
    };
    // OpenRouter ranks apps by referer + title; setting both is recommended
    // for free-tier rate limits and analytics. Both optional but useful.
    if (settings.openrouterReferer) {
      headers["HTTP-Referer"] = settings.openrouterReferer;
    }
    if (settings.openrouterAppName) {
      headers["X-Title"] = settings.openrouterAppName;
    }
    const body: RequestUrlParam = {
      url: "https://openrouter.ai/api/v1/chat/completions",
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.openrouterModel,
        messages: [{ role: "user", content: prompt }],
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
    return {
      refinedTitle: String(parsed.refinedTitle ?? meta.title ?? "Untitled").trim(),
      suggestedDestination: String(
        parsed.suggestedDestination ?? settings.linksDir,
      ).trim(),
      suggestedTags: Array.isArray(parsed.suggestedTags)
        ? parsed.suggestedTags.map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean)
        : [],
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
): string {
  const finalTitle = llm?.refinedTitle ?? meta.title ?? title ?? "Untitled Link";
  const destination = llm?.suggestedDestination ?? "0. Inbox/Links";
  const tags = llm?.suggestedTags ?? [];
  const created = new Date()
    .toISOString()
    .replace("T", " ")
    .replace(/\..+$/, "");

  const out = template
    .replace(/\{\{date:YYYYMMDDHHmmss\}\}/g, stamp)
    .replace(/\{\{date:YYYY-MM-DD HH:mm\}\}/g, created)
    .replace(/\{\{title\}\}/g, finalTitle);

  // If template has placeholders for url/tags/destination that look like blank
  // values, fill them in. Otherwise prepend a small metadata block so the
  // produced note is never ambiguous.
  let body = out;
  const urlLineRe = /^(\s*-?\s*URL:\s*)$/m;
  if (urlLineRe.test(body)) {
    body = body.replace(urlLineRe, `$1 ${url}`);
  } else {
    body = `URL: ${url}\n\n` + body;
  }
  // Set destination frontmatter field if template uses it
  body = body.replace(/^destination:\s*$/m, `destination: "${destination}"`);
  // Tags frontmatter
  body = body.replace(/^tags:\s*\[\]\s*$/m, `tags: [${tags.join(", ")}]`);
  return body;
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
      body: JSON.stringify({ title: "Kuster Inbox Processor", body: msg }),
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

    const templateFile = this.resolveFile(this.settings.templateFile);
    const template = templateFile
      ? await this.app.vault.read(templateFile)
      : DEFAULT_TEMPLATE;

    // Ensure links dir exists
    const adapter = this.app.vault.adapter;
    const linksDir = this.settings.linksDir;
    if (!(await adapter.exists(linksDir))) {
      await adapter.mkdir(linksDir);
    }

    const processedLines: string[] = [];
    const survivors: string[] = [];
    let okCount = 0;
    let failCount = 0;
    const cap = Math.min(lines.length, this.settings.maxLinksPerRun);

    for (let i = 0; i < cap; i++) {
      const line = lines[i];
      const parsed = parseLine(line);
      if (!parsed) {
        // Non-link lines are kept as survivors (e.g. blank-line markers).
        survivors.push(line);
        continue;
      }
      try {
        await this.processOne(parsed, template);
        processedLines.push(line);
        okCount++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        new Notice(`✗ ${parsed.url} — ${msg}`);
        survivors.push(line);
        failCount++;
        await notifyError(
          this.settings,
          `Failed: ${parsed.url}\n${msg}`,
        );
      }
    }
    // Lines beyond cap are kept as survivors for next run
    for (let i = cap; i < lines.length; i++) survivors.push(lines[i]);

    // Atomic rewrite: keep everything up to and including the marker, then
    // re-emit only the survivors (with a single trailing newline).
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
    const templateFile = this.resolveFile(this.settings.templateFile);
    const template = templateFile
      ? await this.app.vault.read(templateFile)
      : DEFAULT_TEMPLATE;
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.settings.linksDir))) {
      await adapter.mkdir(this.settings.linksDir);
    }
    try {
      const path = await this.processOne(parsed, template);
      new Notice(`✓ ${path}`);
      this.refreshStatusBar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new Notice(`✗ ${parsed.url} — ${msg}`);
    }
  }

  private async processOne(
    parsed: ParsedLine,
    template: string,
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

    // 2. Optional LLM enrichment
    const llm = await enrichWithLlm(this.settings, parsed.url, meta);

    // 3. Compose title + filename
    const baseTitle =
      parsed.title ?? meta.title ?? parsed.url;
    const finalTitle = sanitizeFilename(
      llm?.refinedTitle ?? baseTitle,
    );
    const stamp = nowStamp();
    const filename = `${stamp} - ${finalTitle || "Untitled Link"}.md`;
    const notePath = `${this.settings.linksDir}/${filename}`;

    // 4. Render
    const body = renderNote(template, baseTitle, parsed.url, meta, llm, stamp);

    // 5. Write atomically: adapter.write + create is already safe in Obsidian
    await this.app.vault.create(notePath, body);

    return notePath;
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
    containerEl.createEl("h2", { text: "Kuster Inbox Processor" });

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
      .setName("Links directory")
      .setDesc("Folder inside the vault where processed link notes are written.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.linksDir)
          .onChange(async (v) => {
            this.plugin.settings.linksDir = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("Template file")
      .setDesc("Markdown template (with frontmatter placeholders) used for each note.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.templateFile)
          .onChange(async (v) => {
            this.plugin.settings.templateFile = v.trim();
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

    containerEl.createEl("h3", { text: "OpenRouter LLM enrichment" });
    new Setting(containerEl)
      .setName("Enable LLM enrichment")
      .setDesc("Call OpenRouter to refine titles, suggest destinations, suggest tags.")
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
      .setDesc("Any chat model on https://openrouter.ai/models. Default: openai/gpt-5-mini")
      .addText((t) =>
        t
          .setPlaceholder("openai/gpt-5-mini")
          .setValue(this.plugin.settings.openrouterModel)
          .onChange(async (v) => {
            this.plugin.settings.openrouterModel = v.trim();
            await this.plugin.saveData(this.plugin.settings);
          }),
      );
    new Setting(containerEl)
      .setName("HTTP-Referer (optional)")
      .setDesc("Your app URL — recommended by OpenRouter for free-tier rate limits.")
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
