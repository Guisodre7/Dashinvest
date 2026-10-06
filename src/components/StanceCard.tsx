import Link from "next/link";
import { ACTION_META, BAND_META, type Stance } from "@/lib/analysis/stance";

const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));

/** Faixas de valuation em barra, com a posição do preço atual. */
export function BandBar({ s, price, cur }: { s: Stance; price: number | null; cur: string }) {
  if (!s.bands.length || !price) return null;
  const lo = (s.bands[0].high ?? price) * 0.85, hi = (s.bands[4].low ?? price) * 1.15;
  const min = Math.min(lo, price * 0.97), max = Math.max(hi, price * 1.03);
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
  return (
    <div className="bandbar-wrap">
      <div className="bandbar" role="img" aria-label={`Preço ${cur} ${fmt(price)} na faixa ${s.band ? BAND_META[s.band].label : "—"}`}>
        {s.bands.map((b) => (
          <span key={b.key} className={`band band-${b.key}${s.band === b.key ? " is-current" : ""}`}
            style={{ left: pos(b.low ?? min), width: `calc(${pos(b.high ?? max)} - ${pos(b.low ?? min)})` }} title={BAND_META[b.key].label} />
        ))}
        <span className="band-price" style={{ left: pos(price) }} />
      </div>
      <div className="band-legend xsmall">
        {s.bands.map((b) => (
          <span key={b.key} className={s.band === b.key ? "strong" : "faint"}>
            {BAND_META[b.key].emoji} {BAND_META[b.key].label}: {b.low === null ? `< ${cur} ${fmt(b.high)}` : b.high === null ? `> ${cur} ${fmt(b.low)}` : `${cur} ${fmt(b.low)}–${fmt(b.high)}`}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function StanceCard({ s, price, cur = "US$", name, compact = false, position, href, children }: {
  s: Stance; price: number | null; cur?: string; name?: string; compact?: boolean; href?: string; children?: React.ReactNode;
  position?: { quantity: number; avgCost: number; value: number | null; realized: number } | null;
}) {
  const meta = ACTION_META[s.action];
  return (
    <div className="card stack stance" id={compact ? (href?.includes("#") ? href.split("#")[1] : undefined) : "realizacao"}>
      <div className="row-between">
        <div>
          <strong>{compact ? <Link href={href ?? `/ativo/${encodeURIComponent(s.ticker)}#realizacao`}>{s.ticker}</Link> : "Valuation e decisão"}</strong>
          {name && <span className="xsmall faint"> · {name}</span>}
        </div>
        <span className={`badge action-${meta.group}`}>{meta.emoji} {meta.label}</span>
      </div>
      <div className="row-wrap xsmall">
        <span className="chip">Qualidade: <strong>{s.quality}</strong></span>
        <span className="chip">Valor: <strong>{s.band ? BAND_META[s.band].label : "sem faixa"}</strong>{s.premiumPct !== null && ` (${s.premiumPct >= 0 ? "+" : ""}${fmt(s.premiumPct, 1)}%)`}</span>
        <span className="chip">Tese: <strong>{s.thesis}</strong></span>
        {s.rally && <span className={`chip ${s.rally === "justificada" ? "pos" : "neg"}`}>{s.rally === "justificada" ? "🟢 Alta acompanhada pelos fundamentos" : "⚠️ Alta por expectativa"}</span>}
      </div>
      <p className="small">{s.headline}</p>
      <BandBar s={s} price={price} cur={cur} />
      {children}
      {!compact && <ul className="clean xsmall muted">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}

      {!compact && position && position.quantity > 0 && (
        <dl className="bell-stats small">
          <dt>Preço médio</dt><dd>{cur} {fmt(position.avgCost)}</dd>
          <dt>Valor da posição</dt><dd>{cur} {fmt(position.value)}</dd>
          <dt>Lucro não realizado (no papel)</dt><dd className={(position.value ?? 0) - position.quantity * position.avgCost >= 0 ? "pos" : "neg"}>{cur} {fmt(position.value === null ? null : position.value - position.quantity * position.avgCost)}</dd>
          <dt>Lucro realizado (vendas)</dt><dd className={position.realized >= 0 ? "pos" : "neg"}>{cur} {fmt(position.realized)}</dd>
          <dt>Custo histórico</dt><dd>{cur} {fmt(position.quantity * position.avgCost)}</dd>
        </dl>
      )}

      {s.realization && s.action !== "nao_aumentar" && (
        <div className="callout">
          <strong>Faixa sugerida para avaliação: {s.realization.pctLow}%–{s.realization.pctHigh}% da posição</strong>
          <div className="small">≈ {fmt(s.realization.sharesLow, 4)}–{fmt(s.realization.sharesHigh, 4)} cotas · {cur} {fmt(s.realization.valueLow)}–{fmt(s.realization.valueHigh)}</div>
          <div className="xsmall muted">Ganho estimado na parte vendida: {cur} {fmt(s.realization.estGain)} · imposto estimado {cur} {fmt(s.realization.estTax)} · custos {cur} {fmt(s.realization.fees)}</div>
          <div className="xsmall faint">Objetivo: reduzir exposição com preço esticado, preservar capital para recomprar, rebalancear ou aportar em ativos mais baratos — mantendo a maior parte da posição se a alta continuar. {s.realization.note}</div>
        </div>
      )}

      {s.rebuy && (
        <div className="callout">
          <strong>{s.action === "recompra" ? "🟢 Recompra potencial" : "Venda anterior"}</strong>
          <div className="small">Vendeu {fmt(s.rebuy.soldQty, 4)} cotas a {cur} {fmt(s.rebuy.sellPrice)} em {s.rebuy.sellDate.split("-").reverse().join("/")} · preço atual {fmt(s.rebuy.dropFromSellPct, 1)}% em relação à venda</div>
          <ul className="clean xsmall">
            {s.rebuy.ladder.map((l) => (
              <li key={l.label}>{l.label}: {l.low === null ? `< ${cur} ${fmt(l.high)}` : l.high === null ? `> ${cur} ${fmt(l.low)}` : `${cur} ${fmt(l.low)}–${fmt(l.high)}`}{l.pctOfSold ? ` → recomprar ~${l.pctOfSold}% do vendido` : ""}</li>
            ))}
          </ul>
          {s.action === "recompra" && s.rebuy.impact.qty > 0 && (
            <div className="xsmall muted">Impacto na faixa atual: +{fmt(s.rebuy.impact.qty, 4)} cotas por ~{cur} {fmt(s.rebuy.impact.cost)}{s.rebuy.impact.newAvg !== null ? ` · novo preço médio ≈ ${cur} ${fmt(s.rebuy.impact.newAvg)}` : ""}. Recompras em degraus evitam tentar acertar o fundo.</div>
          )}
        </div>
      )}
      <p className="xsmall faint">Faixas calculadas a partir do valor justo estimado (intervalo, não número exato). Não é previsão nem ordem — a decisão é sua.</p>
    </div>
  );
}
