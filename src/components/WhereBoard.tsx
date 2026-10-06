import type { Priority } from "@/lib/analysis/allocation";
import { ACTION_META, BAND_META, type ActionKey, type Stance } from "@/lib/analysis/stance";
import { n, pp } from "@/lib/format";
import HashOpener from "./HashOpener";
import { WeightBar } from "./sections";

export interface BoardRow {
  id: string;
  ticker: string;
  bucket: string;
  priority: Priority;
  stance: Stance | null;
  /** Peso hoje e meta, em % da carteira. */
  current: number | null;
  target: number;
  price: number | null;
  cur: "US$" | "R$";
  /** Motivo curto (por que recebe ou por que espera). */
  note: string;
  /** Valuation completo, aberto só quando a linha é expandida. */
  detail: React.ReactNode;
}

const ORDER: Record<Priority, number> = { ALTA: 0, "MÉDIA": 1, BAIXA: 2 };
const PRIORITY_LABEL: Record<Priority, string> = { ALTA: "Alta · oportunidade", "MÉDIA": "Média · aporte normal", BAIXA: "Baixa · esperar" };

/**
 * Prioridade de aporte a partir da postura de valuation (alta = oportunidade agora).
 * Ativo já na meta ou acima espera, mesmo barato: o aporte não concentra a carteira.
 */
export function priorityFromStance(a: ActionKey | null | undefined, current: number | null, target: number): Priority {
  if (current !== null && target > 0 && current >= target) return "BAIXA";
  return a === "comprar" || a === "recompra" ? "ALTA" : a === "manter" ? "MÉDIA" : "BAIXA";
}

const money = (cur: string, v: number) => `${cur} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Quando comprar: preço de entrada pelas faixas de valuation (não é previsão de preço). */
export function buyTiming(stance: Stance | null, price: number | null, cur: string): string | null {
  if (!stance || !price || stance.bands.length < 5 || stance.action === "legado") return null;
  const strong = stance.bands[0].high!, buy = stance.bands[1].high!;
  const fall = (to: number) => `${((1 - to / price) * 100).toFixed(0)}%`;
  if (stance.thesis === "deteriorada") return "Esperar a tese se confirmar antes de qualquer compra, mesmo com preço baixo.";
  if (price < buy) return price < strong
    ? `Agora: preço na faixa de compra forte (abaixo de ${money(cur, strong)}). Bom momento para aportar, em partes.`
    : `Agora: na faixa de compra (até ${money(cur, buy)}). Abaixo de ${money(cur, strong)} vira compra forte.`;
  return `Comprar abaixo de ${money(cur, buy)} (precisa cair ${fall(buy)}); compra forte abaixo de ${money(cur, strong)}.`;
}

/** Motivo curto para quem espera por estar na meta ou acima. */
export const overTarget = (current: number | null, target: number) => current !== null && target > 0 && current >= target;

/**
 * "Onde aportar": todos os ativos do radar numa lista só, com prioridade e
 * valuation. Cada linha abre o detalhe (faixas, fundamentos, tese) quando clicada.
 */
export default function WhereBoard({ rows }: { rows: BoardRow[] }) {
  const sorted = [...rows].sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || (a.stance?.premiumPct ?? 99) - (b.stance?.premiumPct ?? 99));
  if (!sorted.length) return <div className="card small faint">Nenhum ativo no radar. Adicione ativos em Estratégia.</div>;
  return (
    <div>
      <HashOpener />
      {sorted.map((r) => {
        const meta = r.stance ? ACTION_META[r.stance.action] : null;
        const gap = r.current !== null ? r.target - r.current : null;
        return (
          <details key={r.id} id={r.id} className="alloc-line where-line">
            <summary>
              <div className="where-top">
                <div><div className="ticker">{r.ticker}</div><div className="xsmall faint">{r.bucket}</div></div>
                <div className="row-wrap">
                  <span className={`badge ${r.priority === "ALTA" ? "badge-pos" : ""}`}>{PRIORITY_LABEL[r.priority]}</span>
                  {meta && <span className={`badge action-${meta.group}`}>{meta.emoji} {meta.label}</span>}
                  {r.stance?.band && <span className="xsmall muted">{BAND_META[r.stance.band].label}{r.stance.premiumPct !== null && ` (${r.stance.premiumPct >= 0 ? "+" : ""}${n(r.stance.premiumPct, 0)}%)`}</span>}
                </div>
                <div className="where-w">
                  <WeightBar current={r.current} target={r.target} />
                  <div className="xsmall muted num">{n(r.current, 1)}% → meta {n(r.target, 1)}%{gap !== null && <span className={gap < -1 ? " warn" : ""}> · {pp(gap, 1)}</span>}</div>
                </div>
              </div>
              <div className="xsmall muted where-note">{r.note}</div>
              {buyTiming(r.stance, r.price, r.cur) && <div className="xsmall where-note"><strong>Quando comprar:</strong> {buyTiming(r.stance, r.price, r.cur)}</div>}
            </summary>
            <div className="why">{r.detail}</div>
          </details>
        );
      })}
    </div>
  );
}
