/** `Alt+Shift+KeyR` against a keyboard event; `code`, not `key`: on macOS Alt changes the character. */
export function matches(shortcut: string, event: KeyboardEvent): boolean {
  const parts = shortcut.split('+');
  const code = parts.pop();
  const has = (modifier: string) => parts.includes(modifier);
  return (
    event.code === code &&
    event.altKey === has('Alt') &&
    event.shiftKey === has('Shift') &&
    event.ctrlKey === has('Ctrl') &&
    event.metaKey === has('Meta')
  );
}
