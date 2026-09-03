(() => {
  'use strict';

  const DICT_SET = new Set(DICT);
  const CLASS = { '2': 'g', '1': 'y', '0': 'x' };
  const EMOJI = {
    normal: { '2': '\u{1F7E9}', '1': '\u{1F7E8}', '0': '\u{2B1C}' },
    cb: { '2': '\u{1F7E6}', '1': '\u{1F7E7}', '0': '\u{2B1C}' },
  };

  const STATS_KEY = 'reverdle-stats';
  const CB_KEY = 'reverdle-cb';
  const THEME_KEY = 'reverdle-theme';
  const KEY_PREFIX = 'reverdle-';
  const THEME_COLOURS = { light: '#f6f7f8', dark: '#0f1113' };
  const EMPTY_STATS = {
    played: 0,
    bestMs: null,
    totalMs: 0,
    clean: 0,
    streak: 0,
    maxStreak: 0,
    lastDay: null,
  };

  const el = {
    answer: document.getElementById('answer-row'),
    board: document.getElementById('board'),
    inputCard: document.getElementById('input-card'),
    current: document.getElementById('current-row'),
    message: document.getElementById('message'),
    missesCard: document.getElementById('misses-card'),
    misses: document.getElementById('misses'),
    progress: document.getElementById('progress'),
    statsSummary: document.getElementById('stats-summary'),
    statsFull: document.getElementById('stats-full'),
    statsEmpty: document.getElementById('stats-empty'),
    statsDialog: document.getElementById('stats-dialog'),
    cbToggle: document.getElementById('cb-toggle'),
    themePicker: document.getElementById('theme-picker'),
    resetBtn: document.getElementById('reset-btn'),
    resetConfirm: document.getElementById('reset-confirm'),
    resetYes: document.getElementById('reset-yes'),
    resetNo: document.getElementById('reset-no'),
    themeColour: document.getElementById('theme-color'),
    timer: document.getElementById('timer'),
    result: document.getElementById('result'),
    resultText: document.getElementById('result-text'),
    share: document.getElementById('share-btn'),
    practice: document.getElementById('practice-btn'),
    keyboard: document.getElementById('keyboard'),
    puzzleId: document.getElementById('puzzle-id'),
    header: document.getElementById('app-header'),
    footnote: document.getElementById('footnote'),
    main: document.getElementById('main'),
    help: document.getElementById('help'),
    title: document.getElementById('title'),
  };

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function readString(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* private browsing - play on without saving */
    }
  }

  function writeString(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* private browsing - play on without saving */
    }
  }

  // Only ever removes this game's own keys. GitHub Pages puts every site on
  // one origin, so localStorage.clear() would take the neighbours' data too.
  function clearOwnKeys() {
    try {
      const doomed = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.indexOf(KEY_PREFIX) === 0) doomed.push(key);
      }
      for (const key of doomed) localStorage.removeItem(key);
    } catch (e) {
      /* nothing stored to clear */
    }
  }

  function removeKey(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      /* nothing to clean up */
    }
  }

  // Set by a reset, so the unload handler cannot write the cleared day back.
  let wiped = false;
  let stats = Object.assign({}, EMPTY_STATS, readJSON(STATS_KEY, null));
  let colourBlind = readJSON(CB_KEY, false) === true;
  let theme = ['light', 'dark'].includes(readString(THEME_KEY)) ? readString(THEME_KEY) : 'system';

  // Standard Wordle scoring, kept identical to tools/generate.js.
  function score(guess, answer) {
    const n = answer.length;
    const out = new Array(n).fill(0);
    const left = {};
    for (let i = 0; i < n; i++) {
      if (guess[i] === answer[i]) out[i] = 2;
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < n; i++) {
      if (out[i] === 0 && left[guess[i]] > 0) {
        out[i] = 1;
        left[guess[i]]--;
      }
    }
    return out.join('');
  }

  function dayIndex() {
    const [y, m, d] = LAUNCH_DATE.split('-').map(Number);
    const launch = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((today - launch) / 86400000);
  }

  let state;

  function loadDaily() {
    const day = dayIndex();
    const n = ((day % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;
    const puzzle = PUZZLES[n];
    state = {
      daily: true,
      number: day + 1,
      key: 'reverdle-' + day,
      answer: puzzle.a,
      rows: puzzle.r,
      solved: puzzle.r.map(() => null),
      misses: [],
      guesses: 0,
      elapsed: 0,
      runningSince: null,
      typed: '',
      done: false,
    };
    restore();
  }

  function loadPractice() {
    const puzzle = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
    state = {
      daily: false,
      number: null,
      key: null,
      answer: puzzle.a,
      rows: puzzle.r,
      solved: puzzle.r.map(() => null),
      misses: [],
      guesses: 0,
      elapsed: 0,
      runningSince: null,
      typed: '',
      done: false,
    };
  }

  function save() {
    if (!state.daily || wiped) return;
    try {
      localStorage.setItem(
        state.key,
        JSON.stringify({
          solved: state.solved,
          misses: state.misses,
          guesses: state.guesses,
          elapsed: elapsedMs(),
        })
      );
    } catch (e) {
      /* private browsing - play on without saving */
    }
  }

  function restore() {
    let raw = null;
    try {
      raw = localStorage.getItem(state.key);
    } catch (e) {
      return;
    }
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      if (Array.isArray(s.solved) && s.solved.length === state.rows.length)
        state.solved = s.solved;
      if (Array.isArray(s.misses)) state.misses = s.misses;
      if (typeof s.guesses === 'number') state.guesses = s.guesses;
      if (typeof s.elapsed === 'number') state.elapsed = s.elapsed;
      state.done = state.solved.every(Boolean);
    } catch (e) {
      /* corrupt save - start fresh */
    }
  }

  // The row the player is on. Rows are worked through in order, so this is
  // simply the first one still unsolved, and -1 once the pattern is complete.
  function activeRow() {
    return state.solved.findIndex((w) => !w);
  }

  // The clock runs only while the tab is visible and the puzzle is unfinished,
  // so closing the tab overnight does not wreck your time.
  function elapsedMs() {
    return state.elapsed + (state.runningSince ? Date.now() - state.runningSince : 0);
  }

  function startClock() {
    if (state.done || state.runningSince) return;
    state.runningSince = Date.now();
  }

  function pauseClock() {
    if (!state.runningSince) return;
    state.elapsed += Date.now() - state.runningSince;
    state.runningSince = null;
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  // Daily results only, once per day. Streak counts consecutive day indexes.
  function recordResult() {
    if (!state.daily) return;
    const day = state.number - 1;
    if (stats.lastDay === day) return;
    stats.streak = stats.lastDay === day - 1 ? stats.streak + 1 : 1;
    stats.lastDay = day;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    stats.played += 1;
    const ms = elapsedMs();
    stats.totalMs += ms;
    if (stats.bestMs === null || ms < stats.bestMs) stats.bestMs = ms;
    if (state.guesses === state.rows.length) stats.clean += 1;
    writeJSON(STATS_KEY, stats);
  }

  function renderStats(target) {
    const today = dayIndex();
    // A streak is only live if it includes today or yesterday.
    const live = stats.lastDay === today || stats.lastDay === today - 1 ? stats.streak : 0;
    const cells = [
      [stats.played, 'played'],
      [stats.bestMs === null ? '-' : formatTime(stats.bestMs), 'best'],
      [stats.played ? formatTime(stats.totalMs / stats.played) : '-', 'average'],
      [stats.clean, 'no misses'],
      [live, 'streak'],
      [stats.maxStreak, 'max streak'],
    ];
    target.replaceChildren(
      ...cells.map(([value, label]) => {
        const cell = document.createElement('div');
        cell.className = 'stat';
        const b = document.createElement('b');
        b.textContent = value;
        const span = document.createElement('span');
        span.textContent = label;
        cell.append(b, span);
        return cell;
      })
    );
  }

  // The keyboard is pinned to the bottom, so the tiles take whatever height is
  // left over. Collapsing the tiles first and measuring everything else avoids
  // guessing at label, gap and keyboard heights, which move with the font, the
  // viewport and the browser's own chrome.
  function fitBoard() {
    if (typeof window !== 'object' || typeof window.innerHeight !== 'number') return;
    const root = document.documentElement;
    if (!root || !root.style || typeof root.style.setProperty !== 'function') return;

    const BORDER = 4; // a collapsed tile is still two 2px borders tall
    const tileRows = 1 + (state.done ? state.rows.length : 2); // answer + board + input

    root.style.setProperty('--tile', '0px');

    const style = getComputedStyle(el.main);
    const gap = parseFloat(style.rowGap) || 0;
    const shown = Array.prototype.filter.call(el.main.children, (node) => !node.hidden);
    let used = gap * Math.max(0, shown.length - 1);
    for (const node of shown) used += node.offsetHeight;

    const room =
      el.main.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const byHeight = (room - used) / tileRows + BORDER;
    const byWidth = (el.main.clientWidth - 24 - 5 * 4) / 5;

    const tile = Math.floor(Math.max(28, Math.min(62, Math.min(byHeight, byWidth))));
    root.style.setProperty('--tile', tile + 'px');
  }

  function applyTheme(next) {
    theme = next;
    const root = document.documentElement;
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    const dark =
      next === 'dark' ||
      (next === 'system' &&
        typeof matchMedia === 'function' &&
        matchMedia('(prefers-color-scheme: dark)').matches);
    el.themeColour.setAttribute('content', dark ? THEME_COLOURS.dark : THEME_COLOURS.light);
    for (const b of el.themePicker.children) {
      b.setAttribute('aria-pressed', String(b.dataset.themeChoice === next));
    }
  }

  function applyColourBlind(on) {
    colourBlind = on;
    document.body.classList.toggle('cb', on);
    el.cbToggle.checked = on;
  }

  function tile(letter, cls, extra) {
    const t = document.createElement('div');
    t.className = 'tile' + (cls ? ' ' + cls : '') + (extra ? ' ' + extra : '');
    t.textContent = letter || '';
    return t;
  }

  function rowOf(word, pattern, showLetters) {
    const row = document.createElement('div');
    row.className = 'row';
    for (let i = 0; i < pattern.length; i++) {
      row.appendChild(tile(showLetters && word ? word[i] : '', CLASS[pattern[i]]));
    }
    return row;
  }

  // A guess deserves a beat on screen before the board moves on: a hit lands
  // the word in the pattern it painted, a miss holds it in place, red, while
  // it shakes. Purely visual - the state is already saved either way. Where
  // there is no timer (the headless tests) the beat is simply skipped.
  const FLASH_MS = { hit: 700, miss: 480 };
  let flashTimer = null;
  let entering = false;

  function flash(detail) {
    state.flash = detail;
    render();
    if (typeof setTimeout !== 'function') return endFlash();
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(endFlash, FLASH_MS[detail.kind]);
  }

  // Ends the beat early if the player types on through it.
  function endFlash() {
    if (typeof clearTimeout === 'function' && flashTimer) clearTimeout(flashTimer);
    flashTimer = null;
    if (!state.flash) return;
    entering = state.flash.kind === 'hit' && !state.done;
    state.flash = null;
    render();
    entering = false;
  }

  function render() {
    const flashing = state.flash || null;

    el.answer.replaceChildren(
      ...state.answer.split('').map((c) => tile(c, null))
    );

    // One pattern at a time while playing; the whole list once it is finished.
    // A hit holds its own row for a beat before the next pattern replaces it.
    const active = activeRow();
    const shown = flashing && flashing.kind === 'hit' ? flashing.row : active;
    el.board.replaceChildren(
      ...state.rows
        .map(([pattern], i) => [pattern, i])
        .filter(([, i]) => state.done || i === shown)
        .map(([pattern, i]) => {
          const solvedWord = state.solved[i];
          const row = rowOf(solvedWord, pattern, Boolean(solvedWord));
          if (solvedWord) row.classList.add('locked');
          else if (entering) row.classList.add('entering');
          if (flashing && flashing.kind === 'hit' && i === flashing.row) row.classList.add('hit');
          return row;
        })
    );

    const total = state.rows.length;
    el.progress.textContent = state.done ? total + ' / ' + total : shown + 1 + ' / ' + total;

    // The word stays put through a miss so the shake has something to shake.
    const typed = flashing && flashing.kind === 'miss' ? flashing.word : state.typed;
    const cur = [];
    for (let i = 0; i < 5; i++) {
      cur.push(tile(typed[i] || '', null, typed[i] ? 'filled' : ''));
    }
    el.current.replaceChildren(...cur);
    el.current.classList.toggle('wrong', Boolean(flashing && flashing.kind === 'miss'));
    el.inputCard.hidden = state.done;
    el.keyboard.hidden = state.done;

    el.missesCard.hidden = state.misses.length === 0;
    el.misses.replaceChildren(
      ...state.misses
        .slice()
        .reverse()
        .map((m, i) => {
          const row = rowOf(m.w, m.p, true);
          if (i === 0 && flashing && flashing.kind === 'miss') row.classList.add('entering');
          return row;
        })
    );

    el.result.hidden = !state.done;
    if (state.done) {
      const g = state.guesses;
      const misses = g - state.rows.length;
      el.resultText.textContent =
        `Pattern complete in ${formatTime(elapsedMs())}` +
        (misses === 0 ? ' with no misses.' : ` with ${misses} miss${misses === 1 ? '' : 'es'}.`);
      el.share.hidden = !state.daily;
      el.statsSummary.hidden = !state.daily;
      if (state.daily) renderStats(el.statsSummary);
    }

    el.puzzleId.textContent = state.daily ? 'Reverdle #' + state.number : 'Practice puzzle';
    fitBoard();
  }

  function say(text, kind) {
    el.message.textContent = text;
    el.message.className = 'message' + (kind ? ' ' + kind : '');
  }

  function shake() {
    el.current.classList.remove('shake');
    void el.current.offsetWidth;
    el.current.classList.add('shake');
  }

  function submit() {
    if (state.done) return;
    const guess = state.typed.toLowerCase();
    if (guess.length < 5) {
      say('Needs five letters', 'warn');
      shake();
      return;
    }
    if (!DICT_SET.has(guess)) {
      say('Not in word list', 'warn');
      shake();
      return;
    }
    if (guess === state.answer) {
      say('That is the answer itself - all green is not one of the rows', 'warn');
      shake();
      return;
    }
    const pattern = score(guess, state.answer);
    // Only the row on screen can be hit - the later ones are not shown yet.
    const active = activeRow();
    const hit = active >= 0 && state.rows[active][0] === pattern ? active : -1;

    // A miss from an earlier row is fair game once its own row comes around,
    // so the repeat guard only applies to guesses that land nowhere.
    if (hit < 0 && (state.solved.includes(guess) || state.misses.some((m) => m.w === guess))) {
      say('Already tried that one', 'warn');
      shake();
      return;
    }

    state.guesses++;
    state.typed = '';
    // The counter and the tiles say it; a line of prose would only repeat them.
    say('');

    if (hit >= 0) {
      // It is a solution now, not a miss - it should not be in both places.
      state.misses = state.misses.filter((m) => m.w !== guess);
      state.solved[hit] = guess;
      state.done = state.solved.every(Boolean);
      if (state.done) {
        pauseClock();
        recordResult();
      }
      save();
      flash({ kind: 'hit', row: hit });
    } else {
      state.misses.push({ w: guess, p: pattern });
      save();
      flash({ kind: 'miss', word: guess });
      shake();
    }
  }

  function press(k) {
    if (state.done) return;
    startClock();
    // Typing on through the beat after a guess cuts it short.
    if (state.flash) endFlash();
    if (k === 'ENTER') return submit();
    if (k === 'BACK') {
      state.typed = state.typed.slice(0, -1);
      return render();
    }
    if (/^[a-z]$/.test(k) && state.typed.length < 5) {
      state.typed += k;
      say('');
      render();
    }
  }

  function buildKeyboard(target, handler) {
    const rows = ['qwertyuiop', 'asdfghjkl', 'ENTER|zxcvbnm|BACK'];
    target.replaceChildren(
      ...rows.map((spec) => {
        const row = document.createElement('div');
        row.className = 'krow';
        const keys = spec
          .split('|')
          .flatMap((part) => (part === 'ENTER' || part === 'BACK' ? [part] : part.split('')));
        for (const k of keys) {
          const b = document.createElement('button');
          b.className = 'key' + (k.length > 1 ? ' wide' : '');
          b.textContent = k === 'BACK' ? '⌫' : k;
          b.addEventListener('click', () => handler(k));
          row.appendChild(b);
        }
        return row;
      })
    );
  }

  function shareText() {
    const misses = state.guesses - state.rows.length;
    const head =
      `Reverdle #${state.number} - ${formatTime(elapsedMs())}` +
      (misses === 0 ? ' (clean)' : ` (${misses} miss${misses === 1 ? '' : 'es'})`);
    const palette = EMOJI[colourBlind ? 'cb' : 'normal'];
    const pic = state.rows
      .map(([p]) => p.split('').map((c) => palette[c]).join(''))
      .join('\n');
    return head + '\n' + pic;
  }

  // --- Example: the same puzzle, walked through one row at a time ------------

  // Walked the way the game is played: one pattern on screen at a time, counted
  // off, and the whole list only at the end. `at` is the row being looked at,
  // `shown` whether its word has been revealed yet.
  const tut = {
    at: 0,
    shown: false,
    entering: false,
    el: {
      dialog: document.getElementById('tutorial'),
      lead: document.getElementById('tut-lead'),
      answer: document.getElementById('tut-answer-row'),
      progress: document.getElementById('tut-progress'),
      board: document.getElementById('tut-board'),
      note: document.getElementById('tut-note'),
      reveal: document.getElementById('tut-reveal'),
      close: document.getElementById('tut-close'),
    },
  };

  const ANSWER = TUTORIAL.a.toUpperCase();

  const TUT_LEAD =
    `The answer is ${ANSWER}. You are shown one row at a time, and each row is a ` +
    'different word scored against that answer. In the real game you work the word ' +
    'out and type it; here, reveal it and read what the colours were saying.';

  const TUT_END =
    'That is the whole pattern, which you only see once it is finished. Every row ' +
    'has exactly one word that makes it, out of all 14,854 accepted guesses - so ' +
    'there is nothing to guess at, only something to work out.';

  function joinWords(list) {
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }

  /** Reads a row back as the three things its colours are saying. */
  function describeRow(word, pattern) {
    const of = (colour) =>
      word
        .toUpperCase()
        .split('')
        .filter((_, i) => pattern[i] === colour);

    const clauses = [];
    const green = of('2');
    const yellow = of('1');
    const grey = of('0');
    if (green.length) clauses.push(`green: ${joinWords(green)} already in the right place`);
    if (yellow.length) clauses.push(`yellow: ${joinWords(yellow)} in ${ANSWER}, but not there`);
    if (grey.length) clauses.push(`grey: ${joinWords(grey)} not in ${ANSWER} at all`);
    return word.toUpperCase() + ' - ' + clauses.join('; ') + '.';
  }

  function renderTutorial() {
    const total = TUTORIAL.r.length;
    const done = tut.at >= total;
    const last = total - 1;

    tut.el.lead.textContent = done ? TUT_END : TUT_LEAD;
    tut.el.answer.replaceChildren(...TUTORIAL.a.split('').map((c) => tile(c, null)));

    tut.el.progress.textContent = (done ? total : tut.at + 1) + ' / ' + total;

    // One row while walking through, every row once the walk is over - the same
    // shape the board takes, so the example cannot teach a layout the game
    // does not use.
    tut.el.board.replaceChildren(
      ...TUTORIAL.r.map(([pattern, word], i) => [pattern, word, i])
        .filter(([, , i]) => done || i === tut.at)
        .map(([pattern, word, i]) => {
          const reveal = done || tut.shown;
          const row = rowOf(reveal ? word : null, pattern, reveal);
          if (reveal) row.classList.add('locked');
          if (tut.shown && i === tut.at && !done) row.classList.add('hit');
          if (tut.entering && !done) row.classList.add('entering');
          return row;
        })
    );

    const current = TUTORIAL.r[tut.at];
    tut.el.note.textContent = tut.shown && current ? describeRow(current[1], current[0]) : '';

    // Left on its last label once there is nothing to reveal, rather than
    // counting on to a row that does not exist.
    tut.el.reveal.hidden = done;
    if (!done) {
      tut.el.reveal.textContent = !tut.shown
        ? 'Reveal row ' + (tut.at + 1)
        : tut.at === last
          ? 'See the whole pattern'
          : 'Next row';
    }
    tut.el.close.textContent = done ? 'Got it' : 'Close';
    tut.el.close.className = done ? 'btn' : 'btn ghost';
  }

  function openTutorial() {
    tut.at = 0;
    tut.shown = false;
    tut.entering = false;
    renderTutorial();
    if (el.help.open) el.help.close();
    tut.el.dialog.showModal();
  }

  // One button, two beats: reveal the word in the row on screen, then move on
  // to the next row - the pause in between is the time to read the note.
  tut.el.reveal.addEventListener('click', () => {
    if (tut.at >= TUTORIAL.r.length) return;
    if (!tut.shown) {
      tut.shown = true;
    } else {
      tut.at++;
      tut.shown = false;
      tut.entering = true;
    }
    renderTutorial();
    tut.entering = false;
  });

  tut.el.close.addEventListener('click', () => tut.el.dialog.close());
  document.getElementById('tut-x').addEventListener('click', () => tut.el.dialog.close());

  // The menu does not always offer a way in, so this entry point is optional.
  const tutorialEntry = document.getElementById('tutorial-open');
  if (tutorialEntry) tutorialEntry.addEventListener('click', openTutorial);

  el.share.addEventListener('click', async () => {
    const text = shareText();
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        say('Copied to clipboard', 'good');
      }
    } catch (e) {
      say('Could not share', 'warn');
    }
  });

  // Shared by the practice button and the title's triple tap. Any beat still
  // running belongs to the puzzle being thrown away, so it goes with it.
  function newPractice() {
    if (typeof clearTimeout === 'function' && flashTimer) clearTimeout(flashTimer);
    flashTimer = null;
    pauseClock();
    loadPractice();
    say('New practice puzzle');
    render();
  }

  el.practice.addEventListener('click', newPractice);

  // Triple-tapping the title deals a random puzzle - a way back to the game
  // once the daily is done, without waiting for the result card to offer one.
  const TAP_WINDOW_MS = 600;
  let taps = 0;
  let lastTap = 0;
  el.title.addEventListener('click', () => {
    const now = Date.now();
    taps = now - lastTap < TAP_WINDOW_MS ? taps + 1 : 1;
    lastTap = now;
    if (taps < 3) return;
    taps = 0;
    newPractice();
  });

  document.getElementById('stats-btn').addEventListener('click', () => {
    renderStats(el.statsFull);
    el.statsFull.hidden = stats.played === 0;
    el.statsEmpty.hidden = stats.played > 0;
    el.statsDialog.showModal();
  });
  document.getElementById('stats-close').addEventListener('click', () => el.statsDialog.close());

  function showResetConfirm(on) {
    el.resetConfirm.hidden = !on;
    el.resetBtn.hidden = on;
  }

  el.resetBtn.addEventListener('click', () => showResetConfirm(true));
  el.resetNo.addEventListener('click', () => showResetConfirm(false));

  el.resetYes.addEventListener('click', () => {
    clearOwnKeys();
    // Drop every trace from memory too, in case the reload below cannot run.
    wiped = true;
    stats = Object.assign({}, EMPTY_STATS);
    applyTheme('system');
    applyColourBlind(false);
    showResetConfirm(false);
    pauseClock();
    loadDaily();
    say('');
    render();
    if (typeof location === 'object' && location && typeof location.reload === 'function') {
      location.reload();
    }
  });

  for (const button of el.themePicker.children) {
    button.addEventListener('click', () => {
      const choice = button.dataset.themeChoice;
      applyTheme(choice);
      if (choice === 'system') removeKey(THEME_KEY);
      else writeString(THEME_KEY, choice);
    });
  }

  el.cbToggle.addEventListener('change', () => {
    applyColourBlind(el.cbToggle.checked);
    writeJSON(CB_KEY, colourBlind);
  });

  document.getElementById('help-btn').addEventListener('click', () => el.help.showModal());
  document.getElementById('help-close').addEventListener('click', () => el.help.close());

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (tut.el.dialog.open || el.help.open || el.statsDialog.open) return;
    const handler = press;
    if (e.key === 'Enter') handler('ENTER');
    else if (e.key === 'Backspace') handler('BACK');
    else if (/^[a-zA-Z]$/.test(e.key)) handler(e.key.toLowerCase());
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseClock();
      save();
    } else if (state.guesses > 0 || state.typed) {
      startClock();
    }
  });

  window.addEventListener('resize', fitBoard);
  window.addEventListener('orientationchange', fitBoard);

  window.addEventListener('pagehide', () => {
    pauseClock();
    save();
  });

  // Flush the elapsed time periodically so a crash costs at most a few seconds.
  setInterval(() => {
    if (state.runningSince) save();
  }, 5000);

  applyTheme(theme);
  applyColourBlind(colourBlind);
  if (typeof navigator === 'object' && navigator.serviceWorker) {
    // Never cache during development - a stale worker serves yesterday's build
    // and the page silently disagrees with the source on disk.
    const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    window.addEventListener('load', () => {
      if (local) {
        navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
        return;
      }
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline support is a bonus, not a requirement */
      });
    });
  }

  buildKeyboard(el.keyboard, press);
  loadDaily();
  render();
})();
