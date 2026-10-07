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

/**
 * Valor em dinheiro de aporte (R$/US$): como parseUserNumber, mas "10.000" e "5.000" são
 * milhar pt-BR (dinheiro digitado sem centavos), não 10 e 5. "182.57" continua decimal.
 * Não usar para quantidade de cotas (ações fracionárias como "2.345" são reais).
 */
export function parseMoneyInput(raw: unknown): number | null {
  const s = String(raw ?? "").trim().replace(/\s|R\$|US\$/g, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return parseUserNumber(s);
}
