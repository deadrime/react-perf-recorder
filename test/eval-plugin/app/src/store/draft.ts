import { createStore } from 'zustand/vanilla';

/** Whether the message box holds unsent text. */
export const draftStore = createStore(() => ({ hasDraft: false }));
