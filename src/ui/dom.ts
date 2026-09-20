type El<K extends keyof HTMLElementTagNameMap> = HTMLElementTagNameMap[K];

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string | null>
): El<K> {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') el.className = value;
    else el.setAttribute(key, value);
  }
  for (const child of children) if (child != null) el.append(child);
  return el;
}
