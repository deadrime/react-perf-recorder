import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/TradeView';
import { Catalogue } from './Demo';
import { connectPriceFeed } from './socket';

const client = new QueryClient();
// `/` is the demo: the cards that lead into the app, each on the page of one seeded bug.
const router = createBrowserRouter([
  { path: '/', element: <Catalogue /> },
  { path: '/app', element: <Layout /> },
  { path: '/bug/:id', element: <Layout /> },
]);

connectPriceFeed();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
