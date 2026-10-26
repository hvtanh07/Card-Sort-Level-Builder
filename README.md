# Card Sort Level Builder

A level editor for Card Slots. Open `index.html` in a browser. It needs no install or server.

The 40 levels from the Level Config sheet are preloaded in the list on the left.

## Features

- **Edit:** drag stacks on the table and edit every stack field, the poles and their queues, and the level settings. Undo and redo are included.
- **Elements:** Hidden Card Stack (`stacks[].hidden`), Hidden Color Pole (`targets[].hidden`), Locked Card Stack (`stacks[].lock`).
- **Play test:** tap stacks like in the game, use the Hand, Shuffle and Remove boosters, step through the saved solution, or save your moves as the solution.
- **Check:** flags color counts that don't match pole space, broken references and failing solutions. "Find a solution" searches for a winning order.
- **JSON:** import or paste one level, a list of levels, or rows copied from the sheet. Export one level, all levels, or sheet rows that paste back into the Id and Level columns.

Edits are saved in the browser's local storage. Export them before clearing site data.

## Rules the editor uses

The rules are worked out from the level data, and they replay all 40 saved solutions:

- `targets[i]` goes into queue `i % n_slots`. The first pole in each queue starts at the bottom.
- `x`, `y` are the center of a `w` × `h` box.
- A stack is covered by any remaining stack on a higher `layer` of a different color whose box overlaps it.
- `buffer_capacity` counts waiting cards. The level is lost when more cards are waiting than fit.
- `lock` counts down by one for each pole cleared while nothing covers the stack.
- `color_0` Red, `color_1` Blue, `color_2` Yellow, `color_3` Green (checked against the game build). `color_4` to `color_7` are shown as Pink, Orange, Purple, Cyan, which is not confirmed yet.

## Layout

- `index.html` is the built editor. Open this one.
- `src/editor.html` is the editor source, without the level data.
- `data/levels.json` holds the 40 levels from the sheet.
- `tools/build.py` rebuilds `index.html`. Run `python3 tools/build.py` after changing the source or the data.
