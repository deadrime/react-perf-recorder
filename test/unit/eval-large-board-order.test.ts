import { orderAt } from '../eval-large/app/src/lib/boardOrder';

const column = [
  { id: 'a', sortOrder: 1 },
  { id: 'b', sortOrder: 2 },
  { id: 'c', sortOrder: 4 },
];

/** Where the card lands once the column sorts by the new order. */
const landing = (id: string, at: number) => {
  const sortOrder = orderAt(column, id, at);
  if (sortOrder === null) return null;
  const moved = [...column.filter((i) => i.id !== id), { id, sortOrder }];
  return moved.sort((x, y) => x.sortOrder - y.sortOrder).map((i) => i.id);
};

describe('board order', () => {
  it('leaves a card that is dropped next to itself where it is', () => {
    expect(orderAt(column, 'b', 1)).toBeNull();
    expect(orderAt(column, 'b', 2)).toBeNull();
  });

  it('moves a card up and down its column', () => {
    expect(landing('c', 0)).toEqual(['c', 'a', 'b']);
    expect(landing('a', 2)).toEqual(['b', 'a', 'c']);
    expect(landing('a', 3)).toEqual(['b', 'c', 'a']);
    expect(landing('c', 1)).toEqual(['a', 'c', 'b']);
  });

  it('puts a card from another column between its new neighbours', () => {
    expect(orderAt(column, 'x', 0)).toBe(0);
    expect(orderAt(column, 'x', 2)).toBe(3);
    expect(orderAt(column, 'x', 3)).toBe(5);
    expect(orderAt([], 'x', 0)).toBe(0);
  });
});
