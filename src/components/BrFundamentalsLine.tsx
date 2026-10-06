import type { BrStanceView } from "@/lib/analysis/brStance";

const f2 = (v: number | null, d = 2) => (v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));

/** Indicadores usados na análise de um ativo da B3 (fonte e data visíveis). */
export default function BrFundamentalsLine({ v, error }: { v: BrStanceView; error?: string }) {
  const f = v.fundamentals;
  if (!f) return <p className="xsmall neg">Fundamentos indisponíveis{error ? ` (${error})` : ""} — sem faixa de valuation.</p>;
  const items = f.kind === "fii"
    ? [["P/VP", f2(f.pvp)], ["VP/cota", `R$ ${f2(f.vpa)}`], ["DY 12m", `${f2(f.dy, 1)}%`], ["Vacância", f.vacancy === null ? "—" : `${f2(f.vacancy, 1)}%`], ["Imóveis", f.properties === null ? "—" : String(f.properties)], ["Segmento", f.segment ?? "—"]]
    : [["P/L", f2(f.pl)], ["P/VP", f2(f.pvp)], ["DY 12m", `${f2(f.dy, 1)}%`], ["ROE", f.roe === null ? "—" : `${f2(f.roe, 1)}%`], ["LPA", f2(f.lpa)], ["VPA", f2(f.vpa)]];
  return (
    <div className="xsmall stack" style={{ gap: 4 }}>
      <div className="row-wrap">{items.map(([k, val]) => <span key={k} className="chip">{k}: <strong>{val}</strong></span>)}</div>
      {v.methods.length > 0 && <span className="muted">Métodos: {v.methods.map((m) => `${m.label} R$ ${f2(m.value)}`).join(" · ")}</span>}
      {v.qualityNotes.length > 0 && <span className="muted">Qualidade: {v.qualityNotes.join(" · ")}</span>}
      <span className="faint">Fonte: Fundamentus{f.asOf ? ` · balanço de ${f.asOf.split("-").reverse().join("/")}` : ""} · cotação brapi</span>
    </div>
  );
}
