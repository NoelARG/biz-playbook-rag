// scripts/make-share-pack.mjs
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set(["node_modules", ".next", ".git", "docs", "data", ".vercel", "dist", "build"]);
const EXCLUDE_FILES = new Set([".env", ".env.local", ".env.production"]);
const INCLUDE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".css", ".md", ".yml", ".yaml", ".toml"]);

const outPath = path.join(ROOT, "share-pack.txt");
const header = (p) => `\n\n===== FILE: ${p.replace(ROOT + path.sep, "")} =====\n`;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      walk(full);
    } else {
      const ext = path.extname(e.name);
      if (EXCLUDE_FILES.has(e.name)) continue;
      if (!INCLUDE_EXT.has(ext)) continue;
      const rel = full.replace(ROOT + path.sep, "");
      fs.appendFileSync(outPath, header(full));
      fs.appendFileSync(outPath, fs.readFileSync(full, "utf8"));
    }
  }
}

fs.writeFileSync(outPath, `### biz-playbook-rag code pack (${new Date().toISOString()})\nProject root: ${ROOT}\n`);
walk(ROOT);
console.log("Wrote:", outPath);
