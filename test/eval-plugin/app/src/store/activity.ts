import { configureStore, createSelector, createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface ActivityItem {
  id: number;
  text: string;
  muted: boolean;
}

/** The connection's heartbeat: every event from the socket beats it. */
const connection = createSlice({
  name: 'connection',
  initialState: { beat: 0 },
  reducers: {
    beat: (state, action: PayloadAction<number>) => {
      state.beat = action.payload;
    },
  },
});

/** What happened in the channel; bots are muted. */
const activity = createSlice({
  name: 'activity',
  initialState: {
    items: [
      { id: 1, text: 'Anna joined', muted: false },
      { id: 2, text: 'deploy-bot posted a build', muted: true },
      { id: 3, text: 'Chen pinned a message', muted: false },
    ] as ActivityItem[],
  },
  reducers: {
    add: (state, action: PayloadAction<Omit<ActivityItem, 'id'>>) => {
      state.items.push({ id: state.items.length + 1, ...action.payload });
      if (state.items.length > 20) state.items.shift();
    },
  },
});

export const store = configureStore({ reducer: { connection: connection.reducer, activity: activity.reducer } });
export type State = ReturnType<typeof store.getState>;
export const { beat } = connection.actions;
export const { add: addActivity } = activity.actions;

export const selectVisibleActivity = createSelector([(s: State) => s.activity.items], (items) => items.filter((i) => !i.muted));
