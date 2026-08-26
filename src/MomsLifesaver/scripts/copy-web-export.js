#!/usr/bin/env node

/**
 * Copies the `expo export -p web` output (`dist/`) into `docs/` at the repo
 * root, replacing whatever was there.
 *
 * A plain `rm -rf ../../docs && mkdir -p ../../docs && cp -r dist/. ../../docs/`
 * shell chain only works under a POSIX shell. `npm run` on Windows executes
 * scripts via cmd.exe, where `rm`/`mkdir -p`/`cp -r` are not recognized - the
 * chain died at `rm` and `docs/` was silently never updated, no matter how
 * many times the export ran. `fs.rmSync`/`fs.cpSync` do the same work
 * through Node itself, so this runs identically regardless of which shell
 * invoked `npm`.
 */
const fs = require("fs");
const path = require("path");

const distDir = path.join(process.cwd(), "dist");
const docsDir = path.join(process.cwd(), "..", "..", "docs");

if (!fs.existsSync(distDir)) {
  console.error(`export:web: expected ${distDir} to exist - did the expo export step fail?`);
  process.exit(1);
}

fs.rmSync(docsDir, { recursive: true, force: true });
fs.cpSync(distDir, docsDir, { recursive: true });

console.log(`export:web: copied ${distDir} -> ${docsDir}`);
