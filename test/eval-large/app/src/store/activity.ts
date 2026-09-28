import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api } from '../api/client';
import type { ActivityEvent } from '../api/types';

const KEEP = 60;

export const fetchActivity = createAsyncThunk('activity/fetch', () => api.activity());

const slice = createSlice({
  name: 'activity',
  initialState: { events: [] as ActivityEvent[] },
  reducers: {
    activityReceived(state, action: PayloadAction<ActivityEvent>) {
      state.events.unshift(action.payload);
      if (state.events.length > KEEP) state.events.length = KEEP;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchActivity.fulfilled, (state, action) => {
      state.events = action.payload.sort((a, b) => b.at - a.at).slice(0, KEEP);
    });
  },
});

export const { activityReceived } = slice.actions;
export const activityReducer = slice.reducer;
