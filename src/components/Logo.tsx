export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="15" fill="var(--accent)" />
      <path d="M17 44.5 27.5 30l7.5 9.5 5-6 7 11H17Z" fill="var(--accent-fg)" />
      <circle cx="42" cy="22" r="5" fill="var(--accent-fg)" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[17px] font-bold tracking-tight">Racik</span>
    </span>
  );
}
