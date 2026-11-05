# Card Sort Level Builder

A level editor for Card Slots. The 40 levels from the Level Config sheet are preloaded in the list on the left.

## Run it

You need Node.js 20 or newer.

```sh
npm install
npm run dev      # opens the editor at http://localhost:5173
npm test         # replays the 40 saved solutions and checks the chip layout
npm run build    # writes dist/index.html, one file that opens without a server
```

## Features

- **Edit:** drag stacks on the table and edit every stack field, the poles and their queues, and the level settings. Undo and redo are included.
- **Elements:** Hidden Chip Stack (`stacks[].hidden`), Hidden Color Pole (`targets[].hidden`), Locked Chip Stack (`stacks[].lock`).
- **Play test:** tap stacks like in the game, use the Hand, Shuffle and Magnet boosters, step through the saved solution, or save your moves as the solution.
- **Check:** flags color counts that don't match pole space, broken references and failing solutions. "Find a solution" searches for a winning order.
- **JSON:** import or paste one level, a list of levels, or rows copied from the sheet. Export one level, all levels, or sheet rows that paste back into the Id and Level columns.
- **Game screenshot overlay:** in the Level tab, put a game screenshot behind the table to check the layout.

Edits are saved in the browser's local storage. Export them before clearing site data.

## How the editor reads a level

These rules come from the level data and the game build. The 40 saved solutions replay with them (`npm test`).

Layout, matched to the game build's level 8 (chip theme):

- The screen is drawn like the game: the poles in a grid above the table (one column per queue, the first pole of each queue in the bottom row), the waiting tray under them, then the table.
- `x`, `y` is where the bottom chip of a pile stands on the table. Chips are 150 level units across, and y grows downward.
- Every pile is drawn as an upright stack of chips that twists like a spiral. `spread_direction` picks where the spiral starts (1 from the right, -1 from the left), and `spread_angle` picks how much it twists: each chip turns `spread_angle` × 0.25 degrees further round, so 0 is a straight stack and a negative angle twists the other way. The twist and swing can be changed in the Level tab under Chip drawing. The game build of level 8 leaned its piles instead; the spiral is the designer's new look.
- The `w` × `h` box starts at the bottom chip and runs in the spread direction. This footprint decides which stack covers which. Turn on **Footprints** to see it.
- A stack on a higher layer, with the same spread, within 40 units of another stack (or linked by `on_stack`), carries on that stack's spiral. In level 8, `s01` continues `s00`.
- `fan` stacks are drawn the same way as the others.

Rules:

- `targets[i]` goes into queue `i % n_slots`. The first pole in each queue starts at the bottom, taking chips.
- A stack is covered by any remaining stack on a higher `layer` of a different color whose footprint overlaps it.
- `buffer_capacity` counts waiting chips. The level is lost when more chips are waiting than fit.
- `lock` counts down by one for each pole cleared while nothing covers the stack.
- Colors: `color_0` Red, `color_1` Blue, `color_2` Yellow, `color_3` Green, `color_4` Purple, `color_5` Orange, checked against the game. `color_6` Pink and `color_7` Cyan are not confirmed yet.

## Code

- `index.html`: page markup.
- `src/main.js`: the editor UI.
- `src/engine.js`: game rules, play test, checks and the solver.
- `src/layout.js`: where each chip is drawn, and the stack footprint.
- `src/data/levels.json`: the 40 levels from the sheet.
- `tests/`: Vitest tests for the rules and the layout.
