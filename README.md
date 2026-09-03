# Reverdle

Play it: **https://jeamesbone.github.io/reverdle/**

Wordle, reversed. You are **given the answer**. You are then shown a **row** of
green / yellow / grey tiles at a time — four of them over a puzzle, counted off
as `1 / 4`, `2 / 4` — and your job is to find the guess word that paints each
one against that answer. The whole picture is only assembled at the end.

Every row has **exactly one** solution across the full 14,854-word guess
dictionary, so a daily puzzle has a single unambiguous answer set. No luck, no
"well, `SHALE` also works".

## Play

Static site, no build step, no dependencies:

```bash
python3 -m http.server 8123
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
- Solved rows leave the board; the counter above the pattern is the only
  progress readout until the puzzle is finished, when every row is shown at once
  with the word that painted it.
- **Score is the clock.** It starts on your first keystroke, pauses when the tab
  is hidden, and stops when the last row is painted. Wrong guesses cost time,
  not points, so guessing to probe the answer is a legitimate tactic.
- Daily progress, including elapsed time, is stored in `localStorage` under
  `reverdle-<dayIndex>`. Elapsed time is flushed on every guess, every five
  seconds, and on `visibilitychange` / `pagehide`.

## The tutorial

A worked example ships with the game: a 3-row, 4-letter version of the
same puzzle, built by `tools/generate-tutorial.js` against a 4,360-word
dictionary with the same exactly-one-solution rule. It picks `TEAM`, whose rows
are `MEAT` / `THEM` / `MATE` — an anagram ladder that teaches the difference
between green and yellow without teaching vocabulary.

It is fully playable and has a "reveal a row" escape hatch. The entry point is
the `tutorial-open` button in the menu, which is optional markup - comment it out
and the game drops the tutorial cleanly rather than failing to start. Nothing is
opened automatically on a first visit; the board is the first thing you see.

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
  pinned to the bottom and `fitBoard()` in `game.js` solves for the tile size:
  it collapses the tiles, measures everything else that is on screen, and gives
  the rows whatever height is left. Only two tile rows are on screen mid-puzzle,
  so the play area is centred between the header and the keyboard. Misses scroll
  in place rather than pushing the board around, laid out two-across with an odd
  one out centred.
- **A quiet clock** — the timer runs from your first keystroke but is only shown
  once the picture is finished. A ticking clock just makes the puzzle stressful.
- **Reduced motion** — tile pops and the shake animation are dropped when the
  system asks for it.
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
data/words-4.txt           4,360 four-letter words (tutorial dictionary)
data/dict.js               generated: guess dictionary for the browser
data/puzzles.js            generated: the daily schedule
data/tutorial.js           generated: the tutorial puzzle
tools/generate.js          puzzle builder
tools/generate-tutorial.js tutorial builder
tools/verify.js            uniqueness check
tools/test-game.js         headless game tests
```

Stored keys: `reverdle-<dayIndex>` (per-day progress), `reverdle-stats`,
`reverdle-theme`, `reverdle-cb`.

Day 0 of the schedule is `LAUNCH_DATE` in `data/puzzles.js` (2026-01-01). The
index wraps after 1,218 days.
