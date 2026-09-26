import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './app.css';
import { Layout } from './components/ChatView';
import { store } from './store/activity';

const client = new QueryClient();
const router = createBrowserRouter([{ path: '*', element: <Layout /> }]);

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </Provider>
);
