import { allocate } from "@/lib/analysis/allocation";
import { requireUser } from "@/lib/auth";
import { loadContext } from "@/lib/data/load";
import { brl, dateBr, n, pct, usd } from "@/lib/format";

/** Relatório mensal — leitura de ~5 minutos, gerado a partir dos dados atuais. */
export default async function RelatorioPage() {
  const user = await requireUser();
  const ctx = await loadContext(user);
  const { portfolio: p, analyses } = ctx;
  const [snapshots, transactions, dividends, defaultAmount] = await Promise.all([
    ctx.repo.getSnapshots(31), ctx.repo.getTransactions(200), ctx.repo.getDividends(),
    ctx.repo.getSetting<number>("default_contribution"),
  ]);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const buys = transactions.filter((t) => t.kind === "buy" && t.trade_date >= monthAgo);
  const contributed = buys.reduce((s, t) => s + (t.quantity ?? 0) * (t.price ?? 0) + t.fees, 0);
  const divMonth = dividends.filter((d) => (d.pay_date ?? d.ex_date ?? "") >= monthAgo);
  const divTotal = divMonth.reduce((s, d) => s + (d.net_amount ?? d.gross_amount - d.withholding_tax), 0);
  const first = snapshots[0];
  const perfUsd = first ? ((p.totalUsd - contributed) / first.total_usd - 1) * 100 : null;

  const byMonth = [...analyses].filter((a) => a.momentum?.ret_1m != null).sort((a, b) => b.momentum!.ret_1m! - a.momentum!.ret_1m!);
  const top = byMonth.slice(0, 3), bottom = byMonth.slice(-3).reverse();
  const fundamental = analyses.filter((a) => a.trend.direction === "rising" || a.trend.direction === "falling");
  const news = analyses.flatMap((a) => a.news.filter((x) => x.impact === "CRITICAL" || x.impact === "HIGH").map((x) => ({ ...x, t: a.ticker }))).slice(0, 6);
  const opportunities = analyses.filter((a) => a.signals.some((s) => s.kind === "OPPORTUNITY" || s.kind === "VALUATION_COMPRESSION"));
  const risks = analyses.flatMap((a) => a.signals.filter((s) => s.tone === "negative" && s.kind !== "STALE_DATA").map((s) => ({ t: a.ticker, s })));
  const nextMonth = new Date(Date.now() + 31 * 86_400_000).toISOString().slice(0, 10);
  const events = [...analyses.flatMap((a) => a.events), ...ctx.macroEvents].filter((e) => e.date <= nextMonth).sort((a, b) => a.date.localeCompare(b.date));
  const values = Object.fromEntries(p.positions.map((x) => [x.ticker, x.valueUsd ?? 0]));
  const amount = defaultAmount ?? 550;
  const next = allocate({ contribution: amount, analyses, values, existingOpportunityCash: ctx.opportunityCashBalance, settings: ctx.settings });

  return (
    <article className="stack" style={{ maxWidth: 820, gap: 0 }}>
      <section className="hero" style={{ display: "block" }}>
        <div className="hero-title">Gerado em {new Date(ctx.loadedAt).toLocaleString("pt-BR")} · fonte {ctx.providerName}</div>
        <h1 style={{ fontSize: 24 }}>CARTEIRA INTERNACIONAL — RELATÓRIO MENSAL</h1>
        {ctx.isDemo && <div className="banner banner-warn" style={{ marginTop: 8 }}>Dados sintéticos de demonstração.</div>}
      </section>

      <Block n={1} title="Patrimônio">{usd(p.totalUsd)} · {brl(p.totalBrl)}{ctx.fx && <span className="faint"> (USD/BRL {n(ctx.fx.rate, 4)})</span>}</Block>
      <Block n={2} title="Performance">
        {perfUsd !== null ? <>Variação em 30 dias, excluindo aportes: <strong>{pct(perfUsd, 2, true)}</strong> em US$. </> : "Sem snapshot de 30 dias atrás. "}
        Desde o início: ativos {pct(p.assetReturn, 2, true)}, câmbio {pct(p.fxReturn, 2, true)}, total em BRL {pct(p.totalReturnBrl, 2, true)}.
      </Block>
      <Block n={3} title="Aportes">{buys.length ? `${buys.length} compra(s) somando ${usd(contributed)} nos últimos 30 dias.` : "Nenhuma compra registrada nos últimos 30 dias."}</Block>
      <Block n={4} title="Dividendos e distribuições">{divMonth.length ? `${usd(divTotal)} líquidos recebidos (${divMonth.map((d) => d.ticker).join(", ")}).` : "Nenhum provento registrado no período."}</Block>
      <Block n={5} title="Maiores altas (1 mês)">{top.map((a) => `${a.ticker} ${pct(a.momentum!.ret_1m, 1, true)}`).join(" · ") || "—"}</Block>
      <Block n={6} title="Maiores quedas (1 mês)">{bottom.map((a) => `${a.ticker} ${pct(a.momentum!.ret_1m, 1, true)}`).join(" · ") || "—"}</Block>
      <Block n={7} title="Mudanças fundamentais">
        {fundamental.length ? fundamental.map((a) => <div key={a.ticker}>{a.ticker}: estimativas de EPS {a.trend.direction === "rising" ? "subindo" : "caindo"} ({pct(a.trend.eps_rev_90d ?? a.trend.eps_rev_30d, 1, true)}).</div>) : "Sem revisões relevantes de estimativas detectadas."}
      </Block>
      <Block n={8} title="Notícias importantes">
        {news.length ? news.map((x) => <div key={x.id}><strong>{x.t}</strong> [{x.impact}] {x.title} <span className="faint">— {x.source}, {dateBr(x.published_at)}</span></div>) : "Sem notícia recente de alto impacto de fonte confiável."}
      </Block>
      <Block n={9} title="Valuation">
        {analyses.filter((a) => !a.isEtf).map((a) => (
          <div key={a.ticker}>{a.ticker}: P/L {n(a.valuation.pe, 1)}{a.valuation.pe_vs_5y !== null && ` (${pct(a.valuation.pe_vs_5y, 0, true)} vs média 5a)`}{a.fairValue.available ? ` · ${pct(a.fairValue.discount_pct, 1, true)} vs fair value médio estimado` : " · fair value indisponível"}{a.zones.current && ` · Zona ${a.zones.current}`}</div>
        ))}
      </Block>
      <Block n={10} title="Oportunidades">{opportunities.length ? opportunities.map((a) => <div key={a.ticker}>{a.ticker}: {a.signals.filter((s) => s.kind === "OPPORTUNITY" || s.kind === "VALUATION_COMPRESSION").map((s) => s.message).join(" ")}</div>) : "Nenhum sinal de oportunidade de acumulação."}</Block>
      <Block n={11} title="Riscos">{risks.length ? risks.map(({ t, s }) => <div key={`${t}-${s.kind}`}>{t}: {s.title} — {s.message}</div>) : "Nenhum risco específico sinalizado pelos dados."}</Block>
      <Block n={12} title="Eventos do próximo mês">{events.length ? events.map((e) => <div key={`${e.ticker}-${e.kind}-${e.date}`}>{dateBr(e.date)} · {e.ticker ?? "Macro"} · {e.title}</div>) : "Nenhum evento no calendário disponível."}</Block>
      <Block n={13} title={`Distribuição recomendada do próximo aporte (${usd(amount, 0)})`}>
        {next.blocked ? <span className="neg">{next.blockReasons.join(" ")}</span> : (
          <>
            {next.lines.filter((l) => l.amount > 0).map((l) => <div key={l.ticker}>{l.ticker}: <strong>{usd(l.amount)}</strong> — {l.action}</div>)}
            {next.opportunityCash > 0 && <div>Caixa de oportunidade: {usd(next.opportunityCash)}</div>}
            <p className="xsmall faint" style={{ marginTop: 6 }}>Recomendação — a decisão final é sua. Nenhuma ordem é executada.</p>
          </>
        )}
      </Block>
    </article>
  );
}

function Block({ n: num, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2 style={{ marginBottom: 6 }}><span className="faint">{num}.</span> {title}</h2>
      <div className="small" style={{ lineHeight: 1.65 }}>{children}</div>
    </section>
  );
}
