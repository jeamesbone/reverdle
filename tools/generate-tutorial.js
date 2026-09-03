#!/usr/bin/env node
/**
 * Picks the tutorial puzzle: a 3-row, 4-letter version of the real game.
 *
 * Same guarantee as the daily: each pattern is produced by exactly one word in
 * the whole 4-letter dictionary. The solutions are additionally restricted to
 * the COMMON list below so a first-time player can actually find them.
 *
 * Usage: node tools/generate-tutorial.js
 * Writes: data/tutorial.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROWS = 3;

const DICT = fs
  .readFileSync(path.join(ROOT, 'data', 'words-4.txt'), 'utf8')
  .split(/\s+/)
  .filter((w) => /^[a-z]{4}$/.test(w));

// Everyday words only - the tutorial must never turn on vocabulary.
const COMMON = `able acid aged also area army away baby back ball band bank base
bath bear beat been beer bell belt bend best bike bird bite blue boat body bone
book boot born both bowl bulk burn bush busy cake call calm camp card care cart
case cash cast cell chat chef chip city clay club coal coat code cold come cook
cool copy cord core corn cost crew crop dark data date dawn days dead deal dear
debt deep deer desk dial diet dirt dish disk does dogs done door down draw drop
drum dual duck dust duty each earn ease east easy edge else even ever exit face
fact fade fail fair fall fame farm fast fear feed feel feet fell felt file fill
film find fine fire firm fish five flag flat flew flow food foot ford form fort
four free from fuel full fund gain game gate gave gear gift girl give glad goal
goes gold golf gone good gray grew grey grid grow gulf hair half hall hand hang
hard harm hate have hawk head heal heap hear heat held hell help herb here hero
hide high hill hint hire hold hole holy home hope horn host hour huge hunt hurt
idea inch iron item jazz join joke jump jury just keen keep kept kick kind king
knee knew know lack lady lake lamb lamp land lane last late lawn lazy lead leaf
lean left lend lens less lift like limb lime line link lion list live load loan
lock loft logo lone long look loop lord lose loss lost loud love luck lung made
mail main make male mall many mark mask mass mate meal mean meat meet melt menu
mere mess mild mile milk mill mind mine miss mist mode mood moon more most move
much must myth nail name navy near neat neck need news next nice nine none noon
nose note noun oath odds once only onto open oral over pace pack page paid pain
pair pale palm park part pass past path peak pear peer pick pile pill pine pink
pipe plan play plot plug plus poem poet pole poll pond pool poor pork port pose
post pour pray prey pull pump pure push quit quiz race rage raid rail rain rank
rare rate read real rear rely rent rest rice rich ride ring riot rise risk road
robe rock rode role roll roof room root rope rose rude rule rush safe sail sake
salt same sand save scan seal seat seed seek seem seen self sell send sent shed
ship shoe shop shot show shut sick side sign silk sing sink site size skin skip
slip slow snap snow soap sock soft soil sold sole solo some song soon sort soul
soup sour spin spot star stay stem step stir stop such suit sure swim tale talk
tall tank tape task taxi team tear tell tend tent term test text than that them
then they thin this thus tide tidy tile till time tiny tire toll tone tool tour
town toxic trap tray tree trim trip true tube tune turn twin twist type unit
upon urge used user vary vast very vice view visa void vote wage wait wake walk
wall want ward warm warn wash wave weak wear week well went were west what when
whom wide wife wild will wind wine wing wipe wire wise wish with wolf wood wool
word wore work worn wrap yard yarn year your zero zone`
  .split(/\s+/)
  .filter((w) => /^[a-z]{4}$/.test(w));

const dictSet = new Set(DICT);
const common = COMMON.filter((w) => dictSet.has(w));

function score(guess, answer) {
  const out = [0, 0, 0, 0];
  const left = {};
  for (let i = 0; i < 4; i++) {
    if (guess[i] === answer[i]) out[i] = 2;
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < 4; i++) {
    if (out[i] === 0 && left[guess[i]] > 0) {
      out[i] = 1;
      left[guess[i]]--;
    }
  }
  return out.join('');
}

const ease = (p) => 2 * (p.match(/2/g) || []).length + (p.match(/1/g) || []).length;
const commonSet = new Set(common);

const candidates = [];
for (const answer of common) {
  const byPattern = new Map();
  for (const w of DICT) {
    const p = score(w, answer);
    let bucket = byPattern.get(p);
    if (!bucket) byPattern.set(p, (bucket = []));
    bucket.push(w);
  }
  const unique = [];
  for (const [pattern, words] of byPattern) {
    if (pattern === '2222') continue;
    if (words.length !== 1) continue;
    if (!commonSet.has(words[0])) continue;
    unique.push({ pattern, word: words[0] });
  }
  if (unique.length < ROWS) continue;
  unique.sort((a, b) => ease(b.pattern) - ease(a.pattern));
  const step = (unique.length - 1) / (ROWS - 1);
  const rows = [];
  for (let i = 0; i < ROWS; i++) rows.push(unique[Math.round(i * step)]);
  // A good teaching puzzle opens easy and ends on a row with some yellows,
  // so the player has to think about position, not just letters.
  const yellows = rows.reduce((n, r) => n + (r.pattern.match(/1/g) || []).length, 0);
  candidates.push({ answer, rows, yellows, opener: ease(rows[0].pattern) });
}

candidates.sort((a, b) => b.opener - a.opener || b.yellows - a.yellows);

const pick = candidates[0];
fs.writeFileSync(
  path.join(ROOT, 'data', 'tutorial.js'),
  '// Generated by tools/generate-tutorial.js - do not edit by hand.\n' +
    'const TUTORIAL = ' +
    JSON.stringify({
      a: pick.answer,
      r: pick.rows.map((r) => [r.pattern, r.word]),
      dict: DICT,
    }) +
    ';\n'
);

console.log(`${candidates.length} candidates`);
console.log('picked:', pick.answer, JSON.stringify(pick.rows));
console.log('runners up:', candidates.slice(1, 6).map((c) => c.answer + ' ' + c.rows.map((r) => r.word).join('/')));
