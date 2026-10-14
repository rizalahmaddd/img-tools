export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

export function percentChange(before: number, after: number): string {
  if (!before) return '';
  const p = ((after - before) / before) * 100;
  if (Math.abs(p) < 0.5) return '±0%';
  return `${p > 0 ? '+' : '−'}${Math.abs(p).toFixed(0)}%`;
}

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 16);

export function baseName(name: string): string {
  const i = name.lastIndexOf('.');
  return (i > 0 ? name.slice(0, i) : name).trim() || 'gambar';
}

export function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150) || 'gambar';
}

export interface NameVars {
  name: string;
  n: number;
  w: number;
  h: number;
  ext: string;
  tool?: string;
}

export function applyPattern(pattern: string, v: NameVars): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const out = (pattern || '{name}').replace(/\{(\w+)\}/g, (m, k) => {
    switch (k) {
      case 'name':
        return v.name;
      case 'n':
        return String(v.n).padStart(2, '0');
      case 'w':
        return String(v.w);
      case 'h':
        return String(v.h);
      case 'date':
        return date;
      case 'tool':
        return v.tool ?? '';
      default:
        return m;
    }
  });
  return `${sanitizeName(out)}.${v.ext}`;
}

export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (!count) return n;
    const dot = n.lastIndexOf('.');
    return dot > 0 ? `${n.slice(0, dot)} (${count})${n.slice(dot)}` : `${n} (${count})`;
  });
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
