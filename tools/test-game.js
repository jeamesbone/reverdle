#!/usr/bin/env node
/**
 * Headless test for game.js. Stubs just enough DOM for the game to run, then
 * plays puzzles by dispatching keydown events the way a real keyboard would.
 *
 * Usage: node tools/test-game.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
// Commented-out markup is not in the document, so neither are its ids.
const IDS = fs
  .readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .match(/id="([^"]+)"/g)
  .map((m) => m.slice(4, -1));

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.text = '';
    this.hidden = false;
    this.open = false;
    this.checked = false;
    this.style = {};
    this.dataset = {};
    this.offsetWidth = 0;
    this.listeners = {};
    const self = this;
    this.classList = {
      set: new Set(),
      add: (c) => self.classList.set.add(c),
      remove: (c) => self.classList.set.delete(c),
      toggle: (c, on) => (on ? self.classList.set.add(c) : self.classList.set.delete(c)),
      contains: (c) => self.classList.set.has(c),
    };
  }
  get className() {
    return [...this.classList.set].join(' ');
  }
  set className(v) {
    this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean));
  }
  get textContent() {
    return this.children.length ? this.children.map((c) => c.textContent).join('') : this.text;
  }
  set textContent(v) {
    this.text = String(v);
    this.children = [];
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  append(...cs) {
    this.children.push(...cs);
  }
  replaceChildren(...cs) {
    this.children = cs;
    this.text = '';
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  getAttribute(name) {
    return name in this.attributes ? this.attributes[name] : null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  fire(type, ev) {
    (this.listeners[type] || []).forEach((fn) => fn(ev || {}));
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
  }
}

function makeSandbox(store = new Map()) {
  const byId = {};
  for (const id of IDS) byId[id] = new Element('div');
  const body = new Element('body');
  const documentElement = new Element('html');
  const listeners = {};

  // The theme picker's buttons exist in index.html; mirror them here.
  for (const choice of ['system', 'light', 'dark']) {
    const button = new Element('button');
    button.dataset.themeChoice = choice;
    byId['theme-picker'].appendChild(button);
  }

  const document = {
    getElementById: (id) => byId[id] || null,
    createElement: (tag) => new Element(tag),
    addEventListener: (type, fn) => (listeners[type] = listeners[type] || []).push(fn),
    body,
    documentElement,
    hidden: false,
  };

  const sandbox = {
    document,
    body,
    byId,
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Set,
    Map,
    setInterval: () => 0,
    matchMedia: () => ({ matches: false }),
    navigator: {},
    window: { addEventListener: () => {} },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      key: (i) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
    _store: store,
    _theme: (choice) =>
      byId['theme-picker'].children.find((b) => b.dataset.themeChoice === choice).fire('click'),
    _key: (key) => {
      (listeners.keydown || []).forEach((fn) =>
        fn({ key, metaKey: false, ctrlKey: false, altKey: false })
      );
    },
  };
  sandbox.window.localStorage = sandbox.localStorage;
  return vm.createContext(sandbox);
}

function boot(ctx) {
  for (const f of ['data/dict.js', 'data/puzzles.js', 'data/tutorial.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return ctx;
}

/** A fresh page load sharing the same localStorage - i.e. a reload. */
function reload(store) {
  return boot(makeSandbox(store));
}

/** A page load. Nothing is auto-opened, so this is just a reload. */
function openPage(store = new Map()) {
  return reload(store);
}

function typeWord(ctx, word) {
  for (const ch of word) ctx._key(ch);
  ctx._key('Enter');
}

/** Rows on the daily board that have a word revealed in them. */
function solvedRows(ctx) {
  return ctx.byId.board.children.filter((row) => row.textContent !== '').length;
}

/** The step counter above the board, e.g. "2 / 4". */
function progress(ctx) {
  return ctx.byId.progress.textContent;
}

