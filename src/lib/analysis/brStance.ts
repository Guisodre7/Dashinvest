import type { BrFundamentals } from "../market/parseFundamentus";
import type { Quote } from "../market/types";
import type { BrStrategy } from "../portfolio/brStrategy";
import type { LedgerEntry, PortfolioLedgerSummary } from "../portfolio/ledger";
import { brFair, brQuality } from "./brValuation";
import { computeStance, type Stance } from "./stance";
import type { TaxSettings } from "./stanceInput";

export interface BrStanceView {
  stance: Stance;
  code: string;
  assetClass: "acao" | "fii";
  name: string | null;
  price: number | null;
  fundamentals: BrFundamentals | null;
  methods: { label: string; value: number }[];
  fairReason: string | null;
  qualityNotes: string[];
}

/**
 * Postura dos ativos da carteira Brasil (estratégia + posições), com o mesmo
 * motor da carteira internacional. Meta por ativo = meta da classe ÷ nº de
 * ativos ativos da classe.
 */
export function brStances(
  strategy: BrStrategy, summary: PortfolioLedgerSummary, entries: LedgerEntry[],
  quotes: Record<string, Quote | null>, fundamentals: Record<string, BrFundamentals>, tax: TaxSettings, now = new Date(),
): BrStanceView[] {
  const since = new Date(now.getTime() - 548 * 86_400_000).toISOString().slice(0, 10);
  const enabled = strategy.assets.filter((a) => a.enabled);
  const codes = [...new Set([
    ...enabled.map((a) => a.code),
    ...summary.holdings.filter((h) => (h.asset_class === "acao" || h.asset_class === "fii") && h.quantity > 0).map((h) => h.code),
  ])];
  return codes.map((code) => {
    const asset = enabled.find((a) => a.code === code);
    const h = summary.holdings.find((x) => x.code === code);
    const f = fundamentals[code] ?? null;
    const cls: "acao" | "fii" = (asset?.asset_class ?? (h?.asset_class === "fii" ? "fii" : f?.kind === "fii" ? "fii" : "acao"));
    const price = quotes[code]?.price ?? f?.price ?? null;
    const { fair, methods, reason } = f ? brFair(f, price) : { fair: null, methods: [], reason: "Fundamentos indisponíveis." };
    const q = f ? brQuality(f) : { score: null, coverage: 0, notes: [] };
    const nInClass = enabled.filter((a) => a.asset_class === cls).length || 1;
    const target = asset ? strategy.classes[cls] / nInClass : 0;
    const sell = entries.filter((e) => e.code === code && e.kind === "sell" && e.trade_date >= since && e.price && e.quantity).sort((a, b) => b.trade_date.localeCompare(a.trade_date))[0];
    const stance = computeStance({
      ticker: code, isEtf: false, isLegacy: false, price, fair,
      qualityScore: q.score, qualityCoverage: q.coverage, signalKinds: [],
      estimates: { direction: "unknown", significantCut: false, epsRev90d: null },
      priceChange6m: null,
      weight: h?.weight ?? 0, target, maxWeight: target * 1.5,
      position: h && h.quantity > 0 && h.value !== null ? { quantity: h.quantity, avgCost: h.avg_price, value: h.value } : null,
      lastSell: sell ? { date: sell.trade_date, price: sell.price!, quantity: sell.quantity! } : null,
      tax: cls === "fii" ? tax.BR_FII : tax.BR_ACAO, currency: "R$",
    });
    if (!fair && reason) stance.reasons.push(reason);
    return { stance, code, assetClass: cls, name: asset?.name ?? h?.name ?? f?.name ?? null, price, fundamentals: f, methods, fairReason: reason, qualityNotes: q.notes };
  });
}
