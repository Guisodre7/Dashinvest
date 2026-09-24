/** Ícone do app (quadrado azul com linha de tendência) para ImageResponse. */
export function AppIconMark({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#1f3a5f" }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 32 32">
        <path d="M5 23l7-8 5 4 10-11" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
