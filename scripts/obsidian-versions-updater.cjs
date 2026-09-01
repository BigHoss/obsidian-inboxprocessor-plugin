"use strict";

/**
 * Custom updater for standard-version that writes the new version into
 * the Obsidian plugin's versions.json file. Obsidian uses versions.json
 * to know which Obsidian app version each plugin release supports.
 *
 * Schema of versions.json:
 *   {
 *     "0.5.0": "1.5.0",  // plugin-version -> min-obsidian-version
 *     "0.4.1": "1.5.0",
 *     ...
 *   }
 *
 * On every release we add a new top-level entry mapping the new plugin
 * version to the same minObsidianVersion as the most recent prior entry
 * (a "carry forward" — if the prior release was OK on Obsidian 1.5.0,
 * the new one almost certainly is too). To bump the minObsidianVersion,
 * edit versions.json by hand AFTER the release.
 */

function readVersion(contents) {
  const data = JSON.parse(contents);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("versions.json must be a top-level object");
  }
  const keys = Object.keys(data);
  if (keys.length === 0) {
    throw new Error("versions.json is empty — cannot determine current version");
  }
  // Versions are stored as bare semver keys (e.g. "0.5.0"), not "v0.5.0".
  // Use semver-style sort to find the latest.
  const sorted = keys.sort((a, b) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  });
  return sorted[sorted.length - 1];
}

function writeVersion(contents, version) {
  const data = JSON.parse(contents);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("versions.json must be a top-level object");
  }
  // Carry forward the minObsidianVersion from the most recent prior entry.
  // If there's nothing prior, default to "1.5.0".
  const existingKeys = Object.keys(data).sort((a, b) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
    }
    return 0;
  });
  const minObsidian = existingKeys.length > 0
    ? data[existingKeys[existingKeys.length - 1]]
    : "1.5.0";
  data[version] = minObsidian;
  // Preserve insertion order (newest at the end) by rebuilding the object.
  const ordered = {};
  for (const k of existingKeys) ordered[k] = data[k];
  ordered[version] = minObsidian;
  return JSON.stringify(ordered, null, 2) + "\n";
}

module.exports = { readVersion, writeVersion };
