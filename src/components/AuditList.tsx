import type { AuditEntry } from "@/lib/data/audit";

const money = (cur: string, v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${cur} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Histórico das recomendações (spec §33): o que o painel viu e sugeriu em cada cálculo. */
export default function AuditList({ entries, cur }: { entries: AuditEntry[]; cur: "R$" | "US$" }) {
  if (!entries.length) return null;
  return (
    <details className="card">
      <summary className="small muted">Histórico das recomendações ({entries.length}) — para avaliar o painel depois</summary>
      <ul className="clean stack" style={{ marginTop: 10, gap: 10 }}>
        {entries.slice(0, 12).map((e) => (
          <li key={e.at} className="xsmall">
            <strong>{new Date(e.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</strong>
            {" "}· capital {money(cur, e.capital)} · investido {money(cur, e.invested)}{e.opportunityCash > 0 ? ` · caixa ${money(cur, e.opportunityCash)}` : ""}
            <div className="muted">
              {e.lines.filter((l) => l.amount > 0).map((l) => `${l.ticker} ${money(cur, l.amount)} (${l.priority.toLowerCase()}, preço ${money(cur, l.price)}${l.fair?.mid ? `, valor base ${money(cur, l.fair.mid)}` : ""}, confiança ${l.confidence.toLowerCase()})`).join(" · ") || "nenhum aporte sugerido"}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
