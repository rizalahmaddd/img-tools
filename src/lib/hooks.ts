import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export const useDesktop = () => useMedia('(min-width: 1024px)');

const urlCache = new WeakMap<Blob, { url: string; refs: number }>();

export function useObjectUrl(blob: Blob | null | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>();
  useLayoutEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    setUrl(acquire(blob));
    return () => release(blob);
  }, [blob]);
  return blob ? url : undefined;
}

function acquire(b: Blob) {
  let e = urlCache.get(b);
  if (!e) {
    e = { url: URL.createObjectURL(b), refs: 0 };
    urlCache.set(b, e);
  }
  e.refs++;
  return e.url;
}

function release(b: Blob) {
  const e = urlCache.get(b);
  if (!e) return;
  e.refs--;
  if (e.refs <= 0) {
    const url = e.url;
    urlCache.delete(b);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const key = [(e.ctrlKey || e.metaKey) && 'mod', e.shiftKey && 'shift', e.altKey && 'alt', e.key.toLowerCase()].filter(Boolean).join('+');
      const fn = ref.current[key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [enabled]);
}

export function useImageBitmap(blob: Blob | null | undefined) {
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  useEffect(() => {
    if (!blob) return setBmp(null);
    let alive = true;
    let made: ImageBitmap | null = null;
    createImageBitmap(blob)
      .then((b) => {
        made = b;
        if (alive) setBmp(b);
        else b.close();
      })
      .catch(() => alive && setBmp(null));
    return () => {
      alive = false;
      // Closing right away would break effects in the same commit that still hold the previous bitmap.
      const old = made;
      if (old) setTimeout(() => old.close(), 3000);
    };
  }, [blob]);
  return bmp;
}
