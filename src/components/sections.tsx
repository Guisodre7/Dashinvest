import Link from "next/link";
import type { AllocationResult } from "@/lib/analysis/allocation";
import type { AssetAnalysis } from "@/lib/analysis/analyze";
import type { MacroDriverImpact, RegimeReading } from "@/lib/analysis/macro";
import type { AlertRow } from "@/lib/db/repo";
import { ago, brl, dateBr, n, pct, pp, tone, usd } from "@/lib/format";
import type { MacroIndicator, MarketEvent } from "@/lib/market/types";
import type { PortfolioSummary } from "@/lib/portfolio/calc";
import { LiveChange, LiveFreshness, LivePrice } from "./LiveQuotes";

const assetHref = (t: string) => `/ativo/${encodeURIComponent(t)}`;

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="score faint">—</span>;
  const cls = score >= 62 ? "badge-pos" : score <= 40 ? "badge-neg" : "";
  return <span className={`score ${cls}`}>{n(score, 0)}</span>;
}

export function WeightBar({ current, target }: { current: number | null; target: number }) {
  const scale = Math.max(25, (current ?? 0) * 1.2, target * 1.2);
  return (
    <div className="weightbar" title={`Atual ${n(current, 2)}% · alvo ${n(target, 2)}%`}>
      <span className="cur" style={{ width: `${Math.min(100, ((current ?? 0) / scale) * 100)}%` }} />
      {target > 0 && <span className="tgt" style={{ left: `${(target / scale) * 100}%` }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onde aportar
// ---------------------------------------------------------------------------

export function WhereToInvest({ preview, analyses }: { preview: AllocationResult; analyses: AssetAnalysis[] }) {
  const byTicker = new Map(analyses.map((a) => [a.ticker, a]));
  if (preview.blocked) {
    return <div className="banner banner-neg">{preview.blockReasons.join(" ")}</div>;
  }
  return (
    <>
    <ul className="m-list only-mobile" aria-label="Onde aportar">
      {preview.lines.map((l) => {
        const a = byTicker.get(l.ticker)!;
        const signal = a.signals.find((s) => s.kind !== "STALE_DATA");
        return (
          <li key={l.ticker}>
            <Link href={assetHref(l.ticker)} className="m-row">
              <div className="m-row-top">
                <div className="m-id"><span className="ticker">{l.ticker}</span><span className="xsmall faint">{l.bucket}</span></div>
                <div className="m-right">
                  <span className={`badge ${l.priority === "ALTA" ? "badge-pos" : ""}`}>{l.priority}</span>
                  <ScoreBadge score={l.opportunityScore} />
                </div>
              </div>
              <div className="m-row-mid">
                <WeightBar current={l.currentWeight} target={l.targetWeight} />
                <span className={`num small ${l.gap < -1 ? "warn" : ""}`}>{pp(l.gap)}</span>
              </div>
              <div className="m-row-sub xsmall">
                <span className="muted num">{n(l.currentWeight, 1)}% → alvo {n(l.targetWeight, 1)}% · {l.action.toLowerCase()} · confiança {l.confidence.toLowerCase()}</span>
                {a.dataQuality.criticalStale && <span className="neg"> · cotação desatualizada</span>}
              </div>
              {signal && <div className={`m-row-sub xsmall ${signal.tone === "positive" ? "pos" : signal.tone === "negative" ? "neg" : "muted"}`}>{signal.title}</div>}
            </Link>
          </li>
        );
      })}
    </ul>
    <div className="table-wrap only-desktop">
      <table>
        <thead>
          <tr><th>Ativo</th><th>Prioridade</th><th className="num">Score</th><th>Peso atual → alvo</th><th className="num">Desvio</th><th>Sinais</th><th>Confiança</th></tr>
        </thead>
        <tbody>
          {preview.lines.map((l) => {
            const a = byTicker.get(l.ticker)!;
            const signals = a.signals.filter((s) => s.kind !== "STALE_DATA");
            return (
              <tr key={l.ticker}>
                <td className="cell-main"><Link href={assetHref(l.ticker)} className="ticker">{l.ticker}</Link><div className="xsmall faint">{l.bucket}</div></td>
                <td data-label="Prioridade"><span className={`badge ${l.priority === "ALTA" ? "badge-pos" : ""}`}>{l.priority}</span> <span className="xsmall muted">{l.action}</span></td>
                <td data-label="Score" className="num"><ScoreBadge score={l.opportunityScore} /></td>
                <td data-label="Peso atual → alvo" className="cell-full m-o1" style={{ minWidth: 140 }}><WeightBar current={l.currentWeight} target={l.targetWeight} /><div className="xsmall muted num">{n(l.currentWeight, 2)}% → {n(l.targetWeight, 2)}%</div></td>
                <td data-label="Desvio" className={`num ${l.gap > 1 ? "" : l.gap < -1 ? "warn" : ""}`}>{pp(l.gap)}</td>
                <td data-label="Sinais" className="m-span2 m-o2 small">{signals.length ? signals.slice(0, 2).map((s) => <div key={s.kind} className={s.tone === "positive" ? "pos" : s.tone === "negative" ? "neg" : "muted"}>{s.title}</div>) : <span className="faint">—</span>}</td>
                <td data-label="Confiança" className="m-o2 small">{l.confidence}{a.dataQuality.criticalStale && <div className="neg xsmall">cotação desatualizada</div>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

export function AlertsList({ alerts, extra }: { alerts: AlertRow[]; extra: { severity: AlertRow["severity"]; title: string; message: string }[] }) {
  const all = [...extra.map((e, i) => ({ ...e, dedupe_key: `extra-${i}`, ticker: null, kind: "system", created_at: undefined as string | undefined })), ...alerts];
  if (!all.length) return <div className="card empty">Nenhum alerta relevante no momento.</div>;
  return (
    <div className="card" style={{ padding: 0 }}>
      {all.slice(0, 14).map((a) => (
        <div key={a.dedupe_key} className="alert">
          <span className={`sev sev-${a.severity}`}>{a.severity}</span>
          <div>
            <div className="small"><strong>{a.title}</strong></div>
            <div className="xsmall muted">{a.message}</div>
          </div>
          <div className="xsmall faint nowrap">{a.ticker ? <Link href={assetHref(a.ticker)}>{a.ticker}</Link> : null}{a.created_at ? ` · ${ago(a.created_at)}` : ""}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carteira
// ---------------------------------------------------------------------------

export function PortfolioTable({ portfolio }: { portfolio: PortfolioSummary }) {
  return (
    <>
    <ul className="m-list only-mobile" aria-label="Carteira">
      {portfolio.positions.map((p) => (
        <li key={p.ticker}>
          <Link href={assetHref(p.ticker)} className="m-row">
            <div className="m-row-top">
              <div className="m-id">
                <span className="ticker">{p.ticker}</span>
                <span className="xsmall faint">{p.isLegacy ? p.legacyLabel ?? "Legado" : p.bucket}</span>
              </div>
              <div className="m-right m-col">
                <span className="num" style={{ fontWeight: 600 }}>{p.quantity ? usd(p.valueUsd) : "—"}</span>
                {p.quantity > 0 && <span className={`num xsmall ${tone(p.pnlUsd)}`}>{p.pnlUsd !== null && p.pnlUsd >= 0 ? "+" : ""}{n(p.pnlUsd)} ({pct(p.assetReturn, 1, true)})</span>}
              </div>
            </div>
            <div className="m-row-sub small">
              <span className="muted">US$ </span><LivePrice ticker={p.ticker} fallback={p.price} /> <LiveChange ticker={p.ticker} />
              {p.quantity > 0 && <span className="faint xsmall"> · {n(p.quantity, 4)} cotas</span>}
            </div>
            {p.isLegacy ? (
              <div className="m-row-sub xsmall muted">{n(p.weightTotal, 1)}% do total · sem aportes</div>
            ) : (
              <div className="m-row-mid">
                <WeightBar current={p.weightStrategic} target={p.targetWeight} />
                <span className="num xsmall muted">{n(p.weightStrategic, 1)}% / {n(p.targetWeight, 1)}%</span>
              </div>
            )}
            {p.quantity > 0 && (p.fxReturn !== null || p.dividendsUsd > 0) && (
              <div className="m-row-sub xsmall muted">
                câmbio <span className={tone(p.fxReturn)}>{pct(p.fxReturn, 1, true)}</span> · total BRL <span className={tone(p.totalReturnBrl)}>{pct(p.totalReturnBrl, 1, true)}</span>
                {p.dividendsUsd > 0 && <> · proventos {usd(p.dividendsUsd)}</>}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
    <div className="table-wrap only-desktop">
      <table>
        <thead>
          <tr>
            <th>Ativo</th><th className="num">Preço</th><th className="num">Dia</th><th className="num">Qtd.</th><th className="num">Preço médio</th>
            <th className="num">Valor (US$)</th><th className="num">L/P (US$)</th><th className="num">Ret. ativo</th><th className="num">Ret. câmbio</th>
            <th className="num">Ret. total BRL</th><th className="num">Proventos</th><th>Peso atual / alvo</th><th className="num">Desvio</th><th>Dados</th>
          </tr>
        </thead>
        <tbody>
          {portfolio.positions.map((p) => (
            <tr key={p.ticker}>
              <td className="cell-main">
                <Link href={assetHref(p.ticker)} className="ticker">{p.ticker}</Link>
                <div className="xsmall faint">{p.isLegacy ? p.legacyLabel ?? "Legado" : p.bucket}</div>
              </td>
              <td data-label="Preço" className="num"><LivePrice ticker={p.ticker} fallback={p.price} /></td>
              <td data-label="Dia" className="num"><LiveChange ticker={p.ticker} /></td>
              <td data-label="Qtd." className="num">{p.quantity ? n(p.quantity, 4) : "—"}</td>
              <td data-label="Preço médio" className="num">{p.quantity ? n(p.avgPrice) : "—"}</td>
              <td data-label="Valor (US$)" className="num">{n(p.valueUsd)}</td>
              <td data-label="L/P (US$)" className={`num ${tone(p.pnlUsd)}`}>{p.quantity ? n(p.pnlUsd) : "—"}</td>
              <td data-label="Ret. ativo" className={`num ${tone(p.assetReturn)}`}>{pct(p.assetReturn, 1, true)}</td>
              <td data-label="Ret. câmbio" className={`num ${tone(p.fxReturn)}`}>{pct(p.fxReturn, 1, true)}</td>
              <td data-label="Ret. total BRL" className={`num ${tone(p.totalReturnBrl)}`}>{pct(p.totalReturnBrl, 1, true)}</td>
              <td data-label="Proventos" className="num m-o1">{p.dividendsUsd ? n(p.dividendsUsd) : "—"}</td>
              <td className="cell-full m-o2" data-label="Peso atual / alvo" style={{ minWidth: 150 }}>
                {p.isLegacy
                  ? <span className="xsmall muted">{n(p.weightTotal, 2)}% do total · sem aportes</span>
                  : <><WeightBar current={p.weightStrategic} target={p.targetWeight} /><div className="xsmall muted num">{n(p.weightStrategic, 2)}% / {n(p.targetWeight, 2)}%</div></>}
              </td>
              <td data-label="Desvio" className="num m-o1">{p.isLegacy ? "—" : pp(p.gap)}</td>
              <td className="cell-full m-o3" data-label="Dados"><LiveFreshness ticker={p.ticker} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Radar
// ---------------------------------------------------------------------------

const DIR: Record<string, string> = { rising: "↑ subindo", stable: "→ estáveis", falling: "↓ caindo", unknown: "sem histórico" };

export function RadarTable({ analyses }: { analyses: AssetAnalysis[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ativo</th><th className="num">P/L</th><th className="num">P/L fwd</th><th className="num">P/L vs 5a</th><th className="num">vs fair value</th>
            <th className="num">Qualidade</th><th>Estimativas EPS</th><th className="num">1M</th><th className="num">3M</th><th className="num">RSI</th>
            <th>Analistas</th><th className="num">Alvo vs preço</th><th className="num">DD 52s</th><th>Zona</th>
          </tr>
        </thead>
        <tbody>
          {analyses.map((a) => (
            <tr key={a.ticker}>
              <td><Link href={assetHref(a.ticker)} className="ticker">{a.ticker}</Link></td>
              <td className="num">{n(a.valuation.pe, 1)}</td>
              <td className="num">{n(a.valuation.forward_pe, 1)}</td>
              <td className="num">{pct(a.valuation.pe_vs_5y, 0, true)}</td>
              <td className="num">{a.fairValue.available ? pct(a.fairValue.discount_pct, 1, true) : <span className="faint" title={a.fairValue.reason ?? ""}>indisp.</span>}</td>
              <td className="num">{a.quality?.score != null ? n(a.quality.score, 0) : "—"}</td>
              <td className={`small ${a.trend.direction === "falling" ? "neg" : a.trend.direction === "rising" ? "pos" : "muted"}`}>
                {DIR[a.trend.direction]}{(a.trend.eps_rev_30d !== null || a.trend.eps_rev_90d !== null) && <div className="xsmall faint">30d {pct(a.trend.eps_rev_30d, 1, true)} · 90d {pct(a.trend.eps_rev_90d, 1, true)}</div>}
              </td>
              <td className={`num ${tone(a.momentum?.ret_1m, 5)}`}>{pct(a.momentum?.ret_1m, 1, true)}</td>
              <td className={`num ${tone(a.momentum?.ret_3m, 10)}`}>{pct(a.momentum?.ret_3m, 1, true)}</td>
              <td className="num">{n(a.momentum?.rsi14, 0)}</td>
              <td className="small">{a.consensus ? `${a.consensus.buy}/${a.consensus.hold}/${a.consensus.sell}` : "—"}{a.consensus?.change_3m != null && <span className="faint"> Δ3m {pp(a.consensus.change_3m * 100, 0)}</span>}</td>
              <td className="num">{pct(a.consensus?.target_upside, 1, true)}</td>
              <td className="num">{pct(a.drawdown?.from_52w_high, 1)}{a.drawdown?.band && <div className="xsmall faint">{a.drawdown.band}</div>}</td>
              <td>{a.zones.current ? <span className={`badge ${a.zones.current === "A" ? "badge-pos" : a.zones.current === "D" ? "badge-warn" : ""}`} title={a.zones.note}>Zona {a.zones.current}</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="xsmall faint" style={{ padding: "8px 12px" }}>Analistas: buy/hold/sell. Consenso e preço-alvo não são recomendação. Fair value é estimativa com faixa de incerteza.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Macro
// ---------------------------------------------------------------------------

export function MacroPanel({ macro, regime, impacts, events }: { macro: MacroIndicator[]; regime: RegimeReading[]; impacts: MacroDriverImpact[]; events: MarketEvent[] }) {
  const order: MacroIndicator["key"][] = ["SPX", "NDX", "DJI", "VIX", "US10Y", "FEDFUNDS", "DXY", "USDBRL"];
  const sorted = order.map((k) => macro.find((m) => m.key === k)).filter((m): m is MacroIndicator => !!m);
  return (
    <div className="stack">
      <div className="grid grid-4">
        {sorted.map((m) => (
          <div key={m.key} className="card card-tight">
            <div className="kpi-label">{m.label}{m.proxy && <span title={`Valor do ETF ${m.proxy} usado como substituto do índice`}> · via {m.proxy}</span>}</div>
            <div className="kpi-value num" style={{ fontSize: 18 }}>
              {m.value === null ? <span className="faint small">Indisponível</span> : m.unit === "percent" ? `${n(m.value, 2)}%` : n(m.value, m.unit === "rate" ? 4 : 2)}
            </div>
            <div className="kpi-sub num">
              {m.change_pct !== null ? <span className={tone(m.change_pct, 1)}>{pct(m.change_pct, 2, true)} dia</span> : m.change !== null && m.unit === "percent" ? `${m.change >= 0 ? "+" : ""}${n(m.change * 100, 0)} bps dia` : ""}
              {m.change_1m !== null && <span className="faint"> · 1M {m.unit === "percent" ? `${m.change_1m >= 0 ? "+" : ""}${n(m.change_1m * 100, 0)} bps` : pct(m.change_1m, 1, true)}</span>}
            </div>
            <div className="xsmall faint">{m.meta ? `${m.meta.source} · ${ago(m.meta.timestamp)}${m.meta.is_realtime ? "" : " · não-realtime"}` : m.key === "VIX" ? "Requer fornecedor com dados de índices" : "sem dado"}</div>
          </div>
        ))}
      </div>
      {regime.length > 0 && (
        <div className="row-wrap">
          {regime.map((r) => <span key={r.key} className={`badge ${r.tone === "negative" ? "badge-warn" : r.tone === "positive" ? "badge-accent" : ""}`} title={r.basis}>{r.label}</span>)}
          <span className="xsmall faint">Leituras descritivas do momento — não são previsões.</span>
        </div>
      )}
      {impacts.length > 0 && (
        <div className="grid grid-2">
          {impacts.map((d) => (
            <div key={d.driver} className="card">
              <h3>{d.driver} — possível impacto</h3>
              <dl className="stack" style={{ gap: 6, margin: 0 }}>
                {d.impacts.map((i) => (
                  <div key={i.ticker} className="small"><strong>{i.ticker}</strong> <span className="muted">→ {i.direction}.</span> <span className="muted">{i.mechanism}</span></div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
      {events.length > 0 && (
        <div className="small muted">Calendário macro: {events.map((e) => `${e.title} em ${dateBr(e.date)}`).join(" · ")} <span className="faint">({events[0].source})</span></div>
      )}
    </div>
  );
}

export function Kpi({ label, value, sub, cls }: { label: string; value: React.ReactNode; sub?: React.ReactNode; cls?: string }) {
  return (
    <div className="card card-tight">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value num ${cls ?? ""}`}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export { usd, brl };
