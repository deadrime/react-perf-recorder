import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { memo } from 'react';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { Case, Panel, RenderCount, useRenderCount } from '../basics/Case';

const BROKEN = `
const Card = memo(({ name }) => {
  const team = useSelector((state) => state.favorites.team);   // ← the whole list: a new array on every toggle
  const liked = team.includes(name);
  …
});`;

const FIXED = `
const Card = memo(({ name }) => {
  const liked = useSelector((state) => state.favorites.team.includes(name));   // ← a boolean: the same unless it is this card
  …
});`;

const NAMES = ['Bulbasaur', 'Charmander', 'Squirtle', 'Pikachu', 'Eevee', 'Snorlax', 'Mew', 'Onix'];

const favorites = createSlice({
  name: 'favorites',
  initialState: { team: [] as string[] },
  reducers: {
    toggle(state, action: PayloadAction<string>) {
      const at = state.team.indexOf(action.payload);
      if (at >= 0) state.team.splice(at, 1);
      else state.team.push(action.payload);
    },
  },
});

// Declared the way an app declares its stores: the plugin names each after its declaration. A store a side, so a
// star on one side changes nothing on the other.
const wholeListStore = configureStore({ reducer: { favorites: favorites.reducer } });
const ownFlagStore = configureStore({ reducer: { favorites: favorites.reducer } });
type State = ReturnType<typeof wholeListStore.getState>;

const Toggle = ({ name, liked }: { name: string; liked: boolean }) => {
  const dispatch = useDispatch();
  return (
    <button type="button" data-testid={`like-${name}`} aria-pressed={liked} onClick={() => dispatch(favorites.actions.toggle(name))}>
      {liked ? '★' : '☆'}
    </button>
  );
};

const Card = ({ name, liked, renders }: { name: string; liked: boolean; renders: number }) => (
  <li className={liked ? 'row on' : 'row'}>
    <span className="grow">{name}</span>
    <Toggle name={name} liked={liked} />
    <RenderCount renders={renders} />
  </li>
);

const WholeList = memo(({ name }: { name: string }) => {
  const team = useSelector((state: State) => state.favorites.team);
  return <Card name={name} liked={team.includes(name)} renders={useRenderCount()} />;
});

const OwnFlag = memo(({ name }: { name: string }) => {
  const liked = useSelector((state: State) => state.favorites.team.includes(name));
  return <Card name={name} liked={liked} renders={useRenderCount()} />;
});

let next = 0;

/** The same star on both sides at once, so the two counters answer the same press. */
const StarNext = () => (
  <p className="bar">
    <button
      type="button"
      data-testid="star-next"
      onClick={() => {
        const name = NAMES[next++ % NAMES.length];
        wholeListStore.dispatch(favorites.actions.toggle(name));
        ownFlagStore.dispatch(favorites.actions.toggle(name));
      }}
    >
      Star the next card
    </button>
  </p>
);

export const ReduxFavorites = () => (
  <Case
    title="every card reads the whole list"
    what={
      <>
        Each side keeps its favourites in a Redux store of its own. On the left each card selects the whole <code>favorites.team</code> array to find
        itself in it: the array is new after every toggle, so a star renders every card. On the right each card selects its own boolean, which changes
        only for the card that was starred. Press the button: it stars the same card on both sides, and the counters say the rest. Seen in a Pokédex:
        one star rendered all three hundred cards.
      </>
    }
  >
    <StarNext />
    <div className="two">
      <Panel
        kind="broken"
        title="useSelector(s => s.favorites.team)"
        says="The recorder says: external store [wholeListStore] on every card, caused by redux:favorites/toggle."
        code={BROKEN}
      >
        <Provider store={wholeListStore}>
          <ul className="rows">
            {NAMES.map((name) => (
              <WholeList key={name} name={name} />
            ))}
          </ul>
        </Provider>
      </Panel>
      <Panel
        kind="fixed"
        title="useSelector(s => s.favorites.team.includes(name))"
        says="The recorder says: external store [ownFlagStore] on the starred card only."
        code={FIXED}
      >
        <Provider store={ownFlagStore}>
          <ul className="rows">
            {NAMES.map((name) => (
              <OwnFlag key={name} name={name} />
            ))}
          </ul>
        </Provider>
      </Panel>
    </div>
  </Case>
);
