import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface Clicks {
  clicks: number;
  more: () => void;
}

export const useClicks = create<Clicks>()(
  devtools((set) => ({ clicks: 0, more: () => set((s) => ({ clicks: s.clicks + 1 }), undefined, 'clicks/more') }), { name: 'clicks' })
);
