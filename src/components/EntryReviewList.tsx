import { reviewEntry } from "@/lib/thesis/logic";
import type { StanceSnap } from "@/lib/data/stances";
import type { Stance } from "@/lib/analysis/stance";

const f = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** "Eu comprei a esse preço. Foi uma boa entrada com o que se sabia na época?" */
export default function EntryReviewList({ buys, now, cur }: {
  buys: { date: string; price: number; quantity: number | null; snap: StanceSnap | null; ticker?: string; now?: { price: number | null; band: Stance["band"]; thesis: Stance["thesis"] } }[];
  now?: { price: number | null; band: Stance["band"]; thesis: Stance["thesis"] };
  cur: string;
}) {
  if (!buys.length) return null;
  return (
    <div className="card stack">
      <h3>Minhas compras — foi uma boa entrada?</h3>
      <p className="xsmall faint">Julgada pelo que se sabia na data (valuation, qualidade e tese daquele dia), não pelo que o preço fez depois.</p>
      <ul className="m-list">
        {buys.slice(0, 12).map((b, i) => {
          const r = reviewEntry({ date: b.date, price: b.price }, b.snap ? { band: b.snap.b, quality: b.snap.q, thesis: b.snap.t, fair: b.snap.f } : null, b.now ?? now ?? { price: null, band: null, thesis: "não verificável" });
          const tone = r.decision === "Boa decisão" ? "pos" : r.decision === "Decisão arriscada" ? "neg" : "";
          return (
            <li key={i} className="m-row">
              <div className="row-between"><span className="small">{b.ticker ? <strong>{b.ticker} · </strong> : null}{b.date.split("-").reverse().join("/")} · {b.quantity ? `${f(b.quantity, 4)} × ` : ""}{cur} {f(b.price)}</span><strong className={`small ${tone}`}>{r.decision}</strong></div>
              <div className="xsmall muted">{r.decisionWhy}</div>
              <div className="xsmall">Depois: {r.outcome}</div>
              {r.lesson && <div className="xsmall"><strong>Leitura:</strong> {r.lesson}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
