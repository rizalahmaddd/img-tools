import { lazy, Suspense, useEffect, type ComponentType, type LazyExoticComponent } from 'react';
import { createBrowserRouter, Link, RouterProvider, useParams, useRouteError } from 'react-router';
import { SpinnerGapIcon } from '@phosphor-icons/react';
import { AppShell } from './components/AppShell';
import { ExportSheet } from './components/ExportSheet';
import { GlobalInput } from './components/GlobalInput';
import { TaskBar, Toaster } from './components/Toaster';
import { UpdatePrompt } from './components/UpdatePrompt';
import { toolById } from './tools/registry';
import Home from './pages/Home';
import { useWorkspace } from './store/workspace';

const Files = lazy(() => import('./pages/Files'));
const Settings = lazy(() => import('./pages/Settings'));
const ToolsPage = lazy(() => import('./pages/ToolsPage'));

function Loading() {
  return (
    <div className="flex h-full items-center justify-center text-muted">
      <SpinnerGapIcon size={24} className="animate-spin" />
    </div>
  );
}

const lazyTools = new Map<string, LazyExoticComponent<ComponentType>>();

function toolComponent(id: string) {
  const meta = toolById(id);
  if (!meta) return null;
  // Must live outside the component: a lazy() created during a suspended first render is thrown away and re-created forever.
  if (!lazyTools.has(id)) lazyTools.set(id, lazy(meta.load));
  return lazyTools.get(id)!;
}

function ToolRoute() {
  const { id = '' } = useParams();
  const meta = toolById(id);
  const Comp = toolComponent(id);
  useEffect(() => {
    if (meta) document.title = `${meta.name} — Racik`;
    return () => {
      document.title = 'Racik — Image Tools';
    };
  }, [meta]);
  if (!Comp) return <NotFound />;
  return (
    <Suspense fallback={<Loading />}>
      <Comp key={id} />
    </Suspense>
  );
}

function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-semibold">Halaman tidak ditemukan</p>
      <Link to="/" className="text-sm font-medium text-accent">
        Kembali ke beranda
      </Link>
    </div>
  );
}

function RouteError() {
  const err = useRouteError() as Error;
  const chunk = /dynamically imported module|Failed to fetch|Importing a module script failed/i.test(err?.message ?? '');
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-semibold">{chunk ? 'Versi baru tersedia' : 'Terjadi kesalahan'}</p>
      <p className="max-w-sm text-sm text-muted">{chunk ? 'Muat ulang untuk memakai versi terbaru. Berkasmu tetap aman.' : err?.message}</p>
      <button type="button" className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg" onClick={() => location.reload()}>
        Muat ulang
      </button>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/alat', element: <Suspense fallback={<Loading />}><ToolsPage /></Suspense> },
      { path: '/berkas', element: <Suspense fallback={<Loading />}><Files /></Suspense> },
      { path: '/pengaturan', element: <Suspense fallback={<Loading />}><Settings /></Suspense> },
      { path: '/t/:id', element: <ToolRoute /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  const hydrated = useWorkspace((s) => s.hydrated);
  return (
    <>
      {hydrated ? <RouterProvider router={router} /> : <Loading />}
      <GlobalInput />
      <ExportSheet />
      <Toaster />
      <TaskBar />
      <UpdatePrompt />
    </>
  );
}
