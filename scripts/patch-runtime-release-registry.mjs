import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../runtime-release-registry.mjs', import.meta.url);
let source = await readFile(path, 'utf8');
const additions = [
  ["  'shadow-portfolio-ledger.mjs',", "  'shadow-portfolio-cold-archive.mjs',"],
  ["  'biggj-memory-governor.mjs',", "  'research-data-plane-maintenance.mjs',"]
];
for (const [anchor, line] of additions) {
  if (!source.includes(line)) {
    if (!source.includes(anchor)) throw new Error(`anchor missing: ${anchor}`);
    source = source.replace(anchor, `${anchor}\n${line}`);
  }
}
await writeFile(path, source);
