import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuth } from './lib/auth';
import { useTheme } from './lib/theme';
import { useLiveEvents } from './lib/events';
import { ApiError } from './lib/api';
import AppLayout from './components/layout/AppLayout';
import { ConfirmHost } from './components/ui/Confirm';
import { ErrorBoundary, Spinner } from './components/ui/misc';
import Login from './pages/Login';

const SpaceSelector = lazy(() => import('./pages/SpaceSelector'));
const Board = lazy(() => import('./pages/Board'));
const RequirementsList = lazy(() => import('./pages/RequirementsList'));
const RequirementDetail = lazy(() => import('./pages/RequirementDetail'));
const DocumentsList = lazy(() => import('./pages/DocumentsList'));
const DocumentEditor = lazy(() => import('./pages/DocumentEditor'));
const AgentQueue = lazy(() => import('./pages/AgentQueue'));
const SpaceSettings = lazy(() => import('./pages/SpaceSettings'));
const Milestones = lazy(() => import('./pages/Milestones'));
const AccountAdmin = lazy(() => import('./pages/AccountAdmin'));
const Profile = lazy(() => import('./pages/Profile'));
const MyWork = lazy(() => import('./pages/MyWork'));
const SearchPage = lazy(() => import('./pages/SearchPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (err instanceof ApiError && err.status === 401) useAuth.getState().logout();
      else if (query.meta?.silent !== true && !(err instanceof ApiError && err.status === 404)) console.warn(err);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) useAuth.getState().logout();
    },
  }),
});

function Fallback() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

function AuthGuard() {
  const status = useAuth((s) => s.status);
  const location = useLocation();
  useLiveEvents();
  if (status === 'loading') return <div className="h-screen flex items-center justify-center"><Spinner /></div>;
  if (status === 'anonymous') return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

const page = (el: React.ReactNode) => <Suspense fallback={<Fallback />}>{el}</Suspense>;

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <AuthGuard />,
    errorElement: <ErrorBoundary><p className="p-8 text-sm">Error de navegación.</p></ErrorBoundary>,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: page(<SpaceSelector />) },
          { path: '/my-work', element: page(<MyWork />) },
          { path: '/search', element: page(<SearchPage />) },
          { path: '/profile', element: page(<Profile />) },
          { path: '/admin', element: page(<AccountAdmin />) },
          {
            path: '/spaces/:spaceId',
            children: [
              { index: true, element: <Navigate to="board" replace /> },
              { path: 'board', element: page(<Board />) },
              { path: 'requirements', element: page(<RequirementsList />) },
              { path: 'requirements/:reqId', element: page(<RequirementDetail />) },
              { path: 'docs', element: page(<DocumentsList />) },
              { path: 'docs/:docId', element: page(<DocumentEditor />) },
              { path: 'milestones', element: page(<Milestones />) },
              { path: 'agents', element: page(<AgentQueue />) },
              { path: 'settings', element: page(<SpaceSettings />) },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default function App() {
  const theme = useTheme((s) => s.theme);
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <ConfirmHost />
      <Toaster theme={theme} position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
