import { useEffect, useState } from 'react';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

const BROKEN = `
const TagPicker = ({ onChange }) => {
  const [picked, setPicked] = useState([]);
  useEffect(() => onChange(picked), [picked]);   // ← the parent hears of it a commit later

  return TAGS.map((tag) => <Tag key={tag} onClick={() => setPicked(toggle(picked, tag))} />);
};

const Filters = () => {
  const [tags, setTags] = useState([]);
  return (
    <>
      <p>{tags.length} picked</p>
      <TagPicker onChange={setTags} />
    </>
  );
};`;

const FIXED = `
const TagPicker = ({ picked, onChange }) =>
  TAGS.map((tag) => <Tag key={tag} onClick={() => onChange(toggle(picked, tag))} />);   // ← told in the click

const Filters = () => {
  const [tags, setTags] = useState([]);   // ← one owner, one commit
  return (
    <>
      <p>{tags.length} picked</p>
      <TagPicker picked={tags} onChange={setTags} />
    </>
  );
};`;

const TAGS = ['bug', 'design', 'docs', 'infra'];
const toggle = (list: string[], tag: string) => (list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);

/** The tags as boxes to tick, with the picker's own render count on top. */
const Tags = ({ side, picked, onPick }: { side: string; picked: string[]; onPick: (tag: string) => void }) => (
  <ul className="rows">
    <li>
      <span className="grow muted">the picker</span>
      <RenderCount renders={useRenderCount()} />
    </li>
    {TAGS.map((tag) => (
      <li key={tag}>
        <input type="checkbox" data-testid={`tag-${side}-${tag}`} checked={picked.includes(tag)} onChange={() => onPick(tag)} />
        <span className="grow">{tag}</span>
      </li>
    ))}
  </ul>
);

/** Keeps its own picks and reports them up from an effect, after its commit. */
const PickerByEffect = ({ onChange }: { onChange: (tags: string[]) => void }) => {
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => onChange(picked), [picked]);
  return <Tags side="effect" picked={picked} onPick={(tag) => setPicked(toggle(picked, tag))} />;
};

/** Keeps nothing: the click tells the parent, which owns the picks. */
const PickerByEvent = ({ picked, onChange }: { picked: string[]; onChange: (tags: string[]) => void }) => (
  <Tags side="event" picked={picked} onPick={(tag) => onChange(toggle(picked, tag))} />
);

/** What the page shows about the picks: the line that falls a commit behind on the left. */
const Summary = ({ side, tags }: { side: string; tags: string[] }) => (
  <ul className="rows">
    <li>
      <span className="grow" data-testid={`picked-${side}`}>
        {tags.length ? `${tags.length} picked: ${tags.join(', ')}` : 'nothing picked'}
      </span>
      <RenderCount renders={useRenderCount()} />
    </li>
  </ul>
);

const FiltersByEffect = () => {
  const [tags, setTags] = useState<string[]>([]);
  return (
    <div className="stack">
      <Summary side="effect" tags={tags} />
      <PickerByEffect onChange={setTags} />
    </div>
  );
};

const FiltersByEvent = () => {
  const [tags, setTags] = useState<string[]>([]);
  return (
    <div className="stack">
      <Summary side="event" tags={tags} />
      <PickerByEvent picked={tags} onChange={setTags} />
    </div>
  );
};

export const Notify = () => (
  <Case
    title="a child tells its parent in an effect"
    what={
      <>
        Both pickers show which tags are picked above them. On the left the picker keeps the picks and an effect hands them up, so every click is two
        commits: the picker's, then the page's, and the line above is one commit behind. On the right the click tells the page, which owns the picks.
        The second commit's root is the page, but the fix is in the picker.
      </>
    }
  >
    <div className="two">
      <Panel
        kind="broken"
        title="useEffect(() => onChange(picked))"
        says="The recorder says: a second commit after every click, caused by core:effect, with the page as its root."
        code={BROKEN}
      >
        <FiltersByEffect />
      </Panel>
      <Panel kind="fixed" title="onChange in the click" says="The recorder says: one commit per click." code={FIXED}>
        <FiltersByEvent />
      </Panel>
    </div>
  </Case>
);
