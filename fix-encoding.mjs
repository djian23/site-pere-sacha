import fs from "node:fs/promises";
import path from "node:path";

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    if (entry.isFile() && /\.(html|mjs|txt|xml|js|css)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const files = await walk(".");
let fixed = 0;
for (const file of files) {
  let text = await fs.readFile(file, "utf8");
  let updated = text.replace(/\uFFFD"/g, "").replace(/l\uFFFD/g, "l");
  if (/[��]|’|⬦/.test(updated)) {
    updated = Buffer.from(updated, "latin1").toString("utf8")
      .replace(/^\uFFFD/, "")
      .replace(/\uFFFD\u001c/g, "S")
      .replace(/\uFFFD"/g, "");
  }
  if (updated !== text) {
    await fs.writeFile(file, updated, "utf8");
    fixed++;
  }
}
console.log(`fixed ${fixed} files`);
