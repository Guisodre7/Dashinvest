/** Ícones SVG do app (no lugar de emojis: renderização igual em qualquer sistema). */
type P = { size?: number; className?: string };

export function FlagBR({ size = 16, className }: P) {
  return (
    <svg className={`ico-flag ${className ?? ""}`} width={size * 1.4} height={size} viewBox="0 0 28 20" aria-hidden="true">
      <rect width="28" height="20" rx="3" fill="#1f8a4c" />
      <path d="M14 3 25 10 14 17 3 10Z" fill="#f2c230" />
      <circle cx="14" cy="10" r="4.2" fill="#1f3f8f" />
    </svg>
  );
}

export function FlagUS({ size = 16, className }: P) {
  return (
    <svg className={`ico-flag ${className ?? ""}`} width={size * 1.4} height={size} viewBox="0 0 28 20" aria-hidden="true">
      <clipPath id="us-r"><rect width="28" height="20" rx="3" /></clipPath>
      <g clipPath="url(#us-r)">
        <rect width="28" height="20" fill="#fff" />
        {[0, 2, 4, 6, 8, 10, 12].map((i) => <rect key={i} y={(i * 20) / 13} width="28" height={20 / 13} fill="#b8333a" />)}
        <rect width="12" height="10.8" fill="#2b3a67" />
      </g>
    </svg>
  );
}

const line = (d: React.ReactNode) => function Icon({ size = 20, className }: P) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  );
};

export const IconGlobe = line(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" /></>);
export const IconSearch = line(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IconBook = line(<><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3Z" /><path d="M5 17a3 3 0 0 1 3-3h11" /></>);
