import type { AlertRow } from "../db/repo";
import type { AssetAnalysis } from "./analyze";

/**
 * Gera alertas a partir das análises. `dedupe_key` evita repetir o mesmo
 * alerta no mesmo dia. Nenhum alerta diz "compre agora".
 */
export function deriveAlerts(analyses: AssetAnalysis[], now = new Date()): AlertRow[] {
  const day = now.toISOString().slice(0, 10);
  const out: AlertRow[] = [];
  const add = (a: Omit<AlertRow, "dedupe_key">, key: string) => out.push({ ...a, dedupe_key: `${a.ticker ?? "MKT"}:${key}:${day}` });

  for (const a of analyses) {
    const q = a.quote;
    const chg = q?.change_pct ?? null;
    if (chg !== null) {
      const abs = Math.abs(chg);
      const level = abs >= 15 ? 15 : abs >= 10 ? 10 : abs >= 5 ? 5 : 0;
      if (level) {
        add({
          ticker: a.ticker, kind: `move_${level}`, severity: level >= 10 ? "HIGH" : "MEDIUM",
          title: `${a.ticker} ${chg > 0 ? "+" : ""}${chg.toFixed(1)}% no dia`,
          message: `Movimento superior a ${level}% ${q?.session === "EXTENDED" ? "(sessão estendida — pré/pós-mercado)" : "na sessão"}. Verifique notícias e eventos antes de qualquer decisão.`,
        }, `move${level}`);
      }
    }
    if (q?.price && q.week52_high && q.price >= q.week52_high * 0.999) {
      add({ ticker: a.ticker, kind: "new_high", severity: "LOW", title: `${a.ticker} em nova máxima de 52 semanas`, message: "Preço na máxima de 52 semanas. Evite perseguir o movimento sem mudança nas estimativas." }, "high");
    }
    for (const s of a.signals) {
      if (s.kind === "STALE_DATA" || s.kind === "ABOVE_MAX_WEIGHT") continue;
      add({ ticker: a.ticker, kind: s.kind.toLowerCase(), severity: s.severity, title: `${a.ticker}: ${s.title}`, message: s.message }, s.kind);
    }
    const t = a.trend;
    if (t.eps_rev_30d !== null && Math.abs(t.eps_rev_30d) >= 3) {
      add({ ticker: a.ticker, kind: "eps_revision", severity: Math.abs(t.eps_rev_30d) >= 6 ? "HIGH" : "MEDIUM", title: `${a.ticker}: EPS esperado revisado ${t.eps_rev_30d > 0 ? "+" : ""}${t.eps_rev_30d.toFixed(1)}% em 30 dias`, message: `Revisão de estimativa de lucro (${t.period}).` }, "eps");
    }
    if (t.revenue_rev_30d !== null && Math.abs(t.revenue_rev_30d) >= 2) {
      add({ ticker: a.ticker, kind: "revenue_revision", severity: "MEDIUM", title: `${a.ticker}: receita esperada revisada ${t.revenue_rev_30d > 0 ? "+" : ""}${t.revenue_rev_30d.toFixed(1)}% em 30 dias`, message: `Revisão de estimativa de receita (${t.period}).` }, "rev");
    }
    const c = a.consensus;
    if (c?.change_1m != null && Math.abs(c.change_1m) >= 0.08) {
      add({ ticker: a.ticker, kind: c.change_1m > 0 ? "upgrade" : "downgrade", severity: "MEDIUM", title: `${a.ticker}: consenso de analistas ${c.change_1m > 0 ? "melhorou" : "piorou"} no mês`, message: `${c.buy} buy / ${c.hold} hold / ${c.sell} sell. Consenso não é recomendação.` }, "consensus");
    }
    for (const n of a.news.filter((x) => x.impact === "CRITICAL").slice(0, 2)) {
      add({ ticker: a.ticker, kind: "critical_news", severity: "CRITICAL", title: `${a.ticker}: ${n.title}`, message: `${n.source} · ${n.category} · ${n.impact_reasons.join(", ")}` }, `news-${n.id.slice(-24)}`);
    }
  }
  return out;
}
