# Reverdle

Play it: **https://jeamesbone.github.io/reverdle/**

Wordle, reversed. You are **given the answer**. You are then shown a **row** of
green / yellow / grey tiles at a time — four of them over a puzzle, tracked by
a row of pips — and your job is to find the guess word that paints each one
against that answer. The whole picture is only assembled at the end.

Every row has **exactly one** solution across the full 14,854-word guess
dictionary, so a daily puzzle has a single unambiguous answer set. No luck, no
"well, `SHALE` also works".

## Play

Static site, no build step, no dependencies:

```bash
node tools/serve.js
```

Then open http://localhost:8123.

## How a puzzle is built

`tools/generate.js` does one pass per candidate answer word:

1. Score every one of the 14,854 dictionary words against the answer.
2. Bucket the words by the colour pattern they produce.
3. Keep only buckets of size **1** — those patterns have a single solution.
4. Discard the all-green bucket (that is just the answer itself).
5. Require the solution word to come from the 2,315-word common list, so the
   answer is always fair, even though uniqueness is checked against the full
   dictionary.

An answer word qualifies as a puzzle if it yields at least `ROWS` such patterns
(currently 4). The rows are spread evenly across the candidate list sorted by
difficulty, easiest first, where difficulty is `2 × greens + yellows` (a green
pins a letter to a slot, a yellow only hints).

1,218 of 2,315 answer words qualify — about 3.3 years of daily puzzles. The
schedule is shuffled with a fixed seed, so rebuilding produces the same order.
Row count trades off against schedule length: 3 rows gives 1,671 puzzles, 4
gives 1,218, 5 gives 789, 6 gives 450.

```bash
node tools/serve.js              # local server, with caching off
node tools/generate.js           # writes data/dict.js and data/puzzles.js
node tools/generate-tutorial.js  # writes data/tutorial.js
node tools/verify.js             # re-checks all 3,654 rows for uniqueness
node tools/test-game.js          # headless tests for game.js
```

`tools/test-game.js` stubs just enough DOM to run `game.js` in Node and plays
puzzles by dispatching keydown events, so game logic is testable without a
browser.

## Rules in play

- Rows come one at a time, in the generated order (easiest first), and only the
  row on screen can be hit. A guess that paints a later row is a miss for now,
  but it still solves that row when it comes around, and is lifted out of the
  miss list when it does.
- Guessing the answer itself is rejected — all-green is never a target row.
- Wrong guesses are kept on screen with their real colours. That feedback is the
  main deduction tool.
- Solved rows leave the board. A row of pips above the pattern is the only
  progress readout until the puzzle is finished, when every row is shown at once
  with the word that painted it: one pip per row, filled for what you have
  painted, enlarged for the row on screen, hollow for what is still to come.
  Deliberately not a thumbnail of the pattern - showing one row at a time only
  works if the whole picture stays a payoff, so the indicator says where you
  are without saying what is coming. It carries an `aria-label`, since the dots
  have no text of their own.
- **Score is the clock.** It starts on your first keystroke, pauses when the tab
  is hidden, and stops when the last row is painted. Wrong guesses cost time,
  not points, so guessing to probe the answer is a legitimate tactic.
- Daily progress, including elapsed time, is stored in `localStorage` under
  `reverdle-<dayIndex>`. Elapsed time is flushed on every guess, every five
  seconds, and on `visibilitychange` / `pagehide`.

## The example

The menu offers a worked example: a real puzzle of the same shape - five
letters, four rows, every pattern with exactly one solution in the full
dictionary - that you read rather than solve. It walks the way the game plays:
one pattern on screen, the same pips above it, and the whole list only at the
end. One button carries both beats - it reveals the word in the pattern on screen,
then moves on to the next row, so the pause in between is the time to read the
annotation. Each annotation is generated straight from the pattern:

```
STEIN - green: S, T, I and N already in the right place; grey: E not in STAIN at all.
```

`tools/generate-tutorial.js` picks it. On top of the daily rules it scores
candidates on how much they teach: the opening row has to be mostly green, one
row has to lean on yellows, and one has to show a letter that simply is not in
the answer, so reading the four rows in order covers all three colours. It
currently lands on `STAIN`, with rows `STEIN` / `SNAIL` / `SAINT` / `ETHIC`.

The entry point is the `tutorial-open` button in the menu, which is optional
markup - comment it out and the game drops the example cleanly rather than
failing to start.

## What else is in there

- **A random puzzle on demand** — triple-tap the title. It deals a practice
  puzzle without touching the daily save or the stats, which is the same thing
  the button on the result card does, only without having to finish first.
- **Stats** — games played, best time, average, clean solves, current and max
  streak. A streak counts consecutive day indexes and is only shown as live if
  it includes today or yesterday. Open with the chart button, or see it on the
  result card.
