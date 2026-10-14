import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { hydrateWorkspace, useWorkspace } from './store/workspace';
import { initTheme } from './lib/theme';
import './index.css';

initTheme();
hydrateWorkspace();
if (import.meta.env.DEV) (window as unknown as { __ws: typeof useWorkspace }).__ws = useWorkspace;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
