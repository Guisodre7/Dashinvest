import type { AllocationLine, AllocationResult } from "../analysis/allocation";
import type { BrStanceView } from "../analysis/brStance";
import { brConfidence } from "../analysis/brValuation";
import type { BrStrategy } from "../portfolio/brStrategy";
import { CLASS_LABEL, type PortfolioLedgerSummary } from "../portfolio/ledger";
import type { BrAllocation } from "./brAllocate";

/**
 * Converte o aporte da carteira Brasil no mesmo formato do aporte internacional,
 * para as duas carteiras usarem a mesma tela (só prioridade média para cima recebe).
 */
export function brAllocationResult(alloc: BrAllocation, summary: PortfolioLedgerSummary, strategy: BrStrategy, views: BrStanceView[]): AllocationResult {
  const total = summary.currentValue;
  const after = total + alloc.amount;
  const enabled = strategy.assets.filter((a) => a.enabled);
  const priced = enabled.filter((a) => views.some((v) => v.code === a.code && v.stance.band !== null)).length;
  const cash = alloc.lines.filter((l) => l.assetClass === "caixa");
  const invest = alloc.lines.filter((l) => l.assetClass !== "caixa");
  const invested = invest.reduce((a, l) => a + l.amount, 0);
  const classValue = (c: string) => summary.classes.find((x) => x.asset_class === c)?.value ?? 0;

  const lines: AllocationLine[] = invest.map((l) => {
    const v = l.code ? views.find((x) => x.code === l.code) : undefined;
    const isRf = l.assetClass === "renda_fixa";
    const nIn = enabled.filter((a) => a.asset_class === l.assetClass).length || 1;
    const value = isRf ? classValue("renda_fixa") : summary.holdings.find((h) => h.code === l.code)?.value ?? 0;
    const target = isRf ? strategy.classes.renda_fixa : (strategy.classes[l.assetClass as "acao" | "fii"] ?? 0) / nIn;
    const current = total > 0 ? (value / total) * 100 : 0;
    const high = l.stance === "comprar" || l.stance === "recompra";
    // Alternativas da mesma classe que ficaram atrás, com o motivo (spec §13).
    const alternatives = isRf ? [] : enabled
      .filter((a) => a.asset_class === l.assetClass && a.code !== l.code)
      .map((a) => {
        const other = alloc.lines.find((x) => x.code === a.code);
        const ov = views.find((x) => x.code === a.code);
        return other ? `${a.code} (também recebe)` : `${a.code} (${ov ? ov.stance.headline.split(":")[0].toLowerCase() : "sem dados de valuation"})`;
      }).slice(0, 3);
    // O que faria mudar (spec §13/§34): limites de preço da própria faixa de valuation.
    const bands = v?.stance.bands ?? [];
    const fmtR = (x: number | null) => (x === null ? "—" : `R$ ${x.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    const change = isRf ? "Muda se a renda fixa atingir a meta da classe."
      : bands.length >= 5 ? `Deixa de receber acima de ${fmtR(bands[2].high)} (preço esticado) ou se a tese deteriorar; vira prioridade alta abaixo de ${fmtR(bands[1].high)}.` : undefined;
    // Confiança (spec §22): a mesma regra do detalhe do ativo.
    const confidence: AllocationLine["confidence"] = isRf ? "Média" : v ? brConfidence(v) : "Baixa";
    return {
      alternatives, change,
      ticker: l.label, name: v?.name ?? l.label, bucket: isRf ? "RENDA FIXA" : CLASS_LABEL[l.assetClass as "acao" | "fii"].toUpperCase(),
      amount: l.amount, share: invested > 0 ? l.amount / invested : 0,
      action: high ? "COMPRAR" : "APORTE NORMAL", priority: high ? "ALTA" : "MÉDIA",
      opportunityScore: null, currentWeight: current, targetWeight: target,
      weightAfter: after > 0 ? ((value + l.amount) / after) * 100 : 0, gap: target - current,
      why: v ? `${l.reason} ${v.stance.headline}` : l.reason,
      favorable: v ? v.stance.reasons.slice(0, 4) : [`${current.toFixed(1)}% hoje × meta ${target.toFixed(0)}%`],
      // Só o que pesa contra (indicador fraco ou dado ausente) — ponto positivo não é risco (spec §17).
      risks: v ? [...v.qualityNotes.filter((q) => /fraco|não está na fonte/.test(q)).slice(0, 3), "preço pode cair mais no curto prazo — faixa de valuation não é garantia"] : ["rentabilidade depende do título escolhido (prazo, indexador, emissor)"],
      confidence, blocked: false,
      dataUsed: v ? ["Cotação brapi (atrasada)", v.fundamentals ? "Fundamentos: Fundamentus" : "sem fundamentos"] : ["Saldo informado por você"],
    };
  });

  return {
    contribution: alloc.amount, invested, opportunityCash: cash.reduce((a, l) => a + l.amount, 0),
    cashReason: cash.length ? cash.map((l) => l.reason).join(" ") : null,
    blocked: false, blockReasons: [], lines,
    dataQuality: enabled.length ? (priced / enabled.length) * 100 : 0,
    generatedAt: new Date().toISOString(),
    notes: [...alloc.notes, `Por classe: ${alloc.classSplit.map((c) => c.why).join(" · ")}.`],
  };
}
