import { createAsyncThunk, createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api } from '../api/client';
import type { Issue, IssuePatch } from '../api/types';

const adapter = createEntityAdapter<Issue>({ sortComparer: (a, b) => b.updatedAt - a.updatedAt });

export const fetchIssues = createAsyncThunk('issues/fetch', () => api.issues());

/** Optimistic: the patch lands at once and is rolled back if the server says no. */
export const updateIssue = createAsyncThunk('issues/update', ({ id, patch }: { id: string; patch: IssuePatch }) => api.updateIssue(id, patch));

interface State {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  error: string | null;
  /** Previous values of fields changed optimistically, by issue id. */
  pending: Record<string, Partial<Issue>>;
}

const slice = createSlice({
  name: 'issues',
  initialState: adapter.getInitialState<State>({ status: 'idle', error: null, pending: {} }),
  reducers: {
    /** Someone else changed an issue: the realtime socket says so. */
    issueReceived(state, action: PayloadAction<Issue>) {
      if (state.pending[action.payload.id]) return;
      adapter.upsertOne(state, action.payload);
    },
    commentCounted(state, action: PayloadAction<{ id: string; commentCount: number; updatedAt: number }>) {
      const { id, ...changes } = action.payload;
      adapter.updateOne(state, { id, changes });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchIssues.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchIssues.fulfilled, (state, action) => {
        state.status = 'ready';
        adapter.setAll(state, action.payload);
      })
      .addCase(fetchIssues.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Could not load issues';
      })
      .addCase(updateIssue.pending, (state, action) => {
        const { id, patch } = action.meta.arg;
        const current = state.entities[id];
        if (!current) return;
        state.pending[id] = Object.fromEntries(Object.keys(patch).map((k) => [k, current[k as keyof Issue]]));
        adapter.updateOne(state, { id, changes: { ...patch, updatedAt: Date.now() } });
      })
      .addCase(updateIssue.fulfilled, (state, action) => {
        delete state.pending[action.payload.id];
        adapter.upsertOne(state, action.payload);
      })
      .addCase(updateIssue.rejected, (state, action) => {
        const { id } = action.meta.arg;
        const previous = state.pending[id];
        delete state.pending[id];
        if (previous) adapter.updateOne(state, { id, changes: previous });
      });
  },
});

export const { issueReceived, commentCounted } = slice.actions;
export const issuesReducer = slice.reducer;
export const issueSelectors = adapter.getSelectors();
