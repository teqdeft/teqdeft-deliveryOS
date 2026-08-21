import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, useSession } from './lib/session.js';
import { AppShell } from './layout/AppShell.js';
import { SignIn } from './pages/SignIn.js';
import { Home } from './pages/Home.js';
import { Projects } from './pages/Projects.js';
import { ProjectOverview } from './pages/project/Overview.js';
import { Knowledge } from './pages/project/Knowledge.js';
import { Analysis } from './pages/project/Analysis.js';
import { Requirements } from './pages/project/Requirements.js';
import { Conflicts } from './pages/project/Conflicts.js';
import { Baseline } from './pages/project/Baseline.js';
import { Activity } from './pages/project/Activity.js';
import { Logo } from './components/Logo.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (failureCount, error) => {
        // Never retry an auth or permission failure — it will not change.
        const status = (error as { status?: number })?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <Gate />
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Gate() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-ink-900">
        <div className="animate-pulse"><Logo size={34} /></div>
      </div>
    );
  }

  if (!session) return <SignIn />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="projects" element={<Projects />} />
        <Route path="audit" element={<Activity />} />
        <Route path="projects/:projectId" element={<ProjectOverview />} />
        <Route path="projects/:projectId/knowledge" element={<Knowledge />} />
        <Route path="projects/:projectId/analysis" element={<Analysis />} />
        <Route path="projects/:projectId/requirements" element={<Requirements />} />
        <Route path="projects/:projectId/conflicts" element={<Conflicts />} />
        <Route path="projects/:projectId/baseline" element={<Baseline />} />
        <Route path="projects/:projectId/activity" element={<Activity />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
