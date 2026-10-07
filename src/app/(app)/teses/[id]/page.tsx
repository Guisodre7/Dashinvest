import Link from "next/link";
import { FlagBR, FlagUS } from "@/components/Icons";
import { notFound } from "next/navigation";
import ActionForm from "@/components/ActionForm";
import { requireUser } from "@/lib/auth";
import { BAND_META } from "@/lib/analysis/stance";
import { loadDecision } from "@/lib/data/decision";
import { getRepo } from "@/lib/db/repo";
import { getTheses } from "@/lib/data/theses";
import { effectiveThesisState, THESIS_STATES } from "@/lib/thesis/logic";
import { loadContext } from "@/lib/data/load";
import { loadStances } from "@/lib/data/stances";
import { loadBrazil } from "@/lib/data/brazil";
import { loadBrStances } from "@/lib/data/brStances";
import { reviewThesis, saveThesisSignals, setThesisState, setThesisStatus } from "../actions";

const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));

export default async function ThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const all = await getTheses(await getRepo(user.id));
  const t = all.find((x) => x.id === id);
  if (!t) notFound();
  const d = await loadDecision(user, t.market, t.ticker, null);
  const eff = effectiveThesisState(t, d.notFound ? null : { thesis: d.stance.thesis, headline: d.stance.headline });
  // Alternativas (teses-base §7): outros ativos da MESMA carteira em faixa de compra agora.
  const ctx = await loadContext(user);
  const marketStances = t.market === "US"
    ? (await loadStances(ctx, ctx.repo)).stances.map((x) => ({ ticker: x.ticker, action: x.action }))
    : (await loadBrStances(await loadBrazil(ctx.repo), ctx.repo)).views.map((v) => ({ ticker: v.code, action: v.stance.action }));
  const alternatives = marketStances.filter((x) => x.ticker !== t.ticker && (x.action === "comprar" || x.action === "recompra")).map((x) => x.ticker);
  const bands = d.notFound ? [] : d.stance.bands;
  const cur = t.market === "BR" ? "R$" : "US$";
  const change = t.price && d.price ? (d.price / t.price - 1) * 100 : null;
  const last = t.reviews[0];
  const assetHref = t.market === "US" ? `/ativo/${encodeURIComponent(t.ticker)}#realizacao` : `/brasil?aba=aporte#br-${t.ticker}`;

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero">
        <div>
          <div className="hero-title"><Link href="/teses">Minhas teses</Link> / {t.market === "BR" ? <FlagBR size={11} /> : <FlagUS size={11} />}</div>
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
          <div className="kpi-label">Tese</div>
          {t.role && <p className="small" style={{ margin: 0 }}><strong>Papel na carteira:</strong> {t.role}</p>}
          <p className="small">{t.text}</p>
          <div className="kpi-label">O que confirma (premissas)</div>
          <ul className="clean small">{t.premises.map((p) => <li key={p}>{p}</li>)}</ul>
          {t.expectation && <p className="small"><strong>Expectativa:</strong> {t.expectation}</p>}
          {t.risks.length > 0 && <p className="small"><strong>Riscos mapeados:</strong> {t.risks.join("; ")}</p>}
          {t.confirms && t.source !== "base" && <p className="small"><strong>Confirmaria a tese:</strong> {t.confirms}</p>}
          {t.changeMyMind && !t.invalidates?.length && <p className="small"><strong>Invalidaria a tese (mudaria de ideia se):</strong> {t.changeMyMind}</p>}
          {(t.price !== null || t.band) && <p className="xsmall faint">Na data: preço {cur} {f(t.price)}{t.band ? ` · valuation ${BAND_META[t.band]?.label.toLowerCase() ?? t.band}` : ""}{t.quality ? ` · qualidade ${t.quality}` : ""}</p>}
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

      <section className="section grid grid-2">
        <div className="card stack">
          <div className="row-between"><h3>Estado da tese</h3><span className={`badge thesis-${eff.state.replace(/\s/g, "-")}`}>Tese {eff.state}</span></div>
          <p className="small" style={{ margin: 0 }}><strong>Evento:</strong> {eff.reason} <span className="xsmall faint">({eff.by === "usuário" ? "definido por você" : "sinal dos dados — investigar"})</span></p>
          <p className="xsmall faint" style={{ margin: 0 }}>Intacta e em observação não mudam a conta. Ameaçada segura novas compras até você investigar. Invalidada só por decisão sua: vira "avaliar saída". O preço sozinho nunca muda o estado.</p>
          <ActionForm action={setThesisState} submitLabel="Atualizar estado" className="stack">
            <input type="hidden" name="id" value={t.id} />
            <label>Novo estado<select name="state" defaultValue={eff.state}>{THESIS_STATES.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
            <label>Evento que causou a mudança<input name="reason" placeholder="ex.: resultado do 3T26 — inadimplência subiu 2 trimestres seguidos" required /></label>
          </ActionForm>
          {(t.stateLog?.length ?? 0) > 0 && (
            <ul className="clean xsmall muted">{t.stateLog!.slice(0, 6).map((l) => <li key={l.date}>{new Date(l.date).toLocaleDateString("pt-BR")} · {l.state} — {l.reason}</li>)}</ul>
          )}
        </div>
        <div className="card stack">
          <h3>Preço × tese</h3>
          {bands.length >= 5 ? (
            <>
              <p className="small" style={{ margin: 0 }}><strong>Barato demais</strong> (abaixo de {cur} {f(bands[0].high)}): só é oportunidade se a queda vier de fator temporário e a tese seguir intacta — confira os sinais de ameaça antes.</p>
              <p className="small" style={{ margin: 0 }}><strong>Caro demais</strong> (acima de {cur} {f(bands[4].low)}): valuation além do crescimento e do retorno econômico justificáveis — manter/esperar; realização parcial só com os critérios da spec §14.</p>
            </>
          ) : <p className="small faint" style={{ margin: 0 }}>Sem faixa de valuation confiável agora (dados insuficientes ou métodos divergentes).</p>}
          <p className="small" style={{ margin: 0 }}><strong>Alternativas na carteira {t.market === "BR" ? "Brasil" : "internacional"}:</strong> {alternatives.length ? `${alternatives.join(", ")} (em faixa de compra agora)` : "nenhuma em faixa de compra agora — o capital pode ficar como caixa de oportunidade"}.</p>
          {t.valuationApproach && <p className="xsmall muted" style={{ margin: 0 }}><strong>Como valorar este ativo:</strong> {t.valuationApproach}</p>}
        </div>
      </section>

      <section className="section card stack">
        <h3>Sinais da tese</h3>
        <ActionForm action={saveThesisSignals} submitLabel="Salvar sinais">
          <input type="hidden" name="id" value={t.id} />
          <label className="span-2">O que ameaça (exige investigação, ainda não invalida) — um por linha
            <textarea name="threatens" rows={3} defaultValue={(t.threatens ?? []).join("\n")} placeholder={"Inadimplência subindo 1 trimestre\nCusto de crédito acima do guidance"} />
          </label>
          <label className="span-2">O que invalida (mudança estrutural) — um por linha
            <textarea name="invalidates" rows={4} defaultValue={(t.invalidates ?? (t.changeMyMind ? [t.changeMyMind] : [])).join("\n")} />
          </label>
        </ActionForm>
        {!d.notFound && d.stance.thesis === "deteriorada" && <p className="small warn" style={{ margin: 0 }}>Os dados sinalizam ameaça agora: {d.stance.headline}</p>}
        {(t.monitor?.length ?? 0) > 0 && <p className="xsmall muted" style={{ margin: 0 }}><strong>Monitorar:</strong> {t.monitor!.join(" · ")}</p>}
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
