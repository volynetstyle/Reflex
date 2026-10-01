import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rules = readFileSync(resolve(packageRoot, "docs/RULES.md"), "utf8");
const rows = rules
  .split(/\r?\n/)
  .filter((line) => /^\|\s*R\d+\s*\|/.test(line));
const failures = [];
const seen = new Set();
let citations = 0;

for (const row of rows) {
  const cells = row
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
  const [id, , ...references] = cells;
  if (seen.has(id)) failures.push(`${id}: duplicate rule ID`);
  seen.add(id);
  if (cells.length !== 5) {
    failures.push(`${id}: expected five table columns`);
    continue;
  }

  for (const [column, cell] of references.entries()) {
    const matches = [...cell.matchAll(/`([^`]+)::([^`]+)`/g)];
    if (matches.length === 0) {
      failures.push(`${id}: missing citation in column ${column + 3}`);
      continue;
    }

    for (const [, path, literal] of matches) {
      citations += 1;
      const target = resolve(packageRoot, path);
      const inside = relative(packageRoot, target);
      if (inside.startsWith(`..${sep}`) || inside === ".." || inside === "") {
        failures.push(`${id}: citation leaves package: ${path}`);
        continue;
      }
      let source;
      try {
        source = readFileSync(target, "utf8");
      } catch {
        failures.push(`${id}: missing file: ${path}`);
        continue;
      }
      if (!source.includes(literal)) {
        failures.push(
          `${id}: missing literal ${JSON.stringify(literal)} in ${path}`,
        );
      }
    }
  }
}

if (rows.length === 0) failures.push("no rule rows found");

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Checked ${rows.length} rules and ${citations} citations.\n`,
  );
}
