const FIRST = ['Ada', 'Bo', 'Cy', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal', 'Ida', 'Jo', 'Kai', 'Liv', 'Max', 'Nia'];
const LAST = ['Ames', 'Bell', 'Cole', 'Dunn', 'Enns', 'Ford', 'Gray', 'Hart', 'Ives', 'Jett', 'Kerr', 'Lowe', 'Mace', 'Nash'];

/** Everyone in the workspace. */
export const ROSTER = Array.from({ length: 1500 }, (_, i) => `${FIRST[(i * 5) % FIRST.length]} ${LAST[(i * 3) % LAST.length]} ${i}`);

export function sortMembers(names: string[], order: Intl.CollatorOptions): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, 'en', order));
}
