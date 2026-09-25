/**
 * Ícone do app para ImageResponse: o mesmo símbolo do cabeçalho (quadrado azul
 * com linha de tendência, `icon.svg`). O fundo ocupa o quadrado inteiro porque
 * o iOS/Android arredondam os cantos sozinhos.
 */
export function AppIconMark({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, display: "flex", background: "#1f3a5f" }}>
      <svg width={size} height={size} viewBox="0 0 32 32">
        <path d="M8 21l5-6 4 3 7-8" stroke="#ffffff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
