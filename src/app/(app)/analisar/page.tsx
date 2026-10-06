import Link from "next/link";
import StanceCard from "@/components/StanceCard";
import { requireUser } from "@/lib/auth";
import { loadDecision } from "@/lib/data/decision";
import { loadContext } from "@/lib/data/load";
import { loadBrazil } from "@/lib/data/brazil";
import { getTheses } from "@/lib/data/theses";
import { purchaseVerdict, VERDICT_META } from "@/lib/thesis/logic";
import { parseUserNumber } from "@/lib/userNumber";

const f = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }));
const num = (s: string | undefined) => { const n = parseUserNumber(s); return n !== null && n > 0 ? n : null; };

export default async function AnalisarPage({ searchParams }: { searchParams: Promise<{ ativo?: string; mercado?: string; valor?: string; preco?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const ticker = (sp.ativo ?? "").trim().toUpperCase();
  const market = sp.mercado === "BR" || /^[A-Z]{4}\d{1,2}$/.test(ticker) ? "BR" : "US";
  const amount = num(sp.valor);
  const priceOverride = num(sp.preco);
  const valid = market === "BR" ? /^[A-Z]{4}\d{1,2}$/.test(ticker) : /^[A-Z.]{1,10}$/.test(ticker);

  const ctx = await loadContext(user);
  const br = await loadBrazil(ctx.repo);
  const options = [...ctx.strategy.map((s) => s.ticker), ...br.strategy.assets.map((a) => a.code)];
  const d = valid ? await loadDecision(user, market, ticker, priceOverride) : null;
  const thesis = d ? (await getTheses(ctx.repo)).find((t) => t.ticker === ticker && t.status === "ativa") : undefined;

  let after: { qty: number | null; avg: number | null; weight: number | null } | null = null;
  if (d && amount && d.price) {
    const q0 = d.position?.quantity ?? 0, c0 = q0 * (d.position?.avgCost ?? 0), v0 = d.position?.value ?? 0;
    const qty = q0 + amount / d.price;
    // Primeira posição da carteira: peso não é informativo.
    after = { qty, avg: (c0 + amount) / qty, weight: d.portfolioTotal > 0 ? ((v0 + amount) / (d.portfolioTotal + amount)) * 100 : null };
  }
  const verdict = d && !d.notFound ? purchaseVerdict(d.stance, { weightAfter: after?.weight ?? d.position?.weight ?? null, target: d.target, maxWeight: d.maxWeight, dataStale: d.dataStale }) : null;
  const cur = d?.currency ?? (market === "BR" ? "R$" : "US$");

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero"><div><h1>Analisar compra</h1><p className="muted small">Sua carteira + o ativo + o preço + o contexto, antes de decidir. Não prevê o mercado e não envia ordens.</p></div></section>

      <form className="card form-grid section" method="get">
        <label>Mercado<select name="mercado" defaultValue={market}><option value="US">🇺🇸 Internacional</option><option value="BR">🇧🇷 Brasil</option></select></label>
        <label>Ativo<input name="ativo" list="ativos" defaultValue={ticker} placeholder="NVDA, ITUB4, HGLG11…" required autoCapitalize="characters" /></label>
        <label>Valor a investir ({cur})<input name="valor" inputMode="decimal" defaultValue={sp.valor ?? ""} placeholder="ex.: 500" /></label>
        <label>Preço (opcional)<input name="preco" inputMode="decimal" defaultValue={sp.preco ?? ""} placeholder="atual" /></label>
        <datalist id="ativos">{options.map((o) => <option key={o} value={o} />)}</datalist>
        <div className="row span-2"><button className="btn btn-primary btn-sm">Analisar</button><span className="xsmall faint">Deixe o preço vazio para usar a cotação atual; preencha para simular “e se cair até X?”.</span></div>
      </form>

      {d?.notFound && <div className="banner banner-warn section">{d.notFound}</div>}

      {d && !d.notFound && verdict && (
        <>
          <section className={`section card verdict verdict-${verdict.key}`}>
            <div className="kpi-label">Veredito do sistema</div>
            <h2>{VERDICT_META[verdict.key].emoji} {VERDICT_META[verdict.key].label}</h2>
            <ul className="clean small">{verdict.why.map((w) => <li key={w}>{w}</li>)}</ul>
            {verdict.plan.length > 0 && amount && (
              <div className="callout small">
                <strong>Entrada em partes (reduz o risco de timing)</strong>
                {verdict.plan.map((p) => <span key={p.label}>{p.label}: {cur} {f(amount * p.pct / 100)} ({p.pct}%){p.price ? ` — até ${cur} ${f(p.price)}` : ""}</span>)}
              </div>
            )}
            <p className="xsmall faint">Avaliação do modelo no cenário atual — não é garantia de retorno nem recomendação individual.</p>
            <div className="row-wrap">
              <Link className="btn btn-sm" href={`/teses?nova=1&mercado=${market}&ativo=${ticker}&preco=${d.price ? d.price.toFixed(2) : ""}&banda=${d.stance.band ?? ""}&qualidade=${d.stance.quality}`}>{thesis ? "Nova tese" : "Salvar minha tese"}</Link>
              <Link className="btn btn-sm" href={market === "BR" ? "/brasil?aba=movimentar" : "/carteira"}>Registrar compra feita</Link>
              {market === "US" && <Link className="btn btn-ghost btn-sm" href={`/ativo/${encodeURIComponent(ticker)}`}>Página do ativo</Link>}
            </div>
          </section>

          <section className="section grid grid-2">
            <div className="card stack">
              <h3>Minha posição</h3>
              <dl className="bell-stats small">
                <dt>Quanto já possuo</dt><dd>{d.position ? `${f(d.position.quantity, 4)} cotas · ${cur} ${f(d.position.value)}` : "sem posição"}</dd>
                <dt>Preço médio</dt><dd>{d.position ? `${cur} ${f(d.position.avgCost)}` : "—"}</dd>
                <dt>Lucro/prejuízo</dt><dd className={(d.position?.pnl ?? 0) >= 0 ? "pos" : "neg"}>{d.position ? `${cur} ${f(d.position.pnl)}` : "—"}</dd>
                <dt>Peso atual / meta</dt><dd>{f(d.position?.weight ?? 0, 1)}% / {f(d.target, 1)}%</dd>
                {after && <><dt>Depois da compra</dt><dd>{f(after.qty, 4)} cotas · PM {cur} {f(after.avg)} · peso {f(after.weight, 1)}%</dd></>}
              </dl>
              {!amount && <p className="xsmall faint">Informe o valor para ver o efeito da compra no preço médio e no peso.</p>}
            </div>
            <div className="card stack">
              <h3>Preço atual</h3>
              <dl className="bell-stats small">
                <dt>Preço</dt><dd>{cur} {f(d.price)}{d.priceIsOverride ? " (simulado)" : ""}</dd>
                <dt>Variação no dia</dt><dd>{d.changePct === null ? "—" : `${d.changePct >= 0 ? "+" : ""}${f(d.changePct, 2)}%`}</dd>
                <dt>Distância da máxima 52s</dt><dd>{d.from52wHigh === null ? "—" : `${f(d.from52wHigh, 1)}%`}</dd>
                <dt>Acima da mínima 52s</dt><dd>{d.from52wLow === null ? "—" : `+${f(d.from52wLow, 1)}%`}</dd>
                <dt>Fonte</dt><dd className="xsmall">{d.priceSource ?? "—"}{d.priceAsOf ? ` · ${new Date(d.priceAsOf).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</dd>
              </dl>
            </div>
          </section>

          <section className="section grid grid-2">
            <StanceCard s={d.stance} price={d.price} cur={cur} name={d.name ?? undefined} compact href={market === "US" ? `/ativo/${encodeURIComponent(ticker)}#realizacao` : `/brasil?aba=aporte#br-${ticker}`} />
            <div className="card stack">
              <h3>Empresa / fundo</h3>
              <div className="row-wrap xsmall">{d.metrics.map((m) => <span key={m.label} className="chip">{m.label}: <strong>{m.value}</strong></span>)}</div>
              {d.growth.length > 0 && <ul className="clean small">{d.growth.map((g) => <li key={g}>{g}</li>)}</ul>}
              <p className="xsmall faint">Fontes: {d.sources.join(", ") || "—"}</p>
            </div>
          </section>

          <section className="section grid grid-2">
            <div className="card stack">
              <h3>Tese futura</h3>
              {thesis ? (
                <div className="small stack" style={{ gap: 4 }}>
                  <span><strong>Sua tese</strong> ({new Date(thesis.created_at).toLocaleDateString("pt-BR")}): {thesis.text}</span>
                  <ul className="clean">{thesis.premises.map((p) => <li key={p}>{p}</li>)}</ul>
                  <Link href={`/teses/${thesis.id}`} className="xsmall">Revisar tese →</Link>
                </div>
              ) : <p className="small faint">Você ainda não registrou uma tese para {ticker}.</p>}
              <div className="kpi-label">O que os dados mostram a favor</div>
              {d.arguments.length ? <ul className="clean small">{d.arguments.map((a) => <li key={a}>{a}</li>)}</ul> : <p className="small faint">Nada claro a favor nos dados disponíveis.</p>}
              <p className="xsmall faint">DADOS ATUAIS e EXPECTATIVAS (estimativas de analistas) — projeções não são fatos.</p>
            </div>
            <div className="card stack">
              <h3>Riscos</h3>
              {[...d.risks, ...(thesis?.risks ?? []).map((r) => `Seu risco mapeado: ${r}`)].length
                ? <ul className="clean small">{[...d.risks, ...(thesis?.risks ?? []).map((r) => `Seu risco mapeado: ${r}`)].map((r) => <li key={r}>{r}</li>)}</ul>
                : <p className="small faint">Nenhum risco evidente nos dados disponíveis — o que não significa risco zero.</p>}
              {thesis?.changeMyMind && <p className="small"><strong>O que te faria mudar de ideia:</strong> {thesis.changeMyMind}</p>}
            </div>
          </section>

          {(d.news.length > 0 || d.events.length > 0) && (
            <section className="section card stack">
              <h3>Contexto</h3>
              {d.events.length > 0 && <p className="small">Próximos eventos: {d.events.map((e) => `${e.title} (${e.date.split("-").reverse().join("/")})`).join(" · ")}</p>}
              <ul className="clean small">
                {d.news.map((n) => (
                  <li key={n.title}>
                    <span className="xsmall faint">{new Date(n.date).toLocaleDateString("pt-BR")} · {n.source} · impacto {n.impact}</span><br />
                    {n.url ? <a href={n.url} target="_blank" rel="noreferrer noopener">{n.title}</a> : n.title}
                  </li>
                ))}
              </ul>
              <p className="xsmall faint">Notícia é fato; a interpretação acima é do modelo. Manchete não vira recomendação.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
