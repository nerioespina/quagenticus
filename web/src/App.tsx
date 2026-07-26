import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './lib/auth';

import Login from './pages/Login';
import SpaceSelector from './pages/SpaceSelector';
import SpaceLayout from './components/SpaceLayout';
import Board from './pages/Board';
import RequirementsList from './pages/RequirementsList';
import DocumentsList from './pages/DocumentsList';
import DocumentEditor from './pages/DocumentEditor';
import AgentQueue from './pages/AgentQueue';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuth(s => s.token);
  const loadUser = useAuth(s => s.loadUser);

  useEffect(() => { loadUser(); }, []);

  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={
            <AuthGuard>
              <SpaceSelector />
            </AuthGuard>
          } />

          <Route path="/spaces/:spaceId" element={
            <AuthGuard>
              <SpaceLayout />
            </AuthGuard>
          }>
            <Route index element={<Navigate to="board" replace />} />
            <Route path="board" element={<Board />} />
            <Route path="requirements" element={<RequirementsList />} />
            <Route path="docs" element={<DocumentsList />} />
            <Route path="docs/:docId" element={<DocumentEditor />} />
            <Route path="agents" element={<AgentQueue />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
