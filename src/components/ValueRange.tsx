/**
 * Valor econômico como INTERVALO (spec §10): faixa estimada, margem de segurança,
 * cenários, confiança e premissas — dentro do detalhe do ativo, nunca como número mágico.
 * Separa FATO (preço) de INTERPRETAÇÃO (valor estimado) — spec §17.
 */
const money = (cur: string, v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${cur} ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ValueRange({ cur, price, low, mid, high, scenarios, methods, confidence, note }: {
  cur: "US$" | "R$";
  price: number | null;
  low: number | null; mid: number | null; high: number | null;
  scenarios?: { pessimist: number; base: number; optimist: number } | null;
  methods: { label: string; value: number }[];
  confidence: "Alta" | "Média" | "Baixa";
  note?: string | null;
}) {
  if (mid === null) {
    return <p className="xsmall muted">Valor econômico: <strong>dados insuficientes</strong>{note ? ` — ${note}` : ""}. O painel prefere não estimar a inventar precisão.</p>;
  }
  const margin = price ? (1 - price / mid) * 100 : null;
  return (
    <div className="xsmall stack value-range" style={{ gap: 4 }}>
      <div><span className="muted">Fato:</span> preço {money(cur, price)}</div>
      <div>
        <span className="muted">Interpretação:</span> valor econômico estimado entre <strong>{money(cur, low)}</strong> e <strong>{money(cur, high)}</strong> (base {money(cur, mid)})
        {margin !== null && <> · margem de segurança <strong className={margin >= 0 ? "pos" : "neg"}>{margin >= 0 ? "" : "−"}{Math.abs(margin).toFixed(0)}%</strong>{margin < 0 ? " (preço acima da base)" : ""}</>}
        {" "}· confiança <strong>{confidence}</strong>
      </div>
      {scenarios && <div className="muted">Cenários do fluxo de caixa: pessimista {money(cur, scenarios.pessimist)} · base {money(cur, scenarios.base)} · otimista {money(cur, scenarios.optimist)}</div>}
      {methods.length > 0 && (
        <details>
          <summary className="muted">Premissas</summary>
          <ul className="clean" style={{ marginTop: 4 }}>{methods.map((m) => <li key={m.label}>{m.label}: {money(cur, m.value)}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
