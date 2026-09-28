import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type Density = 'comfortable' | 'compact';
export type Theme = 'dark' | 'light' | 'system';
export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting';

interface AppState {
  sidebarCollapsed: boolean;
  density: Density;
  theme: Theme;
  showEstimates: boolean;
  commandOpen: boolean;
  connection: { status: ConnectionStatus; latencyMs: number | null; lastEventAt: number | null };
  toggleSidebar(): void;
  setDensity(density: Density): void;
  setTheme(theme: Theme): void;
  setShowEstimates(show: boolean): void;
  setCommandOpen(open: boolean): void;
  heartbeat(latencyMs: number): void;
  setConnection(status: ConnectionStatus): void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        sidebarCollapsed: false,
        density: 'comfortable',
        theme: 'dark',
        showEstimates: true,
        commandOpen: false,
        connection: { status: 'connecting', latencyMs: null, lastEventAt: null },
        toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }), false, 'ui/toggleSidebar'),
        setDensity: (density) => set({ density }, false, 'ui/setDensity'),
        setTheme: (theme) => set({ theme }, false, 'ui/setTheme'),
        setShowEstimates: (showEstimates) => set({ showEstimates }, false, 'ui/setShowEstimates'),
        setCommandOpen: (commandOpen) => set({ commandOpen }, false, 'ui/setCommandOpen'),
        heartbeat: (latencyMs) => set({ connection: { status: 'live', latencyMs, lastEventAt: Date.now() } }, false, 'connection/heartbeat'),
        setConnection: (status) => set((s) => ({ connection: { ...s.connection, status } }), false, 'connection/status'),
      }),
      {
        name: 'orbit:prefs',
        partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, density: s.density, theme: s.theme, showEstimates: s.showEstimates }),
      }
    ),
    { name: 'app' }
  )
);
