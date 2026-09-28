import { createAsyncThunk, createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api } from '../api/client';
import type { Notification } from '../api/types';

const adapter = createEntityAdapter<Notification>({ sortComparer: (a, b) => b.createdAt - a.createdAt });

export const fetchNotifications = createAsyncThunk('notifications/fetch', () => api.notifications());

const slice = createSlice({
  name: 'notifications',
  initialState: adapter.getInitialState({ loaded: false }),
  reducers: {
    notificationReceived: adapter.addOne,
    markRead(state, action: PayloadAction<string>) {
      adapter.updateOne(state, { id: action.payload, changes: { readAt: Date.now() } });
    },
    markAllRead(state) {
      const now = Date.now();
      adapter.updateMany(
        state,
        state.ids.filter((id) => !state.entities[id].readAt).map((id) => ({ id, changes: { readAt: now } }))
      );
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchNotifications.fulfilled, (state, action) => {
      state.loaded = true;
      adapter.setAll(state, action.payload);
    });
  },
});

export const { notificationReceived, markRead, markAllRead } = slice.actions;
export const notificationsReducer = slice.reducer;
export const notificationSelectors = adapter.getSelectors();
