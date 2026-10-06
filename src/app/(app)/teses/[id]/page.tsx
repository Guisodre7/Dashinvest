import Link from "next/link";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { BAND_META } from "@/lib/analysis/stance";
import { loadDecision } from "@/lib/data/decision";
import { getRepo } from "@/lib/db/repo";
import { getTheses } from "@/lib/data/theses";
import { reviewThesis, setThesisStatus } from "../actions";

const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));

export default async function ThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const t = (await getTheses(await getRepo(user.id))).find((x) => x.id === id);
  if (!t) notFound();
  const d = await loadDecision(user, t.market, t.ticker, null);
  const cur = t.market === "BR" ? "R$" : "US$";
  const change = t.price && d.price ? (d.price / t.price - 1) * 100 : null;
  const last = t.reviews[0];
  const assetHref = t.market === "US" ? `/ativo/${encodeURIComponent(t.ticker)}#realizacao` : `/brasil?aba=aporte#br-${t.ticker}`;

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero">
        <div>
          <div className="hero-title"><Link href="/teses">Minhas teses</Link> / {t.market === "BR" ? "🇧🇷" : "🇺🇸"}</div>
          <h1>{t.ticker}</h1>
          <p className="small muted">Escrita em {new Date(t.created_at).toLocaleDateString("pt-BR")}{t.horizon ? ` · horizonte ${t.horizon}` : ""}{t.status === "encerrada" ? " · encerrada" : ""}</p>
        </div>
        <div className="row-wrap">
          <Link className="btn btn-sm" href={`/analisar?mercado=${t.market}&ativo=${t.ticker}`}>Analisar compra</Link>
          <form action={setThesisStatus}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={t.status === "ativa" ? "encerrada" : "ativa"} /><button className="btn btn-ghost btn-sm">{t.status === "ativa" ? "Encerrar tese" : "Reabrir"}</button></form>
        </div>
      </section>

      <section className="section grid grid-2">
        <div className="card stack">
          <div className="kpi-label">O que eu acreditava</div>
          <p className="small">{t.text}</p>
          <ul className="clean small">{t.premises.map((p) => <li key={p}>{p}</li>)}</ul>
          {t.expectation && <p className="small"><strong>Expectativa:</strong> {t.expectation}</p>}
          {t.risks.length > 0 && <p className="small"><strong>Riscos mapeados:</strong> {t.risks.join("; ")}</p>}
          {t.changeMyMind && <p className="small"><strong>Mudaria de ideia se:</strong> {t.changeMyMind}</p>}
          <p className="xsmall faint">Na data: preço {cur} {f(t.price)}{t.band ? ` · valuation ${BAND_META[t.band]?.label.toLowerCase() ?? t.band}` : ""}{t.quality ? ` · qualidade ${t.quality}` : ""}</p>
        </div>
        <div className="card stack">
          <div className="kpi-label">O que os dados mostram hoje</div>
          {d.notFound ? <p className="small neg">{d.notFound}</p> : (
            <dl className="bell-stats small">
              <dt>Preço</dt><dd>{cur} {f(d.price)}{change !== null ? ` (${change >= 0 ? "+" : ""}${f(change, 1)}%)` : ""}</dd>
              <dt>Valuation</dt><dd>{d.stance.band ? BAND_META[d.stance.band].label : "sem faixa"}</dd>
              <dt>Qualidade</dt><dd>{d.stance.quality}</dd>
              <dt>Fundamentos/tese</dt><dd>{d.stance.thesis}</dd>
            </dl>
          )}
          {d.risks.length > 0 && <ul className="clean small">{d.risks.map((r) => <li key={r}>{r}</li>)}</ul>}
          {d.news.length > 0 && <p className="xsmall muted">Notícias recentes: {d.news.slice(0, 3).map((n) => `${n.title} (${n.source}, ${new Date(n.date).toLocaleDateString("pt-BR")})`).join(" · ")}</p>}
          <Link href={assetHref} className="xsmall">Análise completa →</Link>
          <p className="xsmall faint">O preço sozinho não confirma nem derruba uma tese: o que importa é se as premissas continuam verdadeiras.</p>
        </div>
      </section>

      <section className="section card stack">
        <h3>Revisar premissas</h3>
        <ActionForm action={reviewThesis} submitLabel="Salvar revisão">
          <input type="hidden" name="id" value={t.id} /><input type="hidden" name="price" value={d.price ?? ""} />
          {t.premises.map((p, i) => (
            <label key={i} className="span-2">{p}
              <select name={`p${i}`} defaultValue={last?.statuses[i] ?? "sem avaliação"}>
                <option value="mantida">✅ Mantida</option><option value="enfraquecida">⚠️ Enfraquecida</option>
                <option value="quebrada">❌ Quebrada</option><option value="sem avaliação">— Sem avaliação</option>
              </select>
            </label>
          ))}
          <label className="span-2">O que mudou (anotação)<textarea name="note" rows={2} /></label>
        </ActionForm>
        {t.reviews.length > 0 && (
          <ul className="m-list">
            {t.reviews.map((r) => (
              <li key={r.date} className="m-row">
                <div className="row-between"><strong className="small">{r.conclusion}</strong><span className="xsmall faint">{new Date(r.date).toLocaleDateString("pt-BR")} · {cur} {f(r.price)}</span></div>
                <div className="xsmall muted">{t.premises.map((p, i) => `${r.statuses[i] === "mantida" ? "✅" : r.statuses[i] === "enfraquecida" ? "⚠️" : r.statuses[i] === "quebrada" ? "❌" : "—"} ${p}`).join(" · ")}</div>
                {r.note && <div className="small">{r.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
