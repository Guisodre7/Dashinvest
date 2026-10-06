/**
 * Lê a página de detalhes do Fundamentus (ações e FIIs). A página pareia
 * rótulo e valor em células: <span class="txt">P/L</span> … <span class="txt">8,67</span>.
 * Só o que estiver na página é preenchido; "-" e vazios viram null.
 */
export interface BrFundamentals {
  code: string;
  kind: "acao" | "fii" | "desconhecido";
  name: string | null;
  sector: string | null;
  price: number | null;
  pl: number | null;
  pvp: number | null;
  lpa: number | null;
  vpa: number | null;
  /** Dividend yield 12 meses (%). */
  dy: number | null;
  roe: number | null;
  roic: number | null;
  netMargin: number | null;
  ebitMargin: number | null;
  evEbitda: number | null;
  grossDebtToEquity: number | null;
  revenueGrowth5y: number | null;
  /** FII */
  dividendPerShare12m: number | null;
  ffoYield: number | null;
  vacancy: number | null;
  properties: number | null;
  capRate: number | null;
  segment: string | null;
  /** Data do último balanço / cotação informada na página. */
  asOf: string | null;
  fieldsFound: number;
}

const strip = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** "8,67" · "6,2%" · "1.234.567" · "-0,5%" · "-" → número (percentuais em pontos). */
export function brNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/[R$%\s]/g, "");
  if (!s || s === "-" || !/\d/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Pares rótulo → valor, na ordem da página. */
export function fundamentusPairs(html: string): Map<string, string> {
  const pairs = new Map<string, string>();
  const cells = [...html.matchAll(/<td[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/gi)];
  for (let i = 0; i < cells.length - 1; i++) {
    const [cls, next] = [cells[i][1], cells[i + 1][1]];
    if (/\blabel\b/.test(cls) && /\bdata\b/.test(next)) {
      const label = strip(cells[i][2]).replace(/^\?\s*/, "");
      if (label && !pairs.has(label)) pairs.set(label, strip(cells[i + 1][2]));
    }
  }
  return pairs;
}

export function parseFundamentus(code: string, html: string): BrFundamentals {
  const p = fundamentusPairs(html);
  const get = (...labels: string[]) => {
    for (const l of labels) {
      for (const [k, v] of p) if (k.toLowerCase().replace(/\s+/g, " ") === l.toLowerCase()) return v;
    }
    return undefined;
  };
  const num = (...labels: string[]) => brNumber(get(...labels));
  const isFii = /fii|fundo imobili|ffo yield|vac[aâ]ncia|im[oó]veis/i.test([...p.keys()].join(" ")) || /^[A-Z]{4}11$/.test(code) && p.has("FFO Yield");
  const out: BrFundamentals = {
    code, kind: p.size === 0 ? "desconhecido" : isFii ? "fii" : "acao",
    name: get("Empresa", "Nome") ?? null,
    sector: get("Setor") ?? null,
    price: num("Cotação"),
    pl: num("P/L"),
    pvp: num("P/VP"),
    lpa: num("LPA"),
    vpa: num("VPA", "VP/Cota"),
    dy: num("Div. Yield", "Div.Yield", "Dividend Yield"),
    roe: num("ROE"),
    roic: num("ROIC"),
    netMargin: num("Marg. Líquida", "Marg. Liquida"),
    ebitMargin: num("Marg. EBIT"),
    evEbitda: num("EV / EBITDA", "EV/EBITDA"),
    grossDebtToEquity: num("Div Br/ Patrim", "Dív. Brut/ Patrim.", "Div. Brut/ Patrim."),
    revenueGrowth5y: num("Cres. Rec (5a)", "Cres. Rec. (5a)"),
    dividendPerShare12m: num("Dividendo/cota", "Rend. Distribuído"),
    ffoYield: num("FFO Yield"),
    vacancy: num("Vacância Média", "Vacancia Media", "Vacância"),
    properties: num("Qtd imóveis", "Qtd Imóveis", "Qtd. imóveis"),
    capRate: num("Cap Rate"),
    segment: get("Segmento", "Subsetor") ?? null,
    asOf: (() => { const d = get("Últ balanço processado", "Data últ cot", "Ult balanco processado"); const m = d?.match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; })(),
    fieldsFound: p.size,
  };
  return out;
}
