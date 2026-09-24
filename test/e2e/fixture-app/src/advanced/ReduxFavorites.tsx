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

// Declared the way an app declares its store: the plugin names it after the declaration.
const pokedexStore = configureStore({ reducer: { favorites: favorites.reducer } });
type State = ReturnType<typeof pokedexStore.getState>;

const Toggle = ({ name, liked }: { name: string; liked: boolean }) => {
  const dispatch = useDispatch();
  return (
    <button type="button" data-testid={`like-${name}`} onClick={() => dispatch(favorites.actions.toggle(name))}>
      {liked ? '★' : '☆'}
    </button>
  );
};

const WholeList = memo(({ name }: { name: string }) => {
  const team = useSelector((state: State) => state.favorites.team);
  const renders = useRenderCount();
  return (
    <li>
      <span className="grow">{name}</span>
      <Toggle name={name} liked={team.includes(name)} />
      <RenderCount renders={renders} />
    </li>
  );
});

const OwnFlag = memo(({ name }: { name: string }) => {
  const liked = useSelector((state: State) => state.favorites.team.includes(name));
  const renders = useRenderCount();
  return (
    <li>
      <span className="grow">{name}</span>
      <Toggle name={name} liked={liked} />
      <RenderCount renders={renders} />
    </li>
  );
});

export const ReduxFavorites = () => (
  <Provider store={pokedexStore}>
    <Case
      title="every card reads the whole list"
      what={
        <>
          Both sides share one Redux store. A star on either side toggles a favourite. On the left each card selects the whole{' '}
          <code>favorites.team</code> array to find itself in it: the array is new after every toggle, so every card renders. On the right each card
          selects its own boolean, which changes only for the card that was starred. Seen in a Pokédex: one star rendered all three hundred cards.
        </>
      }
    >
      <div className="two">
        <Panel
          kind="broken"
          title="useSelector(s => s.favorites.team)"
          says="The recorder says: external store [pokedexStore] on every card, caused by redux:favorites/toggle."
          code={BROKEN}
        >
          <ul className="rows">
            {NAMES.map((name) => (
              <WholeList key={name} name={name} />
            ))}
          </ul>
        </Panel>
        <Panel
          kind="fixed"
          title="useSelector(s => s.favorites.team.includes(name))"
          says="The recorder says: external store [pokedexStore] on the starred card only."
          code={FIXED}
        >
          <ul className="rows">
            {NAMES.map((name) => (
              <OwnFlag key={name} name={name} />
            ))}
          </ul>
        </Panel>
      </div>
    </Case>
  </Provider>
);
