import "server-only";
import { unstable_cache } from "next/cache";
import { getText, HttpError } from "./http";
import { isDemoProvider } from "./index";
import { parseFundamentus, type BrFundamentals } from "./parseFundamentus";

const URL_BASE = "https://www.fundamentus.com.br/detalhes.php?papel=";

/**
 * Fundamentos da B3 pelo Fundamentus (gratuito, sem chave; página pública).
 * 24h no cache compartilhado — fundamentos mudam devagar. Erros não ficam no cache.
 */
const fetchOne = (code: string) => unstable_cache(async () => {
  const html = await getText("fundamentus", `detalhes:${code}`, `${URL_BASE}${encodeURIComponent(code)}`, {
    revalidate: 0, ticker: code, timeoutMs: 8_000, encoding: "iso-8859-1",
    headers: { "User-Agent": "Mozilla/5.0 (compatible; DashInvest/1.0)", Accept: "text/html" },
  });
  const f = parseFundamentus(code, html);
  if (f.fieldsFound < 5) throw new Error("página sem indicadores");
  return f;
}, ["fundamentus", code], { revalidate: 86_400 })();

/** Só para MARKET_DATA_PROVIDER=demo (desenvolvimento local; recusado em produção). */
function demoFundamentals(code: string): BrFundamentals {
  const seed = [...code].reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = (min: number, max: number, k: number) => Math.round((min + ((seed * k) % 1000) / 1000 * (max - min)) * 100) / 100;
  const fii = /11$/.test(code) && !code.startsWith("BPAC");
  const price = fii ? r(80, 170, 7) : r(15, 60, 7);
  const base = { code, name: `${code} (demo)`, sector: null, price, asOf: "2026-06-30", fieldsFound: 12, segment: fii ? "Demo" : null } as const;
  return fii
    ? { ...base, kind: "fii", pl: null, pvp: r(0.8, 1.15, 3), lpa: null, vpa: Math.round(price / r(0.8, 1.15, 3) * 100) / 100, dy: r(7, 12, 5), roe: null, roic: null, netMargin: null, ebitMargin: null, evEbitda: null, grossDebtToEquity: null, revenueGrowth5y: null, dividendPerShare12m: r(8, 15, 9), ffoYield: r(7, 11, 4), vacancy: r(0, 15, 11), properties: Math.round(r(3, 30, 13)), capRate: r(7, 10, 2) }
    : { ...base, kind: "acao", pl: r(5, 14, 3), pvp: r(0.9, 2.5, 5), lpa: Math.round(price / r(5, 14, 3) * 100) / 100, vpa: Math.round(price / r(0.9, 2.5, 5) * 100) / 100, dy: r(3, 9, 9), roe: r(8, 24, 11), roic: r(6, 18, 13), netMargin: r(5, 30, 17), ebitMargin: null, evEbitda: r(3, 8, 19), grossDebtToEquity: r(0.2, 2, 23), revenueGrowth5y: r(-2, 15, 29), dividendPerShare12m: null, ffoYield: null, vacancy: null, properties: null, capRate: null };
}

export async function getBrFundamentals(codes: string[]): Promise<{ data: Record<string, BrFundamentals>; errors: Record<string, string> }> {
  if (isDemoProvider() && process.env.NODE_ENV !== "production") return { data: Object.fromEntries(codes.map((c) => [c, demoFundamentals(c)])), errors: {} };
  const data: Record<string, BrFundamentals> = {};
  const errors: Record<string, string> = {};
  for (let i = 0; i < codes.length; i += 3) {
    await Promise.all(codes.slice(i, i + 3).map(async (code) => {
      try { data[code] = await fetchOne(code); }
      catch (err) { errors[code] = err instanceof HttpError ? `HTTP ${err.status}` : err instanceof Error ? err.message.slice(0, 60) : "sem resposta"; }
    }));
  }
  return { data, errors };
}
