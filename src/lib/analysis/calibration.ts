import type { BandKey } from "./stance";

/** Retrato diário gravado pelo painel (mesmo formato de StanceHistory). */
type Snap = { p: number | null; b: BandKey | null; a: string };
type History = Record<string, Record<string, Snap>>;

export interface BandOutcome {
  band: BandKey;
  /** Nº de observações (ativo × dia) com preço inicial e final conhecidos. */
  n: number;
  /** Retorno médio e mediano do preço no horizonte (%), sem dividendos. */
  avg: number;
  median: number;
  /** Fração das observações com retorno positivo. */
  hitRate: number;
}

export interface Calibration {
  horizonDays: number;
  outcomes: BandOutcome[];
  /** Dias de histórico disponíveis e mínimo necessário para avaliar este horizonte. */
  daysOfHistory: number;
  ready: boolean;
}

const BANDS: BandKey[] = ["forte", "atrativo", "justo", "esticado", "extremo"];
const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Avaliação ponto-a-ponto das faixas do painel (spec §26), SEM look-ahead: cada observação usa
 * a faixa e o preço gravados naquele dia e o preço gravado ~N dias depois (até 7 dias de folga,
 * para fins de semana/feriados). Nada do futuro entra na faixa do passado.
 * Pergunta respondida: "o que o painel chamou de barato rendeu mais que o que chamou de caro?"
 * Limites: retorno de preço (sem dividendos, custos e impostos) e amostra pequena no início.
 */
export function calibrate(hist: History, horizonDays: number, minObs = 20): Calibration {
  const dates = Object.keys(hist).sort();
  const span = dates.length ? Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86_400_000) : 0;
  const byBand = new Map<BandKey, number[]>(BANDS.map((b) => [b, []]));
  for (const d of dates) {
    const target = addDays(d, horizonDays);
    const later = dates.find((x) => x >= target && x <= addDays(target, 7));
    if (!later) continue;
    for (const [ticker, s] of Object.entries(hist[d])) {
      const end = hist[later][ticker];
      if (!s.b || !s.p || !end?.p) continue;
      byBand.get(s.b)!.push((end.p / s.p - 1) * 100);
    }
  }
  const outcomes = BANDS.map((band) => {
    const r = byBand.get(band)!;
    const sorted = [...r].sort((a, b) => a - b);
    const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
    return { band, n: r.length, avg: r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0, median, hitRate: r.length ? r.filter((x) => x > 0).length / r.length : 0 };
  }).filter((o) => o.n > 0);
  return { horizonDays, outcomes, daysOfHistory: span, ready: outcomes.reduce((a, o) => a + o.n, 0) >= minObs && span >= horizonDays };
}
