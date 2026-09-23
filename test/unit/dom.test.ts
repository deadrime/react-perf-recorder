import { DomWatcher } from '../../src/core/dom';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('what counts as a change on the screen', () => {
  it('ignores a value written over itself, and the blank-and-restore React 19 does to form fields', async () => {
    document.body.innerHTML = '<input id="field" name="replyTo" value="a">';
    const input = document.getElementById('field')!;
    const watcher = new DomWatcher();
    watcher.start();

    input.setAttribute('name', 'replyTo');
    input.setAttribute('name', '');
    input.setAttribute('name', 'replyTo');
    await flush();
    expect(watcher.counts.attr).toBe(0);

    input.setAttribute('name', 'remindIn');
    await flush();
    expect(watcher.counts.attr).toBe(1);
    watcher.stop();
  });

  it('counts text that really changed and leaves text rewritten with the same value alone', async () => {
    document.body.innerHTML = '<p id="line">nine</p>';
    const text = document.getElementById('line')!.firstChild as Text;
    const watcher = new DomWatcher();
    watcher.start();

    text.data = 'nine';
    await flush();
    expect(watcher.counts.text).toBe(0);

    text.data = 'ten';
    await flush();
    expect(watcher.counts.text).toBe(1);
    watcher.stop();
  });
});
