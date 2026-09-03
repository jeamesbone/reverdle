#!/usr/bin/env node
/** Re-checks the generated schedule: every row must have exactly one solution. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ctx = {};
new Function(fs.readFileSync(path.join(ROOT, 'data', 'dict.js'), 'utf8') + '\nthis.DICT=DICT;').call(ctx);
new Function(
  fs.readFileSync(path.join(ROOT, 'data', 'puzzles.js'), 'utf8') + '\nthis.PUZZLES=PUZZLES;'
).call(ctx);
const { DICT, PUZZLES } = ctx;

function score(g, a) {
  const out = [0, 0, 0, 0, 0];
  const left = {};
  for (let i = 0; i < 5; i++) {
    if (g[i] === a[i]) out[i] = 2;
    else left[a[i]] = (left[a[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] === 0 && left[g[i]] > 0) { out[i] = 1; left[g[i]]--; }
  }
  return out.join('');
}

let bad = 0;
for (const p of PUZZLES) {
  const seen = new Set();
  for (const [pattern, word] of p.r) {
    if (pattern === '22222') { console.error('all-green row', p.a); bad++; }
    if (seen.has(pattern)) { console.error('duplicate row', p.a); bad++; }
    seen.add(pattern);
    const matches = DICT.filter((w) => score(w, p.a) === pattern);
    if (matches.length !== 1 || matches[0] !== word) {
      console.error(`AMBIGUOUS ${p.a} ${pattern}: ${matches.join(',')}`);
      bad++;
    }
  }
}
console.log(bad === 0
  ? `OK - ${PUZZLES.length} puzzles, ${PUZZLES.length * 3} rows, every row has exactly one solution`
  : `${bad} problems`);
process.exit(bad === 0 ? 0 : 1);
