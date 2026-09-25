import { useEffect } from 'react';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { Case, Panel, RenderCount, useRenderCount } from './Case';

interface Shop {
  profile: { name: string; plan: string };
  tags: string[];
  /** Moves a little all the time, and is shown rounded to tens. */
  progress: number;
  visits: number;
}

const shop = createStore<Shop>(() => ({
  profile: { name: 'Anna', plan: 'pro' },
  tags: ['design', 'weekly'],
  progress: 41,
  visits: 0,
}));

/** The server keeps sending: a new object every time, with the same name inside it. */
const useServer = () =>
  useEffect(() => {
    const id = setInterval(
      () =>
        shop.setState((s) => ({
          // A new profile object with the same name in it; the tags are the array the store already had.
          profile: { ...s.profile },
          progress: 41 + Math.sin(s.visits / 4) * 3,
          visits: s.visits + 1,
        })),
      600
    );
    return () => clearInterval(id);
  }, []);

const Line = ({ what, value }: { what: string; value: string }) => (
  <li>
    <span className="grow">
      {what}: <b>{value}</b>
    </span>
    <RenderCount renders={useRenderCount()} />
  </li>
);

const WholeObject = () => <Line what="name" value={useStore(shop, (s) => s.profile).name} />;
const OneField = () => <Line what="name" value={useStore(shop, (s) => s.profile.name)} />;

const FreshArray = () => <Line what="tags" value={useStore(shop, (s) => s.tags.filter(Boolean)).join(', ')} />;
const SameArray = () => <Line what="tags" value={useStore(shop, (s) => s.tags).join(', ')} />;

const ExactNumber = () => <Line what="progress" value={`${Math.round(useStore(shop, (s) => s.progress) / 10) * 10}%`} />;
const RoundedNumber = () => <Line what="progress" value={`${useStore(shop, (s) => Math.round(s.progress / 10) * 10)}%`} />;

const PAIRS = [
  {
    title: 'the whole object, or the field',
    broken: {
      title: 's.profile',
      says: 'The recorder says: external store SAME-CONTENT [shop] (s)=>s.profile — a new object on every change, the same name inside it.',
      el: <WholeObject />,
      code: `const name = useStore(shop, (s) => s.profile).name;   // ← the object, to show one field of it`,
    },
    fixed: {
      title: 's.profile.name',
      says: 'The recorder says nothing until the name itself changes: a string is compared by value.',
      el: <OneField />,
      code: `const name = useStore(shop, (s) => s.profile.name);   // ← a string, compared by value`,
    },
  },
  {
    title: 'a new array on every call',
    broken: {
      title: 's.tags.filter(…)',
      says: 'The recorder says: external store SAME-CONTENT [shop] (s)=>s.tags.filter(Boolean) — filter() makes a new array on every call.',
      el: <FreshArray />,
      code: `const tags = useStore(shop, (s) => s.tags.filter(Boolean));   // ← a new array on every call`,
    },
    fixed: {
      title: 's.tags',
      says: 'The recorder says nothing until the tags change: the store hands back the array it holds.',
      el: <SameArray />,
      code: `const tags = useStore(shop, (s) => s.tags);   // ← the array the store already has`,
    },
  },
  {
    title: 'the exact number, or the one on the screen',
    broken: {
      title: 's.progress',
      says: 'The recorder says: external store [shop] (s)=>s.progress on every nudge, while the bar draws the same 40%.',
      el: <ExactNumber />,
      code: `const exact = useStore(shop, (s) => s.progress);   // ← the exact number
const shown = Math.round(exact / 10) * 10;                 // rounded after the subscription`,
    },
    fixed: {
      title: 'rounded in the selector',
      says: 'The recorder says nothing until the tens change, which is rarely.',
      el: <RoundedNumber />,
      code: `const shown = useStore(shop, (s) => Math.round(s.progress / 10) * 10);   // ← rounded inside it`,
    },
  },
];

export const Subscriptions = () => {
  useServer();
  return (
    <Case
      title="subscribe to what you show"
      what={
        <>
          The same store on both sides, pushing an update every 600ms. What a component asks the store for decides how often it renders — and the
          answer is never "everything".
        </>
      }
    >
      {PAIRS.map((pair) => (
        <div key={pair.title}>
          <h3 className="pair">{pair.title}</h3>
          <div className="two">
            <Panel kind="broken" title={pair.broken.title} says={pair.broken.says} code={pair.broken.code}>
              <ul className="rows">{pair.broken.el}</ul>
            </Panel>
            <Panel kind="fixed" title={pair.fixed.title} says={pair.fixed.says} code={pair.fixed.code}>
              <ul className="rows">{pair.fixed.el}</ul>
            </Panel>
          </div>
        </div>
      ))}
    </Case>
  );
};
