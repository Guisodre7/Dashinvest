import Link from "next/link";
import { ACTION_META, type Stance } from "@/lib/analysis/stance";
import { buyTiming } from "./WhereBoard";

const money = (cur: string, v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "—" : `${cur} ${v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const qty = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

export interface SummaryAsset { stance: Stance; price: number | null; href: string }

/**
 * Venda parcial: só quando o preço está bem acima do valor justo da análise.
 * Peso acima da meta, sozinho, nunca gera venda (o aporte corrige).
 */
export function SellCard({ items, cur }: { items: SummaryAsset[]; cur: "US$" | "R$" }) {
  const sells = items.filter((x) => (x.stance.action === "realizacao" || x.stance.action === "reduzir") && x.stance.realization?.efficient && x.price);
  return (
    <div className="card stack">
      <h3>Venda parcial sugerida</h3>
      {sells.length === 0 ? (
        <p className="small faint">Nenhuma venda: nenhum ativo seu está muito acima do valor justo. Peso acima da meta não gera venda — os próximos aportes corrigem.</p>
      ) : (
        <ul className="clean stack" style={{ gap: 10 }}>
          {sells.map(({ stance: s, price, href }) => {
            const r = s.realization!;
            const fair = s.premiumPct !== null && price ? price / (1 + s.premiumPct / 100) : null;
            return (
              <li key={s.ticker} className="sell-item">
                <div className="row-between">
                  <Link href={href} className="ticker">{s.ticker}</Link>
                  <span className={`badge action-${ACTION_META[s.action].group}`}><i className="sdot" />{ACTION_META[s.action].label}</span>
                </div>
                <p className="small" style={{ margin: "4px 0" }}>
                  Vender <strong>{qty(r.sharesLow)}–{qty(r.sharesHigh)} cotas</strong>, que representam <strong>{r.pctLow}–{r.pctHigh}% da posição</strong> (≈ {money(cur, r.valueLow)}–{money(cur, r.valueHigh)}),
                  pois o preço de {money(cur, price)} está <strong>{s.premiumPct?.toFixed(0)}% acima</strong> do valor justo pela análise ({money(cur, fair)}).
                </p>
                <div className="xsmall muted">Imposto estimado {money(cur, r.estTax)} + custos {money(cur, r.fees)} · a maior parte da posição continua. Recompra em degraus se o preço voltar para a faixa justa.</div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="xsmall faint">Faixa para avaliar, não ordem. A decisão é sua.</p>
    </div>
  );
}

/** Compras: oportunidades pelo valuation, com o momento de compra de cada uma. */
export function BuyCard({ items, cur, href }: { items: SummaryAsset[]; cur: "US$" | "R$"; href: string }) {
  const buys = items.filter((x) => x.stance.action === "comprar" || x.stance.action === "recompra")
    .sort((a, b) => (a.stance.premiumPct ?? 0) - (b.stance.premiumPct ?? 0));
  const waiting = items.filter((x) => ["nao_aumentar", "realizacao", "reduzir", "evitar"].includes(x.stance.action) && buyTiming(x.stance, x.price, cur));
  return (
    <div className="card stack">
      <div className="row-between"><h3>Oportunidades de compra</h3><Link href={href} scroll={false} className="small">Aporte e valuation →</Link></div>
      {buys.length === 0 ? <p className="small faint">Nenhum ativo na faixa de compra agora.</p> : (
        <ul className="decision-list">
          {buys.slice(0, 5).map(({ stance: s, price, href: h }) => (
            <li key={s.ticker}>
              <Link href={h} className="ticker">{s.ticker}</Link>
              <span className="xsmall muted">{buyTiming(s, price, cur)}</span>
            </li>
          ))}
        </ul>
      )}
      {waiting.length > 0 && (
        <details className="small">
          <summary className="muted">Esperando preço ({waiting.length})</summary>
          <ul className="clean xsmall muted" style={{ marginTop: 6 }}>
            {waiting.map(({ stance: s, price }) => <li key={s.ticker}><strong>{s.ticker}</strong>: {buyTiming(s, price, cur)}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
