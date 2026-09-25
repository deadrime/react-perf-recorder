import type { createBrowserRouter } from 'react-router-dom';

/** The router main.tsx created, for code that navigates without a hook; kept here so pages need not import main. */
export const app: { router: ReturnType<typeof createBrowserRouter> | null } = { router: null };