- **Themes** — System / Light / Dark, stored in `localStorage` and applied by an
  inline `<head>` script before first paint so the page never flashes. The
  `theme-color` meta tag follows.
- **Colour-blind palette** — swaps green/yellow for blue/orange, including in
  the shared emoji picture.
- **Installable and offline** — `manifest.webmanifest` plus a service worker in
  `sw.js`, which deliberately does not register on localhost so development
  never fights a stale cache: network-first for the page so deploys are picked up immediately, and
  stale-while-revalidate for assets so they refresh in the background. Bumping
  `CACHE` forces the update a load earlier.
- **Fits the viewport** — no page scrolling and no card chrome. The keyboard is
  pinned to the bottom and `fitBoard()` in `game.js` solves for the tile size in
  two passes. First it collapses the tiles *and* the miss list, measures
  everything else on screen, and gives the rows whatever height is left, capped
  at 72px and by the width five tiles can have. Then it hands the space the
  board did not take back to the misses as `--misses-max`. The order matters:
  measured the other way round, a long miss list reads as fixed overhead and
  starves the tiles down to their 28px floor.

  Only two tile rows are on screen mid-puzzle, which leaves real slack. It all
  collects above the keyboard, *below* the misses — so the answer, the pattern
  and the row you type into hold the same position from the first guess to the
  last, and each miss fills a little more of the space beneath them instead of
  shunting the board around. Once that space is gone the miss list scrolls in
  place. Misses lay out two-across with an odd one out centred.
- **A guess goes somewhere** — pressing enter scores the word where you typed
  it, right there in the input row, a tile at a time from the left. The row
  then sits there, fully scored and still, for a beat — long enough to read
  what you painted before anything happens to it. Then it travels. One that fits is carried up onto the pattern row it painted and
  stays; the board fills in underneath it as it arrives, so the swap is
  invisible and the row it lands on is told not to pop. One that fits nothing
  barely leaves the ground before that row turns it away, and it shakes itself
  out on the way back down — it never gets close enough to look like it might
  have fitted — while the miss rises into the list below. A guess that never
  gets scored at all — not a word, wrong length, already tried — has no colours
  to show, so it just goes red and shakes, and keeps the word for you to edit.

  The colours roll in from one keyframe block with only a `0%` frame in it: the
  tiles already carry their colour classes, so the end of each tile's animation
  is whatever its own class says, and green, yellow and grey all animate from
  the same rule. The scoring phase is written as `SCORE_ROLL + SCORE_HOLD` so
  the beat stays a beat: `SCORE_ROLL` tracks the stagger and duration in the
  CSS, `SCORE_HOLD` is the pause that follows it.

  `aimCurrentRow()` measures the gap between the two rows into `--lift` after
  the render that puts the colours in, so the distance always matches the
  layout the row flies through. The last guess of a puzzle is still a guess in
  flight: the keyboard and the input row stay put until it lands, or clearing
  them would take the flying row away and move its target mid-flight, and the
  result card waits for the landing rather than pre-empting it.
- **A quiet clock** — the timer runs from your first keystroke but is only shown
  once the picture is finished. A ticking clock just makes the puzzle stressful.
- **Reduced motion** — the flight, the tile pops and the shake are all dropped
  when the system asks for it. The colours and the red still land; they are
  information, not decoration.
- **Reset all data** — under *Data* in the menu. Two-step confirm, then
  it removes every `reverdle-` key and reloads. It deliberately does *not* call
  `localStorage.clear()`: GitHub Pages puts every site on one origin, so that
  would wipe any neighbouring app's data too.

## Deploying

`.github/workflows/pages.yml` runs on every push to `main`: it verifies every
puzzle row still has exactly one solution, runs the game tests, re-runs both
generators and fails if `data/` has drifted from them, then assembles `_site`
and publishes it to GitHub Pages. All asset paths are relative, so the site
works from the `/reverdle/` subpath.

## Layout

```
index.html                 markup
styles.css                 styling
game.js                    game logic
sw.js                      offline cache
manifest.webmanifest       install metadata
icon.svg, icon-maskable.svg app icons
data/words-guess.txt       14,854 accepted guesses (source of truth)
data/words-common.txt      2,315 common words (solutions and answers)
data/dict.js               generated: guess dictionary for the browser
data/puzzles.js            generated: the daily schedule
data/tutorial.js           generated: the worked example
tools/serve.js             local dev server
tools/generate.js          puzzle builder
tools/generate-tutorial.js example builder
tools/verify.js            uniqueness check
tools/test-game.js         headless game tests
```

Stored keys: `reverdle-<dayIndex>` (per-day progress), `reverdle-stats`,
`reverdle-theme`, `reverdle-cb`.

Day 0 of the schedule is `LAUNCH_DATE` in `data/puzzles.js` (2026-01-01). The
index wraps after 1,218 days.
