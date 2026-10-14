import { useSettings } from '@/store/settings';

export function applyTheme(theme: 'system' | 'light' | 'dark') {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem('racik-theme');
    else localStorage.setItem('racik-theme', theme);
  } catch {
    /* storage blocked */
  }
  syncThemeColor();
}

export function syncThemeColor() {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', dark ? '#1c1c1b' : '#ffffff');
    m.removeAttribute('media');
  });
}

export function initTheme() {
  applyTheme(useSettings.getState().prefs.theme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);
}
