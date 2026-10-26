# Card Sort Level Builder

A level editor for Card Slots. The 40 levels from the Level Config sheet are preloaded in the list on the left.

## Run it

You need Node.js 20 or newer.

```sh
npm install
npm run dev      # opens the editor at http://localhost:5173
npm test         # replays the 40 saved solutions and checks the card layout
npm run build    # writes dist/index.html, one file that opens without a server
```

## Features

- **Edit:** drag stacks on the table and edit every stack field, the poles and their queues, and the level settings. Undo and redo are included.
- **Elements:** Hidden Card Stack (`stacks[].hidden`), Hidden Color Pole (`targets[].hidden`), Locked Card Stack (`stacks[].lock`).
- **Play test:** tap stacks like in the game, use the Hand, Shuffle and Remove boosters, step through the saved solution, or save your moves as the solution.
- **Check:** flags color counts that don't match pole space, broken references and failing solutions. "Find a solution" searches for a winning order.
- **JSON:** import or paste one level, a list of levels, or rows copied from the sheet. Export one level, all levels, or sheet rows that paste back into the Id and Level columns.
- **Game screenshot overlay:** in the Level tab, put a game screenshot behind the table to check the layout.

Edits are saved in the browser's local storage. Export them before clearing site data.

## How the editor reads a level

These rules come from the level data and the game build. The 40 saved solutions replay with them (`npm test`).

Layout, matched to the game build's level 5:

- `x`, `y` is the center of the stack's first (bottom) card. Every card is 150 × 206 level units, and y grows downward.
- A spread stack lays its cards out from the first card along `spread_angle`, toward `spread_direction`. By default the cards are spaced so the pile fills the `w` × `h` box.
- The `w` × `h` box starts at the first card and runs the same way. This footprint decides which stack covers which. Turn on **Footprints** to see it.
- A stack on a higher layer, with the same spread, within 40 units of another stack (or linked by `on_stack`), carries on that stack's pile. In level 5, `s4` continues `s0` and `s9` continues `s8`.
- A `fan` stack tilts its cards around their bottom edge, the first card tilted most. The tilt and gap are estimates and can be changed in the Level tab under Card drawing.
- The editor draws the table from above. The game camera is tilted, so stacks near the bottom of the screen look larger and lower in the game.

Rules:

- `targets[i]` goes into queue `i % n_slots`. The first pole in each queue starts at the bottom, taking cards.
- A stack is covered by any remaining stack on a higher `layer` of a different color whose footprint overlaps it.
- `buffer_capacity` counts waiting cards. The level is lost when more cards are waiting than fit.
- `lock` counts down by one for each pole cleared while nothing covers the stack.
- Colors: `color_0` Red, `color_1` Blue, `color_2` Yellow, `color_3` Green, checked against the game. `color_4` to `color_7` are shown as Pink, Orange, Purple, Cyan, which is not confirmed yet.

## Code

- `index.html`: page markup.
- `src/main.js`: the editor UI.
- `src/engine.js`: game rules, play test, checks and the solver.
- `src/layout.js`: where each card is drawn, and the stack footprint.
- `src/data/levels.json`: the 40 levels from the sheet.
- `tests/`: Vitest tests for the rules and the layout.