function todaysPuzzle(ctx) {
  const day = vm.runInContext(
    'Math.floor((new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())' +
      ' - new Date(2026, 0, 1)) / 86400000)',
    ctx
  );
  const puzzles = vm.runInContext('PUZZLES', ctx);
  return { day, puzzle: puzzles[((day % puzzles.length) + puzzles.length) % puzzles.length] };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/** Thrown to mark a test as not applicable to the current markup. */
class Skipped extends Error {}
const skip = (why) => {
  throw new Skipped(why);
};

/**
 * Opens the example through the menu. The entry point is optional markup, so
 * this reports whether there was a way in rather than assuming one.
 */
function openTutorial(ctx) {
  const entry = ctx.byId['tutorial-open'];
  if (!entry) return false;
  ctx.byId['help-btn'].fire('click');
  entry.fire('click');
  assert.strictEqual(ctx.byId.help.open, false, 'opening the example closes the menu');
  return true;
}

test('nothing is opened over the board on load; the menu button opens it', () => {
  const ctx = reload(new Map());
  assert.strictEqual(ctx.byId.help.open, false, 'no menu on a first visit');
  assert.strictEqual(ctx.byId.tutorial.open, false, 'no tutorial either');

  ctx.byId['help-btn'].fire('click');
  assert.strictEqual(ctx.byId.help.open, true);

  ctx.byId['help-close'].fire('click');
  assert.strictEqual(ctx.byId.help.open, false, 'the X closes it');
});

test('every dialog closes from its own X', () => {
  const ctx = openPage();
  ctx.byId['stats-btn'].fire('click');
  assert.strictEqual(ctx.byId['stats-dialog'].open, true);
  ctx.byId['stats-close'].fire('click');
  assert.strictEqual(ctx.byId['stats-dialog'].open, false);

  if (openTutorial(ctx)) {
    assert.strictEqual(ctx.byId.tutorial.open, true);
    ctx.byId['tut-x'].fire('click');
    assert.strictEqual(ctx.byId.tutorial.open, false);
  }
});

test('solving every row completes the pattern', () => {
  const ctx = openPage();
  const { puzzle } = todaysPuzzle(ctx);
  puzzle.r.forEach(([, word]) => typeWord(ctx, word));
  assert.strictEqual(solvedRows(ctx), puzzle.r.length);
  assert.strictEqual(ctx.byId.result.hidden, false);
  assert.strictEqual(ctx.byId['input-card'].hidden, true);
  assert.strictEqual(ctx.byId.keyboard.hidden, true);
});

test('a wrong guess is recorded as a miss with its real pattern', () => {
  const ctx = openPage();
  const { puzzle } = todaysPuzzle(ctx);
  const wrong = vm
    .runInContext('DICT', ctx)
    .find((w) => w !== puzzle.a && !puzzle.r.some(([, word]) => word === w));
  typeWord(ctx, wrong);
  assert.strictEqual(ctx.byId['misses-card'].hidden, false);
  assert.strictEqual(ctx.byId.misses.textContent, wrong);
  assert.strictEqual(ctx.byId.message.textContent, '', 'the miss speaks for itself');
});

test('the answer itself is rejected', () => {
  const ctx = openPage();
  const { puzzle } = todaysPuzzle(ctx);
  typeWord(ctx, puzzle.a);
  assert.match(ctx.byId.message.textContent, /answer itself/);
  assert.strictEqual(ctx.byId['misses-card'].hidden, true);
});

test('a word outside the dictionary is rejected', () => {
  const ctx = openPage();
  typeWord(ctx, 'zzzzz');
  assert.strictEqual(ctx.byId.message.textContent, 'Not in word list');
});

test('completing the daily records stats and starts a streak', () => {
  const ctx = openPage();
  const { day, puzzle } = todaysPuzzle(ctx);
  puzzle.r.forEach(([, word]) => typeWord(ctx, word));
  const stats = JSON.parse(ctx._store.get('reverdle-stats'));
  assert.strictEqual(stats.played, 1);
  assert.strictEqual(stats.clean, 1, 'no misses means a clean solve');
  assert.strictEqual(stats.streak, 1);
  assert.strictEqual(stats.maxStreak, 1);
  assert.strictEqual(stats.lastDay, day);
  assert.ok(stats.bestMs !== null);
});

test('a played day is never counted twice', () => {
  const store = new Map();
  const ctx = openPage(store);
  const { puzzle } = todaysPuzzle(ctx);
  puzzle.r.forEach(([, word]) => typeWord(ctx, word));
  const first = store.get('reverdle-stats');
  reload(store);
  assert.strictEqual(store.get('reverdle-stats'), first);
  assert.strictEqual(JSON.parse(first).played, 1);
});

test('yesterday extends the streak, an older gap resets it', () => {
  const { day, puzzle } = todaysPuzzle(openPage());

  const play = (lastDay, streak) => {
    const store = new Map([
      [
        'reverdle-stats',
        JSON.stringify({
          played: 3, bestMs: 1000, totalMs: 9000, clean: 1, streak, maxStreak: 5, lastDay,
        }),
      ],
    ]);
    const c = openPage(store);
    puzzle.r.forEach(([, word]) => typeWord(c, word));
    return JSON.parse(store.get('reverdle-stats'));
  };

  assert.strictEqual(play(day - 1, 4).streak, 5, 'yesterday continues the streak');
  assert.strictEqual(play(day - 2, 4).streak, 1, 'a skipped day resets it');
  assert.strictEqual(play(day - 2, 4).maxStreak, 5, 'max streak is kept');
});

test('progress and elapsed time survive a reload', () => {
  const store = new Map();
  const ctx = openPage(store);
  const { day, puzzle } = todaysPuzzle(ctx);
  typeWord(ctx, puzzle.r[0][1]);
  const saved = JSON.parse(store.get('reverdle-' + day));
  assert.strictEqual(saved.solved[0], puzzle.r[0][1]);
  assert.ok(saved.elapsed >= 0);
  // Only the row being worked on is shown, so the counter is the progress.
  assert.strictEqual(progress(reload(store)), '2 / ' + puzzle.r.length);
});

test('only one pattern is shown at a time, the whole list at the end', () => {
  const ctx = openPage();
  const { puzzle } = todaysPuzzle(ctx);
  assert.strictEqual(ctx.byId.board.children.length, 1, 'one row on screen');
  assert.strictEqual(progress(ctx), '1 / ' + puzzle.r.length);

  typeWord(ctx, puzzle.r[0][1]);
  assert.strictEqual(ctx.byId.board.children.length, 1, 'still one row');
  assert.strictEqual(solvedRows(ctx), 0, 'the solved row makes way for the next');
  assert.strictEqual(progress(ctx), '2 / ' + puzzle.r.length);

  puzzle.r.slice(1).forEach(([, word]) => typeWord(ctx, word));
  assert.strictEqual(ctx.byId.board.children.length, puzzle.r.length, 'the full list');
  assert.strictEqual(solvedRows(ctx), puzzle.r.length);
  assert.strictEqual(progress(ctx), puzzle.r.length + ' / ' + puzzle.r.length);
});

test('a later row\'s word is a miss while it is not the row on screen', () => {
  const ctx = openPage();
  const { puzzle } = todaysPuzzle(ctx);
  const later = puzzle.r[puzzle.r.length - 1][1];
  typeWord(ctx, later);
  assert.strictEqual(progress(ctx), '1 / ' + puzzle.r.length, 'still on the first row');
  assert.strictEqual(ctx.byId.misses.textContent, later, 'kept as a miss');

  // And it still solves its own row once that row comes around.
  puzzle.r.slice(0, -1).forEach(([, word]) => typeWord(ctx, word));
  typeWord(ctx, later);
  assert.strictEqual(ctx.byId.result.hidden, false);
});

test('triple-tapping the title deals a random practice puzzle', () => {
  const ctx = openPage();
  ctx.byId.title.fire('click');
  ctx.byId.title.fire('click');
  assert.match(ctx.byId['puzzle-id'].textContent, /^Reverdle #/, 'two taps are just taps');

  ctx.byId.title.fire('click');
  assert.strictEqual(ctx.byId['puzzle-id'].textContent, 'Practice puzzle');
  assert.strictEqual(ctx.byId.message.textContent, 'New practice puzzle');
  assert.strictEqual(solvedRows(ctx), 0, 'a fresh board');

  // The count resets, so the next tap does not immediately deal another.
  ctx.byId.title.fire('click');
  assert.strictEqual(ctx.byId.message.textContent, 'New practice puzzle');
});

test('a practice puzzle is never written to the daily save', () => {
  const store = new Map();
  const ctx = openPage(store);
  const { day } = todaysPuzzle(ctx);
  for (let i = 0; i < 3; i++) ctx.byId.title.fire('click');
  typeWord(ctx, 'zzzzz');
  assert.strictEqual(store.has('reverdle-' + day), false);
});

test('the colour-blind palette persists and repaints the body', () => {
  const store = new Map();
  const ctx = openPage(store);
  assert.strictEqual(ctx.body.classList.contains('cb'), false);
  ctx.byId['cb-toggle'].checked = true;
  ctx.byId['cb-toggle'].fire('change');
  assert.strictEqual(ctx.body.classList.contains('cb'), true);
  assert.strictEqual(store.get('reverdle-cb'), 'true');
  const again = reload(store);
  assert.strictEqual(again.body.classList.contains('cb'), true);
  assert.strictEqual(again.byId['cb-toggle'].checked, true);
});

test('the example is a real puzzle under the same single-solution rule', () => {
  const ctx = openPage();
  const tutorial = vm.runInContext('TUTORIAL', ctx);
  const dict = [...vm.runInContext('DICT', ctx)];

  const scoreIn = (g, a) => {
    const n = a.length;
    const out = new Array(n).fill(0);
    const left = {};
    for (let i = 0; i < n; i++) {
      if (g[i] === a[i]) out[i] = 2;
      else left[a[i]] = (left[a[i]] || 0) + 1;
    }
    for (let i = 0; i < n; i++) {
      if (out[i] === 0 && left[g[i]] > 0) { out[i] = 1; left[g[i]]--; }
    }
    return out.join('');
  };

  assert.strictEqual(tutorial.a.length, 5, 'five letters, like the real game');
  assert.strictEqual(tutorial.r.length, 4, 'four rows, like the real game');
  for (const [pattern, word] of tutorial.r) {
    const matches = dict.filter((w) => scoreIn(w, tutorial.a) === pattern);
    assert.strictEqual(matches.length, 1, `${pattern} must have exactly one solution`);
    assert.strictEqual(matches[0], word);
  }
});

test('the example reveals one row at a time', () => {
  const ctx = openPage();
  const tutorial = vm.runInContext('TUTORIAL', ctx);
  if (!openTutorial(ctx)) return skip('the menu does not offer the example');

  const rows = () => ctx.byId['tut-board'].children;
  const shown = () => rows().filter((r) => r.textContent !== '').length;

  assert.strictEqual(shown(), 0, 'starts with the pattern alone');
  assert.strictEqual(ctx.byId['tut-reveal'].textContent, 'Reveal row 1');
  assert.strictEqual(ctx.byId['tut-note'].textContent, '');

  ctx.byId['tut-reveal'].fire('click');
  assert.strictEqual(shown(), 1);
  assert.strictEqual(rows()[0].textContent, tutorial.r[0][1]);
  assert.strictEqual(ctx.byId['tut-reveal'].textContent, 'Reveal row 2');
  assert.match(
    ctx.byId['tut-note'].textContent,
    new RegExp('^' + tutorial.r[0][1].toUpperCase() + ' - '),
    'the note explains the row just revealed'
  );

  for (let i = 1; i < tutorial.r.length; i++) ctx.byId['tut-reveal'].fire('click');
  assert.strictEqual(shown(), tutorial.r.length);
  assert.strictEqual(ctx.byId['tut-reveal'].hidden, true, 'nothing left to reveal');
  assert.strictEqual(ctx.byId['tut-close'].textContent, 'Got it');
});

test('the example explains every colour it shows', () => {
  const ctx = openPage();
  const tutorial = vm.runInContext('TUTORIAL', ctx);
  if (!openTutorial(ctx)) return skip('the menu does not offer the example');

  const seen = { 2: false, 1: false, 0: false };
  for (const [pattern] of tutorial.r) {
    ctx.byId['tut-reveal'].fire('click');
    const note = ctx.byId['tut-note'].textContent;
    for (const colour of ['2', '1', '0']) {
      if (!pattern.includes(colour)) continue;
      seen[colour] = true;
      const name = { 2: 'green', 1: 'yellow', 0: 'grey' }[colour];
      assert.ok(note.includes(name + ':'), `${pattern} should mention ${name}`);
    }
  }
  assert.ok(seen[2] && seen[1] && seen[0], 'the example shows all three colours');
});

test('typing while the example is open does not reach the board', () => {
  const ctx = openPage();
  const tutorial = vm.runInContext('TUTORIAL', ctx);
  if (!openTutorial(ctx)) return skip('the menu does not offer the example');
  typeWord(ctx, tutorial.r[0][1]);
  assert.strictEqual(solvedRows(ctx), 0, 'board untouched');
});


test('the theme picker persists a choice and falls back to the system', () => {
  const store = new Map();
  const ctx = openPage(store);
  assert.strictEqual(ctx.document.documentElement.dataset.theme, undefined, 'system by default');

  ctx._theme('dark');
  assert.strictEqual(ctx.document.documentElement.dataset.theme, 'dark');
  assert.strictEqual(store.get('reverdle-theme'), 'dark');
  assert.strictEqual(ctx.byId['theme-color'].attributes.content, '#0f1113');

  const again = reload(store);
  assert.strictEqual(again.document.documentElement.dataset.theme, 'dark');

  again._theme('light');
  assert.strictEqual(again.byId['theme-color'].attributes.content, '#f6f7f8');

  again._theme('system');
  assert.strictEqual(again.document.documentElement.dataset.theme, undefined);
  assert.strictEqual(store.has('reverdle-theme'), false, 'system clears the stored choice');
});

test('reset asks first, then wipes everything', () => {
  const store = new Map();
  const ctx = openPage(store);
  store.set('some-other-app', 'keep me');
  const { puzzle } = todaysPuzzle(ctx);
  puzzle.r.forEach(([, word]) => typeWord(ctx, word));
  ctx._theme('dark');
  assert.ok(store.size > 2, 'there is something to wipe');

  ctx.byId['reset-btn'].fire('click');
  assert.strictEqual(ctx.byId['reset-confirm'].hidden, false, 'confirmation is shown');
  assert.strictEqual(ctx.byId['reset-btn'].hidden, true);

  ctx.byId['reset-no'].fire('click');
  assert.strictEqual(ctx.byId['reset-confirm'].hidden, true, 'cancel backs out');
  assert.ok(store.size > 2, 'cancel keeps the data');

  ctx.byId['reset-btn'].fire('click');
  ctx.byId['reset-yes'].fire('click');
  assert.deepStrictEqual([...store.keys()], ['some-other-app'], 'only reverdle keys are removed');
  assert.strictEqual(solvedRows(ctx), 0);
  assert.strictEqual(ctx.byId.result.hidden, true);
  assert.strictEqual(ctx.document.documentElement.dataset.theme, undefined);
  assert.strictEqual(ctx.body.classList.contains('cb'), false);

  ctx.byId['stats-btn'].fire('click');
  assert.strictEqual(ctx.byId['stats-empty'].hidden, false, 'stats are back to empty');

  // The unload handler must not write the cleared day straight back.
  typeWord(ctx, 'zzzzz');
  assert.deepStrictEqual([...store.keys()], ['some-other-app'], 'nothing is written back after a wipe');
});

test('the time is only reported once the pattern is finished', () => {
  const ctx = openPage();
  const { puzzle } = todaysPuzzle(ctx);

  puzzle.r.slice(0, -1).forEach(([, word]) => typeWord(ctx, word));
  assert.strictEqual(ctx.byId.result.hidden, true, 'no time on screen mid-puzzle');
  assert.doesNotMatch(ctx.byId.message.textContent, /\d:\d\d/);

  typeWord(ctx, puzzle.r[puzzle.r.length - 1][1]);
  assert.strictEqual(ctx.byId.result.hidden, false);
  assert.match(ctx.byId['result-text'].textContent, /^Pattern complete in \d+:\d\d/);
});

let failed = 0;
let skipped = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log('  ok  ' + name);
  } catch (e) {
    if (e instanceof Skipped) {
      skipped++;
      console.log('skip  ' + name + ' (' + e.message + ')');
      continue;
    }
    failed++;
    console.log('FAIL  ' + name + '\n      ' + e.message);
  }
}
console.log(
  failed === 0
    ? `\n${tests.length - skipped} passing` + (skipped ? `, ${skipped} skipped` : '')
    : `\n${failed} failing`
);
process.exit(failed ? 1 : 0);
