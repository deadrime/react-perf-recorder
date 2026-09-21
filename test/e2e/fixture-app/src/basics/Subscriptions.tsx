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
    <RenderCount n={useRenderCount()} />
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
    broken: { title: 's.profile', says: 'A new object every time, the same name inside it.', el: <WholeObject /> },
    fixed: { title: 's.profile.name', says: 'A string: it wakes the line when the name changes.', el: <OneField /> },
  },
  {
    title: 'a new array on every call',
    broken: { title: 's.tags.filter(…)', says: 'filter() returns a new array, so the check never finds them equal.', el: <FreshArray /> },
    fixed: { title: 's.tags', says: 'The array the store holds, compared by identity as it should be.', el: <SameArray /> },
  },
  {
    title: 'the exact number, or the one on the screen',
    broken: { title: 's.progress', says: 'Renders on every nudge and draws the same 40%.', el: <ExactNumber /> },
    fixed: { title: 'rounded in the selector', says: 'Renders when the tens change, which is rarely.', el: <RoundedNumber /> },
  },
];

export const Subscriptions = () => {
  useServer();
  return (
    <Case
      title="subscribe to what you show"
      what={
        <>
          The same store on both sides, pushing an update every 600ms. What a component asks the store for decides how
          often it renders — and the answer is never "everything".
        </>
      }
    >
      {PAIRS.map((pair) => (
        <div key={pair.title}>
          <h3 className="pair">{pair.title}</h3>
          <div className="two">
            <Panel kind="broken" title={pair.broken.title} says={pair.broken.says}>
              <ul className="rows">{pair.broken.el}</ul>
            </Panel>
            <Panel kind="fixed" title={pair.fixed.title} says={pair.fixed.says}>
              <ul className="rows">{pair.fixed.el}</ul>
            </Panel>
          </div>
        </div>
      ))}
    </Case>
  );
};
