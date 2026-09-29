import { create } from 'zustand';

export const useClicks = create<{ clicks: number; click: () => void }>((set) => ({
  clicks: 0,
  click: () => set((s) => ({ clicks: s.clicks + 1 })),
}));
