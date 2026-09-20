import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/TradeView';
import { connectPriceFeed } from './socket';

const client = new QueryClient();
const router = createBrowserRouter([{ path: '/', element: <Layout /> }]);

connectPriceFeed();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>
);
