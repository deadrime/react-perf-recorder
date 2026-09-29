# Panel: ideas for later

Not planned yet. Small things for the panel to come back to.

## Sources

- **Clickable `file:line`** everywhere the panel shows one: causes, reasons' hook chains, Growth origins, the CPU
  fold. Vite's dev server already opens a file in the editor at `/__open-in-editor?file=src/Row.tsx:12` (the editor
  from `LAUNCH_EDITOR`), and the paths the panel shows are relative to its root, which is what it takes. One
  component for a path, so every place gets it at once; in a page served without Vite it stays text.
