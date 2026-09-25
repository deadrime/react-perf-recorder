import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './app.css';
import { Layout } from './components/ChatView';
import { AdvancedPage } from './advanced';
import { BasicsPage } from './basics';
import { app } from './app-router';
import { BASE } from './base';
import { Catalogue } from './Demo';
import { DocsPage } from './Docs';

const client = new QueryClient();
// `/` is the demo: the cards that lead into the app, each on the page of one seeded bug.
const router = createBrowserRouter(
  [
    { path: '/', element: <Catalogue /> },
    { path: '/docs/:page?', element: <DocsPage /> },
    { path: '/app', element: <Layout /> },
    { path: '/bug/:id', element: <Layout /> },
    { path: '/basics/:id', element: <BasicsPage /> },
    { path: '/advanced/:id', element: <AdvancedPage /> },
  ],
  { basename: BASE.replace(/\/$/, '') || '/' }
);

app.router = router;

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
