# The panel

What to tell a person who records it themselves.

- **Alt+Shift+R** records and stops, **Alt+Shift+S** picks an area. **↺ Page load** reloads and records from the
  first render.
- **⌖ Pick** — click an element, or a row of the tree it opens, and it becomes the area, with the component tree
  open around it. `↑`/`↓` move, `→` goes in, `←` goes up, `Enter` keeps it, `Esc` puts the old one back. The page
  does not react to clicks while the picker is open. `×` goes back to the whole app.
- **⧉** copies the area as text for a chat: component, file and line, path, DOM, and the `scope` for a script — what
  a person sends instead of "that panel on the right".
- **highlights** outlines renders inside the area, live. Off for timing runs: a recording made with it on carries a
  warning, and `compare_recordings` complains when only one side had it.
- **fast** records lists of thousands at about half the cost; reasons of parent-caused renders are then a sample.
- **◎** in a tree row follows a component by name through the recording.
- While recording, the panel names the roots leading so far; after Stop it shows the report and `saved <id>`.
- In the report, a commit picked on the timeline shows its cascade as a tree and outlines its components on the page;
  **↻ Repeat** reloads and does the same actions again, for a before → after.

The panel is hidden in automated browsers (`navigator.webdriver`) unless the URL has `?rpr=panel`; the shortcuts
work either way.
