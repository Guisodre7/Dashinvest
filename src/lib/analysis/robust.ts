/** Mediana de uma lista (não precisa estar ordenada). */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/**
 * Faixa robusta de valor justo a partir de vários métodos.
 * Um método só é descartado se for um outlier CLARO: os demais concordam entre si
 * (±25%) e ele está a mais de 50% deles. Métodos espalhados sem consenso continuam
 * todos na conta — e a divergência (spread) acusa dado conflitante.
 */
export function robustRange(values: number[]): { mid: number; low: number; high: number; spread: number; kept: number[] } {
  let kept = [...values];
  if (values.length >= 3) {
    const m = median(values);
    const far = values.reduce((a, v) => (Math.abs(v - m) > Math.abs(a - m) ? v : a), values[0]);
    const rest = values.filter((v, i) => i !== values.indexOf(far));
    const rm = median(rest);
    const restSpread = (Math.max(...rest) - Math.min(...rest)) / rm;
    if (restSpread <= 0.25 && Math.abs(far - rm) / rm > 0.5) kept = rest;
  }
  const mid = median(kept);
  const low = Math.min(...kept), high = Math.max(...kept);
  return { mid, low, high, spread: (high - low) / mid, kept };
}
