import { css } from '@emotion/css';
import { PluginHost } from '../../src/core/plugins';
import plugin, { declsOf, shapeOf } from '../../src/plugins/emotion/runtime';

const session = { scope: null, findFibers: () => [] };

describe('emotion plugin runtime', () => {
  it('is inactive on a page without emotion', () => {
    const host = new PluginHost([[plugin, null]]);
    host.start(session, performance.now());
    expect(host.stop(session).emotion).toEqual({ version: 1, active: false });
  });

  it('groups the classes inserted during the recording by label, and says which values tell them apart', () => {
    css({ color: 'red', label: 'Before' });
    const host = new PluginHost([[plugin, null]]);
    host.start(session, performance.now());
    // A tooltip that puts its position into css(): one class per position, never removed.
    for (let i = 0; i < 30; i++) css({ position: 'absolute', left: i, top: 10, label: 'Tooltip' });
    css({ color: 'blue', label: 'Button' });
    css({ color: 'blue', label: 'Button' });
    const section = host.stop(session).emotion;
    expect(section.active).toBe(true);
    expect(section.metrics?.['classes.new'].value).toBe(31);
    const data = section.data as { groups: Array<{ label: string; classes: number; varying?: Array<{ prop: string }> }> };
    expect(data.groups[0]).toMatchObject({ label: 'Tooltip', classes: 30, varying: [{ prop: 'left' }] });
    expect(data.groups[1]).toMatchObject({ label: 'Button', classes: 1 });
    expect(data.groups.some((g) => g.label === 'Before')).toBe(false);
    expect(section.highlights?.[1]).toBe('Tooltip: +30, varying left');
  });

  it('reads declarations as written, shorthands kept', () => {
    expect(declsOf('height: 6px; background: url("a;b.png") crimson; width: 1%;')).toEqual([
      ['height', '6px'],
      ['background', 'url("a;b.png") crimson'],
      ['width', '1%'],
    ]);
  });

  it('groups unlabeled classes by their declarations with the numbers taken out', () => {
    expect(
      shapeOf([
        ['width', '12.5px'],
        ['color', '#ff0000'],
        ['background', 'url(a.png)'],
      ])
    ).toBe('width:#px;color:#hex;background:url()');
  });
});
