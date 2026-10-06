/**
 * Número digitado pelo usuário ou vindo de URL, em pt-BR ("1.234,56") ou
 * en-US/decimal simples ("182.57"). Retorna null se vazio/inválido.
 */
export function parseUserNumber(raw: unknown): number | null {
  let s = String(raw ?? "").trim().replace(/\s|R\$|US\$/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
