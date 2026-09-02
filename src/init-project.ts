/**
 * init-project.ts — in-process TypeScript port of the project-template scaffold
 * logic from `5. System/Templates/Project Folder Template/scripts/init-project.py`.
 *
 * The Obsidian plugin imports this directly (no shell-out, no PyYAML, no Jinja).
 *
 * Subset of the Python script that's implemented here:
 *   - load template.yaml (a small hand-rolled YAML reader, not js-yaml)
 *   - load .template-version
 *   - render the manifest's `render` list with placeholder substitution
 *   - copy the manifest's `copy` list verbatim
 *   - honour `merge` (skip existing) and `dry-run` (no writes)
 *   - validate `validation.required_outputs` exist and `validation.forbidden_outputs` do not
 *
 * Placeholders supported (subset, matching the templates in the project folder
 * template directory):
 *   - {{ project_name }}
 *   - {{ project_key }}
 *   - {{ project_slug }}      (lowercase, slugified from project_name)
 *   - {{ project_relpath }}   (POSIX-style relative path of dst under vault)
 *   - {{ status }}            (working | paused)
 *   - {{ created }}           (today, ISO YYYY-MM-DD)
 *   - {{ template_version }}  (from .template-version)
 *   - {{ repo_path }}         (empty string by default — we don't shell out)
 *   - {{ repo_url }}          (empty string by default)
 *   - {{ vault_root }}        (absolute vault path)
 *   - {{ dst }}               (absolute dst path)
 *   - {{ migration_date }}    (today, ISO YYYY-MM-DD)
 *   - {{ date:FORMAT }}       (FORMAT ∈ { YYYYMMDDHHmmss, YYYY-MM-DD HH:mm,
 *                                         YYYY-MM-DDTHH:mm, YYYY-MM-DD })
 *   - {{ date:FORMAT_OFFSET }} (FORMAT above, OFFSET like "+1day" or "-2hours")
 *   - {{ date }}              (ISO 8601 full)
 *
 *  Note: this is intentionally *strict* about rendering — if a template uses a
 *  placeholder we don't recognise, we leave it untouched and surface it via
 *  the `unresolved` field on the returned actions. The Python script raises;
 *  here we surface the problem but still produce a usable scaffold so the
 *  plugin UI can show the user what went wrong.
 *
 * No external deps. Uses only `node:fs/promises` and `node:path`.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ScaffoldActionType = "render" | "copy" | "skip" | "mkdir";

export interface ScaffoldAction {
  action: ScaffoldActionType;
  srcPath?: string; // template-side path (render/copy only)
  dstPath: string; // destination-side path
  reason?: string; // for skip: why skipped (e.g. "merge: file exists")
  unresolved?: string[]; // any {{...}} placeholders we couldn't resolve
}

export interface ScaffoldOptions {
  name: string;
  key: string;
  status?: "working" | "paused";
  /** YYYY-MM-DD; defaults to today (local). */
  created?: string;
  /** POSIX-style vault-relative path of the project. Defaults to dst basename. */
  projectRelpath?: string;
  /** Absolute vault root path. Used to compute projectRelpath. */
  vaultRoot?: string;
  /** repo_path placeholder. Empty string by default. */
  repoPath?: string;
  /** repo_url placeholder. Empty string by default. */
  repoUrl?: string;
  /** stack list placeholder. Default []. */
  stack?: string[];
  /** If true: skip files that already exist at dst. Default false. */
  merge?: boolean;
  /** If true: do not write — only return the planned actions. Default false. */
  dryRun?: boolean;
  /** Path to the .template-version file relative to templateDir. Default '.template-version'. */
  templateVersionFile?: string;
}

// ---------------------------------------------------------------------------
// Manifest shape (subset of the YAML we read)
// ---------------------------------------------------------------------------

interface Manifest {
  schema_version?: number;
  template_version_file?: string;
  render?: string[];
  copy?: string[];
  exclude?: string[];
  validation?: {
    required_outputs?: string[];
    forbidden_outputs?: string[];
  };
}

// ---------------------------------------------------------------------------
// Path safety helpers
// ---------------------------------------------------------------------------

function asPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  // path.relative returns "" when equal, a relative path starting with ".."
  // when escaping, or a clean relative path otherwise.
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function looksLikeTraversal(p: string): boolean {
  return p.split(/[\\/]/).includes("..");
}

// ---------------------------------------------------------------------------
// Tiny YAML reader — handles the subset template.yaml uses.
//
// Supported subset:
//   - top-level string keys ("schema_version: 1")
//   - top-level string keys with list values, both inline ("render: [\"a\", \"b\"]")
//     and block ("render:\n  - \"a\"\n  - \"b\"")
//   - nested object ("validation:\n  required_outputs:\n    - \"a\"")
//   - strings may be quoted with " or ' or be bare
//
// Anything else is left as-is and surfaced via the `warnings` array.
// ---------------------------------------------------------------------------

interface YamlWarning {
  message: string;
  line?: number;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function parseScalar(raw: string): unknown {
  const t = raw.trim();
  if (t === "" || t === "~" || t.toLowerCase() === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
  // Heuristic: if it starts with [ it's a flow list (handled by caller).
  return stripQuotes(t);
}

function parseFlowList(s: string): string[] {
  // Handle a single-line flow list like ['"a"', "'b'", "c"] — keep it simple.
  const inner = s.trim().replace(/^\[/, "").replace(/\]$/, "");
  const out: string[] = [];
  // Very small CSV-ish parser; the only thing the templates use is quoted
  // strings separated by commas.
  let buf = "";
  let quote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      if (ch === "\\" && i + 1 < inner.length) {
        buf += inner[++i];
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ",") {
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

function parseManifestYaml(text: string): { manifest: Manifest; warnings: YamlWarning[] } {
  const warnings: YamlWarning[] = [];
  const lines = text.split(/\r?\n/);
  const manifest: Manifest = {};

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const lineNo = i + 1;
    const stripped = raw.replace(/#.*$/, "").trimEnd();
    if (!stripped.trim() || /^\s*#/.test(stripped)) {
      i++;
      continue;
    }

    // Top-level key: "key: value"
    const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(stripped.trim());
    if (!m) {
      warnings.push({ message: `cannot parse line: ${stripped}`, line: lineNo });
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2].trim();

    if (rest === "") {
      // Block-style value: gather the indented children.
      const block: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const child = lines[j];
        if (child.trim() === "" || /^\s*#/.test(child)) {
          j++;
          continue;
        }
        const indentMatch = /^( {2,}|\t)/.exec(child);
        if (!indentMatch) break;
        block.push(child.replace(/^\s+/, ""));
        j++;
      }
      i = j;
      // Try to parse the block as nested object or list.
      if (key === "validation") {
        const obj = parseBlockObject(block);
        manifest.validation = obj as Manifest["validation"];
      } else if (
        key === "render" ||
        key === "copy" ||
        key === "exclude"
      ) {
        manifest[key] = parseBlockList(block);
      } else {
        // Unknown top-level key — keep raw join as a string for diagnostics.
        warnings.push({ message: `unknown top-level key: ${key}`, line: lineNo });
      }
    } else if (rest.startsWith("[") && rest.endsWith("]")) {
      // Flow-style list value.
      const items = parseFlowList(rest);
      if (key === "render" || key === "copy" || key === "exclude") {
        manifest[key] = items;
      } else if (key === "schema_version") {
        const v = parseScalar(items.join(","));
        manifest.schema_version = typeof v === "number" ? v : undefined;
      } else {
        warnings.push({ message: `unexpected flow list for key: ${key}`, line: lineNo });
      }
      i++;
    } else {
      // Scalar value.
      if (key === "schema_version") {
        const v = parseScalar(rest);
        manifest.schema_version = typeof v === "number" ? v : undefined;
      } else if (key === "template_version_file") {
        manifest.template_version_file = stripQuotes(rest);
      } else {
        warnings.push({ message: `unknown top-level key: ${key}`, line: lineNo });
      }
      i++;
    }
  }

  return { manifest, warnings };
}

function parseBlockObject(block: string[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  let i = 0;
  while (i < block.length) {
    const stripped = block[i].replace(/#.*$/, "").trimEnd();
    if (!stripped) {
      i++;
      continue;
    }
    const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(stripped);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2].trim();
    if (rest === "") {
      const sub: string[] = [];
      let j = i + 1;
      while (j < block.length) {
        const child = block[j];
        if (child.trim() === "" || /^\s*#/.test(child)) {
          j++;
          continue;
        }
        // We only support one more level of nesting here.
        if (!/^ {2,}/.test(child)) break;
        sub.push(child.replace(/^ {2}/, ""));
        j++;
      }
      i = j;
      obj[key] = parseBlockList(sub);
    } else if (rest.startsWith("[") && rest.endsWith("]")) {
      obj[key] = parseFlowList(rest);
      i++;
    } else {
      obj[key] = stripQuotes(rest);
      i++;
    }
  }
  return obj;
}

function parseBlockList(block: string[]): string[] {
  const out: string[] = [];
  for (const raw of block) {
    const stripped = raw.replace(/#.*$/, "").trimEnd();
    if (!stripped) continue;
    // Each list item starts with "- ".
    const m = /^-\s+(.*)$/.exec(stripped);
    if (m) {
      const rest = m[1].trim();
      if (rest.startsWith("[") && rest.endsWith("]")) {
        out.push(...parseFlowList(rest));
      } else {
        out.push(stripQuotes(rest));
      }
    } else {
      // Continuation of the previous item; append to the last entry.
      if (out.length) {
        out[out.length - 1] += " " + stripQuotes(stripped);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Date placeholder rendering
// ---------------------------------------------------------------------------

const DATE_FORMATS = new Set([
  "YYYYMMDDHHmmss",
  "YYYY-MM-DD HH:mm",
  "YYYY-MM-DDTHH:mm",
  "YYYY-MM-DD",
]);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date, fmt: string): string {
  switch (fmt) {
    case "YYYYMMDDHHmmss":
      return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    case "YYYY-MM-DD HH:mm":
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case "YYYY-MM-DDTHH:mm":
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    case "YYYY-MM-DD":
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    default:
      return d.toISOString();
  }
}

function applyOffset(d: Date, offset: string): Date {
  // Offset examples: "+1day", "-2days", "+3hours", "-30minutes".
  const m = /^([+-]\d+)(day|days|hour|hours|minute|minutes|second|seconds)$/.exec(
    offset.trim(),
  );
  if (!m) return d;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const result = new Date(d.getTime());
  switch (unit) {
    case "day":
    case "days":
      result.setDate(result.getDate() + n);
      break;
    case "hour":
    case "hours":
      result.setHours(result.getHours() + n);
      break;
    case "minute":
    case "minutes":
      result.setMinutes(result.getMinutes() + n);
      break;
    case "second":
    case "seconds":
      result.setSeconds(result.getSeconds() + n);
      break;
  }
  return result;
}

function renderDatePlaceholder(expr: string, now: Date): string | undefined {
  const trimmed = expr.trim();
  if (trimmed === "date") return now.toISOString();
  if (!trimmed.startsWith("date:")) return undefined;
  const body = trimmed.slice("date:".length).trim();
  // Optional offset suffix: "FORMAT+1day".
  const offsetMatch = /^(.+?)([+-]\d+(?:day|days|hour|hours|minute|minutes|second|seconds))$/.exec(
    body,
  );
  let fmt = body;
  let offset: string | null = null;
  if (offsetMatch) {
    fmt = offsetMatch[1];
    offset = offsetMatch[2];
  }
  // Default to ISO if format isn't recognised; this matches the Python
  // script's "jinja will substitute unknown vars as empty" tolerance.
  const finalFmt = DATE_FORMATS.has(fmt) ? fmt : "YYYY-MM-DD";
  const target = offset ? applyOffset(now, offset) : now;
  return formatDate(target, finalFmt);
}

// ---------------------------------------------------------------------------
// Placeholder substitution
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

interface RenderContext {
  name: string;
  key: string;
  slug: string;
  status: "working" | "paused";
  created: string;
  templateVersion: string;
  projectRelpath: string;
  vaultRoot: string;
  dstAbs: string;
  repoPath: string;
  repoUrl: string;
  stack: string[];
  now: Date;
}

function buildRenderContext(
  templateDir: string,
  dstDir: string,
  opts: ScaffoldOptions,
  templateVersion: string,
): RenderContext {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const created = opts.created ?? today;
  const vaultRoot = opts.vaultRoot ?? "";
  const projectRelpath =
    opts.projectRelpath ?? path.basename(path.resolve(dstDir));
  return {
    name: opts.name,
    key: opts.key,
    slug: slugify(opts.name),
    status: opts.status ?? "working",
    created,
    templateVersion,
    projectRelpath,
    vaultRoot,
    dstAbs: path.resolve(dstDir),
    repoPath: opts.repoPath ?? "",
    repoUrl: opts.repoUrl ?? "",
    stack: opts.stack ?? [],
    now,
  };
}

function applyFilter(value: string, filter: string): string {
  switch (filter) {
    case "lower":
      return value.toLowerCase();
    case "upper":
      return value.toUpperCase();
    case "trim":
      return value.trim();
    case "default":
      // Default filter is handled specially by renderText (it consumes the
      // parenthesised argument as a literal). This branch exists so that
      // an explicit "default" with no argument falls back to "".
      return value;
    default:
      // Unknown filter — leave value untouched; the unresolved placeholder
      // will be surfaced by the caller.
      return value;
  }
}

function resolveExpr(
  expr: string,
  lookup: Record<string, string>,
): { value: string | undefined; reason: string | undefined } {
  // Jinja lets you write `a or "fallback"` — treat as "value if value else fallback".
  // Split off the trailing `or <literal-or-ident>` first; this is shallow,
  // but the templates only use a single `or` clause so that's fine.
  const orMatch = /^(.+?)\s+or\s+(.+)$/.exec(expr);
  if (orMatch) {
    const lhsExpr = orMatch[1].trim();
    const rhsExpr = orMatch[2].trim();
    const lhs = resolveExpr(lhsExpr, lookup);
    const lhsVal = lhs.value ?? "";
    if (lhsVal) return { value: lhsVal, reason: undefined };
    // RHS may itself be a filter chain or a literal.
    if (Object.prototype.hasOwnProperty.call(lookup, rhsExpr)) {
      return { value: lookup[rhsExpr], reason: undefined };
    }
    return { value: stripQuotes(rhsExpr), reason: undefined };
  }

  // Split "name | filter | filter2" into ["name", "filter", "filter2"].
  // Filters with arguments ("default('working')") are reduced to their
  // name + arg in the caller; here we treat each token as either a bare
  // filter name (no args) or a name with a parenthesised argument we can
  // parse.
  const tokens: { kind: "ident" | "filter"; name: string; arg?: string }[] = [];
  const parts = expr.split("|").map((p) => p.trim());
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0) {
      tokens.push({ kind: "ident", name: part });
      continue;
    }
    const filterMatch = /^([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?$/.exec(part);
    if (!filterMatch) return { value: undefined, reason: part };
    tokens.push({
      kind: "filter",
      name: filterMatch[1],
      arg: filterMatch[2],
    });
  }

  // Resolve the identifier.
  const ident = tokens[0].name;
  let value: string | undefined;
  if (Object.prototype.hasOwnProperty.call(lookup, ident)) {
    value = lookup[ident];
  } else {
    return { value: undefined, reason: ident };
  }

  // Apply filters in order. `default` is special — its argument is the
  // fallback when value is empty.
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.kind !== "filter") continue;
    if (tok.name === "default") {
      const fallback = tok.arg ? stripQuotes(tok.arg) : "";
      if (value === undefined || value === "") value = fallback;
      continue;
    }
    value = applyFilter(value ?? "", tok.name);
  }

  return { value, reason: undefined };
}

function renderText(s: string, ctx: RenderContext): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const lookup: Record<string, string> = {
    project_name: ctx.name,
    project_key: ctx.key,
    project_slug: ctx.slug,
    status: ctx.status,
    created: ctx.created,
    template_version: ctx.templateVersion,
    project_relpath: ctx.projectRelpath,
    vault_root: ctx.vaultRoot,
    dst: ctx.dstAbs,
    repo_path: ctx.repoPath,
    repo_url: ctx.repoUrl,
    migration_date: ctx.created,
  };
  const text = s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();
    if (trimmed.startsWith("date") || trimmed === "date") {
      const r = renderDatePlaceholder(trimmed, ctx.now);
      if (r === undefined) {
        unresolved.push(trimmed);
        return _match;
      }
      return r;
    }
    const { value, reason } = resolveExpr(trimmed, lookup);
    if (value === undefined) {
      unresolved.push(reason ?? trimmed);
      return _match;
    }
    return value;
  });
  return { text, unresolved };
}

function renderTemplatePath(s: string, ctx: RenderContext): string {
  // Render the manifest entry path itself (e.g. "{{ project_name }}.md.template").
  const { text } = renderText(s, ctx);
  return text;
}

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

async function loadManifest(templateDir: string): Promise<{
  manifest: Manifest;
  yamlWarnings: YamlWarning[];
}> {
  const manifestPath = path.join(templateDir, "template.yaml");
  const raw = await fs.readFile(manifestPath, "utf8");
  const { manifest, warnings } = parseManifestYaml(raw);
  return { manifest, yamlWarnings: warnings };
}

async function readTemplateVersion(
  templateDir: string,
  relPath: string,
): Promise<string> {
  const versionPath = path.join(templateDir, relPath);
  const raw = await fs.readFile(versionPath, "utf8");
  const stripped = raw.trim();
  if (!/^\d+(?:\.\d+)*$/.test(stripped)) {
    throw new Error(
      `init-project: invalid template version at ${versionPath}: ${JSON.stringify(raw)}`,
    );
  }
  return stripped;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function mkdirp(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

// ---------------------------------------------------------------------------
// Plan + scaffold
// ---------------------------------------------------------------------------

export async function plan(
  templateDir: string,
  dstDir: string,
  opts: Omit<ScaffoldOptions, "dryRun">,
): Promise<ScaffoldAction[]> {
  return run(templateDir, dstDir, { ...opts, dryRun: true });
}

export async function scaffold(
  templateDir: string,
  dstDir: string,
  opts: ScaffoldOptions,
): Promise<ScaffoldAction[]> {
  return run(templateDir, dstDir, opts);
}

async function run(
  templateDir: string,
  dstDir: string,
  opts: ScaffoldOptions,
): Promise<ScaffoldAction[]> {
  const templateDirAbs = path.resolve(templateDir);
  const dstDirAbs = path.resolve(dstDir);

  if (looksLikeTraversal(dstDir)) {
    throw new Error(`init-project: destination contains '..' traversal: ${dstDir}`);
  }
  if (path.resolve(templateDirAbs) === path.resolve(dstDirAbs)) {
    throw new Error(
      `init-project: destination equals template root: ${dstDirAbs}. That's almost certainly a mistake.`,
    );
  }

  // 1. Manifest.
  const { manifest } = await loadManifest(templateDirAbs);
  const templateVersionRel =
    manifest.template_version_file ?? opts.templateVersionFile ?? ".template-version";
  const templateVersion = await readTemplateVersion(
    templateDirAbs,
    templateVersionRel,
  );

  // 2. Render context.
  const ctx = buildRenderContext(
    templateDirAbs,
    dstDirAbs,
    opts,
    templateVersion,
  );

  // 3. Plan render + copy actions.
  const renderList = manifest.render ?? [];
  const copyList = manifest.copy ?? [];
  const excludeList = manifest.exclude ?? [];
  const requiredOutputs = manifest.validation?.required_outputs ?? [];
  const forbiddenOutputs = manifest.validation?.forbidden_outputs ?? [];

  const actions: ScaffoldAction[] = [];
  const writtenDstPaths = new Set<string>();

  // 3a. Render list.
  for (const srcRel of renderList) {
    const srcAbs = path.join(templateDirAbs, srcRel);
    if (!(await exists(srcAbs))) {
      throw new Error(`init-project: render source missing: ${srcRel}`);
    }
    const renderedSrcRel = renderTemplatePath(srcRel, ctx);
    let outRel = asPosix(renderedSrcRel);
    if (outRel.endsWith(".template")) {
      outRel = outRel.slice(0, -".template".length);
    }
    const outAbs = path.join(dstDirAbs, outRel);
    if (!isWithin(outAbs, dstDirAbs)) {
      throw new Error(`init-project: render output escapes dst: ${outRel}`);
    }

    if (opts.merge && (await exists(outAbs))) {
      actions.push({
        action: "skip",
        srcPath: srcAbs,
        dstPath: outAbs,
        reason: "merge: file exists",
      });
      continue;
    }

    const raw = await fs.readFile(srcAbs, "utf8");
    const { text, unresolved } = renderText(raw, ctx);
    if (!opts.dryRun) {
      await mkdirp(path.dirname(outAbs));
      await fs.writeFile(outAbs, text, "utf8");
    }
    writtenDstPaths.add(asPosix(path.relative(dstDirAbs, outAbs)));
    actions.push({
      action: "render",
      srcPath: srcAbs,
      dstPath: outAbs,
      unresolved: unresolved.length ? unresolved : undefined,
    });
  }

  // 3b. Copy list.
  for (const srcRel of copyList) {
    const srcAbs = path.join(templateDirAbs, srcRel);
    if (!(await exists(srcAbs))) {
      throw new Error(`init-project: copy source missing: ${srcRel}`);
    }
    const outRel = asPosix(srcRel);
    const outAbs = path.join(dstDirAbs, outRel);
    if (!isWithin(outAbs, dstDirAbs)) {
      throw new Error(`init-project: copy output escapes dst: ${outRel}`);
    }
    if (opts.merge && (await exists(outAbs))) {
      actions.push({
        action: "skip",
        srcPath: srcAbs,
        dstPath: outAbs,
        reason: "merge: file exists",
      });
      continue;
    }
    if (!opts.dryRun) {
      await mkdirp(path.dirname(outAbs));
      await fs.copyFile(srcAbs, outAbs);
    }
    writtenDstPaths.add(asPosix(path.relative(dstDirAbs, outAbs)));
    actions.push({
      action: "copy",
      srcPath: srcAbs,
      dstPath: outAbs,
    });
  }

  // 3c. Exclude guard (warn if anything in exclude is staged).
  for (const excluded of excludeList) {
    if (excluded.endsWith("**")) {
      const prefix = excluded.slice(0, -3).replace(/\/$/, "");
      const staged = Array.from(writtenDstPaths);
      for (const dstRel of staged) {
        if (dstRel === prefix || dstRel.startsWith(prefix + "/")) {
          throw new Error(`init-project: excluded path was staged: ${dstRel}`);
        }
      }
    } else {
      if (writtenDstPaths.has(asPosix(excluded))) {
        throw new Error(`init-project: excluded path present in dst: ${excluded}`);
      }
    }
  }

  // 4. Validation (only after writes; plan returns without throwing).
  if (!opts.dryRun) {
    const missingRequired: string[] = [];
    for (const required of requiredOutputs) {
      const renderedRequired = asPosix(renderTemplatePath(required, ctx));
      const cleaned = renderedRequired.endsWith(".template")
        ? renderedRequired.slice(0, -".template".length)
        : renderedRequired;
      if (!(await exists(path.join(dstDirAbs, cleaned)))) {
        missingRequired.push(cleaned);
      }
    }
    if (missingRequired.length) {
      throw new Error(
        `init-project: missing required outputs: ${missingRequired.join(", ")}`,
      );
    }

    for (const forbidden of forbiddenOutputs) {
      const renderedForbidden = asPosix(renderTemplatePath(forbidden, ctx));
      const cleaned = renderedForbidden.endsWith(".template")
        ? renderedForbidden.slice(0, -".template".length)
        : renderedForbidden;
      if (await exists(path.join(dstDirAbs, cleaned))) {
        throw new Error(
          `init-project: forbidden output present: ${cleaned}`,
        );
      }
    }
  }

  return actions;
}

// Re-export the lazy `import` namespace for callers that want to
// programmatically explore what was written. The plugin's main.ts imports
// `scaffold` and `plan` by name; this re-export is purely defensive.
export type { Manifest };

// Late-bind node:fs/promises and node:path so the module compiles even if
// the bundler wires externals differently across hosts. (Both are Node
// built-ins already in the plugin's esbuild externals list.)
import * as fs from "fs/promises";
import * as path from "path";
