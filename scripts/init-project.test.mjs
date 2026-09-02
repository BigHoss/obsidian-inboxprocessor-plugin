#!/usr/bin/env node
/**
 * init-project smoke test.
 *
 * Runs `scaffold()` against a temporary copy of the real Project Folder
 * Template directory and verifies:
 *   - all 6 expected output files exist (the dry-run output the plugin
 *     currently shells out to)
 *   - the rendered `<project_name>.md` file contains the substituted
 *     project name and slug
 *   - .template-version is honoured and rendered into the template_version
 *     placeholder in hermes.toon
 *   - a second scaffold() call with `merge: true` skips existing files
 *   - `plan()` returns the same actions without writing
 *
 * Uses node:test (built into Node 18+), no jest/vitest.
 *
 * Run with:  node scripts/init-project.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Build a TS-on-the-fly loader via esbuild — keeps the test self-contained.
// ---------------------------------------------------------------------------
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, "..");
const TS_SOURCE = path.join(PLUGIN_ROOT, "src", "init-project.ts");

let cachedImpl = null;
async function loadImpl() {
  if (cachedImpl) return cachedImpl;
  const out = await build({
    entryPoints: [TS_SOURCE],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2020",
    write: false,
    sourcemap: false,
    logLevel: "silent",
  });
  const js = out.outputFiles[0].text;
  const tmpFile = path.join(os.tmpdir(), `init-project-${process.pid}-${Date.now()}.mjs`);
  await fs.writeFile(tmpFile, js, "utf8");
  const mod = await import(pathToFileURL(tmpFile).href);
  cachedImpl = mod;
  return mod;
}

// ---------------------------------------------------------------------------
// Copy the real template folder into a tempdir so the test doesn't depend
// on the user's vault being in any particular state.
// ---------------------------------------------------------------------------
const REAL_TEMPLATE = path.join(
  os.homedir(),
  "Documents",
  "Kuster.live",
  "5. System",
  "Templates",
  "Project Folder Template",
);

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isFile()) {
      await fs.copyFile(s, d);
    }
  }
}

async function copyTemplateToTmp() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "init-project-test-"));
  await copyDir(REAL_TEMPLATE, tmp);
  return tmp;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("scaffold renders all 6 expected files into a fresh destination", async (t) => {
  const { scaffold } = await loadImpl();

  const templateDir = await copyTemplateToTmp();
  const dstDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "init-project-dst-"),
  );
  t.after(async () => {
    await fs.rm(templateDir, { recursive: true, force: true });
    await fs.rm(dstDir, { recursive: true, force: true });
  });

  const actions = await scaffold(templateDir, dstDir, {
    name: "Smoke Test Project",
    key: "SMOKE",
    status: "working",
    vaultRoot: path.dirname(dstDir),
    projectRelpath: path.basename(dstDir),
  });

  // 6 expected outputs from the manifest's `render` list, with .template
  // stripped.
  const expected = [
    "Smoke Test Project.md",
    "CLAUDE.md",
    "hermes.toon",
    "SMOKE - Pending decisions.md",
    path.join("Research", "CLAUDE.md"),
    path.join("Decision Records", "CLAUDE.md"),
  ];
  for (const rel of expected) {
    const full = path.join(dstDir, rel);
    assert.ok(
      await exists(full),
      `expected output file should exist: ${rel}`,
    );
  }

  // Each of those should be a "render" action.
  const renders = actions.filter((a) => a.action === "render");
  assert.equal(renders.length, 6, "should have produced 6 render actions");

  // No leftover unresolved placeholders on the render actions we care about.
  for (const a of renders) {
    assert.deepEqual(
      a.unresolved ?? [],
      [],
      `no unresolved placeholders in ${path.relative(dstDir, a.dstPath)}`,
    );
  }
});

test("rendered <project_name>.md contains the substituted project name + key", async (t) => {
  const { scaffold } = await loadImpl();
  const templateDir = await copyTemplateToTmp();
  const dstDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "init-project-dst-"),
  );
  t.after(async () => {
    await fs.rm(templateDir, { recursive: true, force: true });
    await fs.rm(dstDir, { recursive: true, force: true });
  });

  await scaffold(templateDir, dstDir, {
    name: "Sub Check",
    key: "SUB",
    status: "paused",
    vaultRoot: path.dirname(dstDir),
    projectRelpath: path.basename(dstDir),
  });

  const indexPath = path.join(dstDir, "Sub Check.md");
  const text = await fs.readFile(indexPath, "utf8");
  assert.match(text, /# Sub Check/, "title should contain project name");
  assert.match(text, /status: paused/, "status placeholder should be substituted");
  assert.match(text, /Sub Check/, "slug should appear via tag (lower-cased key)");
  assert.match(text, /tags:.*sub/, "tags should include lower-cased key");

  // Required frontmatter.
  const fmMatches = text.match(/^---\s*$/gm);
  assert.ok(fmMatches && fmMatches.length >= 2, "frontmatter delimiters present");
});

test("hermes.toon contains schema_version 1.1 and template_version from .template-version", async (t) => {
  const { scaffold } = await loadImpl();
  const templateDir = await copyTemplateToTmp();
  const dstDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "init-project-dst-"),
  );
  t.after(async () => {
    await fs.rm(templateDir, { recursive: true, force: true });
    await fs.rm(dstDir, { recursive: true, force: true });
  });

  await scaffold(templateDir, dstDir, {
    name: "Toon Check",
    key: "TOON",
    vaultRoot: path.dirname(dstDir),
    projectRelpath: path.basename(dstDir),
  });

  const toon = await fs.readFile(path.join(dstDir, "hermes.toon"), "utf8");
  assert.match(toon, /schema_version:\s*1\.1/, "schema_version 1.1 present");
  assert.match(
    toon,
    /template_version:\s*0\.5/,
    "template_version placeholder substituted from .template-version",
  );
});

test("merge: true skips files that already exist at dst", async (t) => {
  const { scaffold } = await loadImpl();
  const templateDir = await copyTemplateToTmp();
  const dstDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "init-project-dst-"),
  );
  t.after(async () => {
    await fs.rm(templateDir, { recursive: true, force: true });
    await fs.rm(dstDir, { recursive: true, force: true });
  });

  // First pass: write everything.
  await scaffold(templateDir, dstDir, {
    name: "Merge Check",
    key: "MERGE",
    vaultRoot: path.dirname(dstDir),
    projectRelpath: path.basename(dstDir),
  });

  const originalIndexPath = path.join(dstDir, "Merge Check.md");
  const original = await fs.readFile(originalIndexPath, "utf8");
  // Modify the file so we can tell whether scaffold touched it.
  await fs.writeFile(originalIndexPath, "USER EDIT\n", "utf8");

  // Second pass with merge: true should skip, not overwrite.
  const actions = await scaffold(templateDir, dstDir, {
    name: "Merge Check",
    key: "MERGE",
    merge: true,
    vaultRoot: path.dirname(dstDir),
    projectRelpath: path.basename(dstDir),
  });

  const after = await fs.readFile(originalIndexPath, "utf8");
  assert.equal(after, "USER EDIT\n", "merge must preserve existing bytes");

  const skips = actions.filter((a) => a.action === "skip");
  assert.ok(skips.length >= 1, "merge should produce at least one skip action");
  for (const s of skips) {
    assert.match(s.reason ?? "", /merge/);
  }
});

test("plan returns the same actions as scaffold(dryRun:true) and writes nothing", async (t) => {
  const { plan } = await loadImpl();
  const templateDir = await copyTemplateToTmp();
  const dstDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "init-project-dst-"),
  );
  t.after(async () => {
    await fs.rm(templateDir, { recursive: true, force: true });
    await fs.rm(dstDir, { recursive: true, force: true });
  });

  const actions = await plan(templateDir, dstDir, {
    name: "Plan Check",
    key: "PLAN",
    vaultRoot: path.dirname(dstDir),
    projectRelpath: path.basename(dstDir),
  });

  assert.equal(actions.length, 6);
  // Dst directory should still be empty.
  const entries = await fs.readdir(dstDir);
  assert.deepEqual(entries, [], "plan must not write any files");
});

test("required_outputs validation throws if a render fails to write", async (t) => {
  const { scaffold } = await loadImpl();
  const templateDir = await copyTemplateToTmp();
  // Delete one of the required-output source templates to force a render error.
  await fs.rm(path.join(templateDir, "hermes.toon.template"));
  const dstDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "init-project-dst-"),
  );
  t.after(async () => {
    await fs.rm(templateDir, { recursive: true, force: true });
    await fs.rm(dstDir, { recursive: true, force: true });
  });

  await assert.rejects(
    () =>
      scaffold(templateDir, dstDir, {
        name: "Validation Check",
        key: "VAL",
        vaultRoot: path.dirname(dstDir),
        projectRelpath: path.basename(dstDir),
      }),
    /render source missing/,
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
