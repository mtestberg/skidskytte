#!/usr/bin/env node
// Sätter ett nytt versionsnummer (?v=...) på alla egna filer som spelet laddar,
// så att webbläsare som har gamla filer cachade (GitHub Pages cachar ca 10 min)
// aldrig blandar gamla och nya moduler efter en uppdatering.
// Kör före varje commit som ändrar spelet:   node tools/bump-version.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const v = process.argv[2] || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12); // ÅÅÅÅMMDDttmm
let changed = 0;

function rewrite(path, fn) {
  const before = readFileSync(path, 'utf8');
  const after = fn(before);
  if (after !== before) { writeFileSync(path, after); changed++; }
}

// 1) import-satser i src/*.js:  './x.js'  eller  './x.js?v=gammal'
for (const f of readdirSync(join(root, 'src')).filter((n) => n.endsWith('.js'))) {
  rewrite(join(root, 'src', f), (s) =>
    s.replace(/((?:from\s+|import\s*\(\s*)['"])(\.\/[\w.-]+\.js)(?:\?v=[\w-]+)?(['"])/g, `$1$2?v=${v}$3`));
}
// 2) index.html: stilmall och huvudskript (three.js har fast version r170 och ändras inte)
rewrite(join(root, 'index.html'), (s) =>
  s.replace(/(href="style\.css)(?:\?v=[\w-]+)?(")/, `$1?v=${v}$2`)
   .replace(/(src="src\/main\.js)(?:\?v=[\w-]+)?(")/, `$1?v=${v}$2`));

console.log(`version ${v} – ${changed} filer uppdaterade`);
