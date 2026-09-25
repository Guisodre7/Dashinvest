import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { LiveChange, LiveFreshness, LivePrice, LiveQuotesProvider } from "@/components/LiveQuotes";
import { LivePositionValue } from "@/components/LivePortfolio";
import PriceChart from "@/components/PriceChart";
import StaleRefresher from "@/components/StaleRefresher";
import { Kpi, ScoreBadge } from "@/components/sections";
import { requireUser } from "@/lib/auth";
import { loadContext } from "@/lib/data/load";
import { compact, dateBr, dateTimeEt, n, pct, pp, tone, usd } from "@/lib/format";
import { freshnessConfig } from "@/lib/freshness-config";
import { getMarketDataProvider } from "@/lib/market";
import { MARKET_STATUS_LABEL } from "@/lib/market/marketStatus";
import { ETF_NOTES } from "@/lib/portfolio/etfNotes";

export default async function AssetPage({ params }: { params: Promise<{ ticker: string }> }) {
  const user = await requireUser();
  const ticker = decodeURIComponent((await params).ticker).toUpperCase();
  if (!/^[A-Z.]{1,10}$/.test(ticker)) notFound();

  const ctx = await loadContext(user, { tickers: [ticker] });
  const a = ctx.analyses.find((x) => x.ticker === ticker);
  if (!a) notFound();

  const provider = getMarketDataProvider();
  const [etfProfile, dividends, lastRec] = await Promise.all([
    a.isEtf ? provider.getEtfProfile(ticker).catch(() => null) : null,
    provider.getDividends(ticker).catch(() => null),
    ctx.repo.getLatestRecommendation().catch(() => null),
  ]);
  const position = ctx.portfolio.positions.find((p) => p.ticker === ticker);
  const recLine = lastRec?.lines.find((l) => l.ticker === ticker);
  const q = a.quote;
  const f = a.fundamentals;
  const m = a.momentum;
  const dd = a.drawdown;
  const etfNote = ETF_NOTES[ticker];
  const lastPrice = a.price;
  const ttmYield = dividends?.trailing_12m && lastPrice ? (dividends.trailing_12m / lastPrice) * 100 : null;
  const lastDist = dividends?.history[0];
  const forwardYield = lastDist && lastPrice && a.isEtf ? ((lastDist.amount * 12) / lastPrice) * 100 : null;

  return (
    <LiveQuotesProvider initial={{ [ticker]: q }} cfg={{ maxMarketDataAgeSec: freshnessConfig.maxMarketDataAgeSec, maxMarketDataAgeClosedSec: freshnessConfig.maxMarketDataAgeClosedSec }}>
      {ctx.isDemo && <div className="banner banner-warn" style={{ marginTop: 16 }}><strong>DADOS SINTÉTICOS DE DEMONSTRAÇÃO</strong> — nada nesta página é real.</div>}
      <section className="hero">
        <div>
          <div className="hero-title"><Link href="/">Painel</Link> / {a.strategy.strategy_bucket}{a.strategy.is_legacy && ` · ${a.strategy.legacy_label}`}</div>
          <div className="row" style={{ alignItems: "baseline", gap: 14 }}>
            <h1 style={{ fontSize: 28 }}>{ticker}</h1>
            <span className="muted">{a.name}</span>
          </div>
          <div className="row-wrap" style={{ marginTop: 6 }}>
            <span className="hero-value" style={{ fontSize: 30 }}>US$ <LivePrice ticker={ticker} fallback={lastPrice} /></span>
            <LiveChange ticker={ticker} />
          </div>
          <div className="row-wrap small" style={{ marginTop: 6 }}>
            <LiveFreshness ticker={ticker} />
            <StaleRefresher computedAt={ctx.loadedAt} />
            {q && <span className="faint">Cotação de {dateTimeEt(q.meta.timestamp)} · {MARKET_STATUS_LABEL[q.meta.market_status]} · {q.session === "EXTENDED" ? "sessão estendida" : "sessão regular"}</span>}
          </div>
        </div>
        <div className="grid grid-2 keep-2">
          <Kpi label="Opportunity Score" value={<ScoreBadge score={a.opportunity.score} />} sub={`cobertura ${n(a.opportunity.coverage * 100, 0)}% dos fatores`} />
          <Kpi label="Confiança da análise" value={a.confidence.level} sub={`Data quality ${n(a.dataQuality.score, 0)}%`} />
        </div>
      </section>

      {a.signals.length > 0 && (
        <section className="section stack">
          {a.signals.map((s) => (
            <div key={s.kind} className={`banner ${s.tone === "negative" ? "banner-neg" : s.tone === "positive" ? "" : "banner-warn"}`}>
              <strong>{s.title}</strong> — {s.message}
            </div>
          ))}
        </section>
      )}

      <section className="section grid grid-4">
        <Kpi label="Minha posição" value={position?.quantity ? <LivePositionValue ticker={ticker} quantity={position.quantity} fallbackPrice={position.price} /> : "Sem posição"} sub={position?.quantity ? `${n(position.quantity, 4)} cotas · PM ${usd(position.avgPrice)}` : undefined} />
        <Kpi label="Peso atual / alvo" value={`${n(a.currentWeight, 2)}% / ${n(a.targetWeight, 2)}%`} sub={a.strategy.is_legacy ? "posição legada — fora dos aportes" : `desvio ${pp(a.gap)}`} />
        <Kpi label="Aporte sugerido" value={recLine ? (recLine.amount > 0 ? usd(recLine.amount) : "Aguardar") : "—"} sub={recLine ? `${recLine.action} · cálculo de ${new Date(lastRec!.generatedAt).toLocaleString("pt-BR")}` : "calcule o aporte no painel"} />
        <Kpi label="Retorno" value={pct(position?.assetReturn, 1, true)} cls={tone(position?.assetReturn)} sub={position ? `câmbio ${pct(position.fxReturn, 1, true)} · total BRL ${pct(position.totalReturnBrl, 1, true)}` : undefined} />
      </section>

      <section className="section card">
        <div className="section-head"><h2>Gráfico</h2><span className="xsmall faint">{a.history ? `${a.history.meta.source} · ${a.history.adjusted ? "ajustado por proventos" : "não ajustado"} · diário` : ""}</span></div>
        <PriceChart bars={a.history?.bars ?? []} />
      </section>

      <section className="section grid grid-3">
        <div className="card">
          <h3>Cotação</h3>
          <dl className="kv">
            <dt>Bid / Ask</dt><dd>{q?.bid != null ? `${n(q.bid)} / ${n(q.ask)}` : "indisponível no plano"}</dd>
            <dt>Spread</dt><dd>{n(q?.spread, 3)}</dd>
            <dt>Abertura</dt><dd>{n(q?.open)}</dd>
            <dt>Máx. / mín. do dia</dt><dd>{n(q?.high)} / {n(q?.low)}</dd>
            <dt>Fechamento anterior</dt><dd>{n(q?.prev_close)}</dd>
            <dt>Volume / médio</dt><dd>{compact(q?.volume)} / {compact(q?.avg_volume)}</dd>
            <dt>Máx. 52 semanas</dt><dd>{n(q?.week52_high ?? f?.week52_high)}</dd>
            <dt>Mín. 52 semanas</dt><dd>{n(q?.week52_low ?? f?.week52_low)}</dd>
            <dt>Dist. máx. 52s</dt><dd>{pct(dd?.from_52w_high, 1)}</dd>
            <dt>Dist. mín. 52s</dt><dd>{pct(dd?.from_52w_low, 1, true)}</dd>
            <dt>Dist. máx. {dd?.ath_is_partial ? "(hist. disponível)" : "histórica"}</dt><dd>{pct(dd?.from_ath, 1)}</dd>
          </dl>
        </div>
        <div className="card">
          <h3>Momentum</h3>
          <dl className="kv">
            <dt>1D · 5D</dt><dd>{pct(m?.ret_1d, 1, true)} · {pct(m?.ret_5d, 1, true)}</dd>
            <dt>1M · 3M</dt><dd>{pct(m?.ret_1m, 1, true)} · {pct(m?.ret_3m, 1, true)}</dd>
            <dt>6M · YTD · 1A</dt><dd>{pct(m?.ret_6m, 1, true)} · {pct(m?.ret_ytd, 1, true)} · {pct(m?.ret_1y, 1, true)}</dd>
            <dt>RSI 14</dt><dd>{n(m?.rsi14, 0)}</dd>
            <dt>MACD (hist.)</dt><dd>{m?.macd ? `${n(m.macd.macd, 2)} (${n(m.macd.histogram, 2)})` : "—"}</dd>
            <dt>SMA 20 / 50</dt><dd>{n(m?.sma20)} / {n(m?.sma50)}</dd>
            <dt>SMA 100 / 200</dt><dd>{n(m?.sma100)} / {n(m?.sma200)}</dd>
            <dt>ATR 14</dt><dd>{n(m?.atr14)} ({pct(m?.atr_pct, 1)})</dd>
            <dt>Volume relativo</dt><dd>{n(m?.relative_volume, 2)}x</dd>
            <dt>Volatilidade 60d</dt><dd>{pct(m?.volatility_60d, 0)} a.a.</dd>
          </dl>
          <p className="xsmall faint" style={{ marginTop: 8 }}>Indicadores técnicos são auxiliares e nunca substituem fundamentos.</p>
        </div>
        <div className="card">
          <h3>Drawdown</h3>
          <dl className="kv">
            <dt>Da máxima de 52 semanas</dt><dd>{pct(dd?.from_52w_high, 1)}</dd>
            <dt>Faixa</dt><dd>{dd?.band ?? "—"}</dd>
            <dt>Drawdown 1 mês</dt><dd>{pct(dd?.dd_1m, 1)}</dd>
            <dt>Drawdown 3 meses</dt><dd>{pct(dd?.dd_3m, 1)}</dd>
            <dt>Drawdown 1 ano</dt><dd>{pct(dd?.dd_1y, 1)}</dd>
          </dl>
          <div className="divider" />
          <h3>Zonas de acumulação</h3>
          {a.zones.zones.length ? (
            <div className="stack" style={{ gap: 6 }}>
              {a.zones.zones.map((z) => (
                <div key={z.zone} className="small" style={{ opacity: a.zones.current === z.zone ? 1 : 0.75 }}>
                  <span className={`badge ${a.zones.current === z.zone ? "badge-accent" : ""}`}>Zona {z.zone}</span> <strong>{z.label}</strong>{" "}
                  <span className="num muted">{z.low ? `US$${n(z.low)}` : "até"} {z.low && z.high ? "–" : ""} {z.high ? `US$${n(z.high)}` : "ou mais"}</span>
                  {z.zone !== "D" && <div className="xsmall faint">{z.description}</div>}
                </div>
              ))}
              <p className="xsmall faint">{a.zones.note}</p>
            </div>
          ) : <p className="small faint">{a.zones.note}</p>}
        </div>
      </section>

      {!a.isEtf && (
        <section className="section grid grid-3">
          <div className="card">
            <h3>Valuation</h3>
            <dl className="kv">
              <dt>P/L</dt><dd>{n(f?.pe, 1)}</dd>
              <dt>P/L forward</dt><dd>{n(f?.forward_pe, 1)}</dd>
              <dt>P/L médio 5 anos</dt><dd>{n(f?.pe_5y_avg, 1)}</dd>
              <dt>P/L vs média 5a</dt><dd>{pct(a.valuation.pe_vs_5y, 0, true)}</dd>
              <dt>PEG</dt><dd>{n(f?.peg, 2)}</dd>
              <dt>P/S</dt><dd>{n(f?.ps, 1)}</dd>
              <dt>P/FCF</dt><dd>{n(f?.pfcf, 1)}</dd>
              <dt>EV/EBITDA</dt><dd>{n(f?.ev_ebitda, 1)}</dd>
              <dt>FCF yield</dt><dd>{pct(f?.fcf_yield, 2)}</dd>
              <dt>Dividend yield</dt><dd>{pct(f?.dividend_yield, 2)}</dd>
            </dl>
            <ul className="clean xsmall muted" style={{ marginTop: 8 }}>{a.valuation.notes.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="xsmall faint">P/L baixo não significa “barato” nem P/L alto “caro”: interpretar com crescimento e qualidade.</p>
          </div>
          <div className="card">
            <h3>Fair value (estimativa)</h3>
            {a.fairValue.available ? (
              <>
                <dl className="kv">
                  <dt>Preço atual</dt><dd>{usd(lastPrice)}</dd>
                  <dt>Fair value mínimo</dt><dd>{usd(a.fairValue.min)}</dd>
                  <dt>Fair value médio</dt><dd>{usd(a.fairValue.mean)}</dd>
                  <dt>Fair value máximo</dt><dd>{usd(a.fairValue.max)}</dd>
                  <dt>{(a.fairValue.discount_pct ?? 0) <= 0 ? "Desconto" : "Prêmio"}</dt><dd className={tone(-(a.fairValue.discount_pct ?? 0), 5)}>{pct(a.fairValue.discount_pct, 1, true)}</dd>
                  <dt>Faixa de incerteza</dt><dd>±{n((a.fairValue.uncertainty_pct ?? 0) / 2, 0)}%</dd>
                </dl>
                <ul className="clean xsmall muted" style={{ marginTop: 8 }}>{a.fairValue.estimates.map((e) => <li key={e.method}>{e.method}: {usd(e.value)} <span className="faint">({e.source})</span></li>)}</ul>
              </>
            ) : <p className="small muted">{a.fairValue.reason}</p>}
            <p className="xsmall faint" style={{ marginTop: 8 }}>Fair value é uma estimativa, não o preço verdadeiro.</p>
          </div>
          <div className="card">
            <h3>Business quality</h3>
            {a.quality && (
              <dl className="kv">
                {a.quality.metrics.map((x) => (
                  <Fragment key={x.key}><dt>{x.label}</dt><dd key={`${x.key}-v`} className={x.assessment === "forte" ? "pos" : x.assessment === "fraco" ? "neg" : ""}>{x.value === null ? "—" : x.unit === "%" ? pct(x.value, 1) : `${n(x.value, 2)}x`}</dd></Fragment>
                ))}
              </dl>
            )}
            <p className="xsmall faint" style={{ marginTop: 8 }}>Vantagem competitiva e posição de mercado: avaliação qualitativa — não automatizada.</p>
            <p className="xsmall faint" style={{ marginTop: 8 }}>Qualidade do negócio não é recomendação de compra.</p>
          </div>
        </section>
      )}

      {!a.isEtf && (
        <section className="section grid grid-2">
          <div className="card">
            <h3>Estimativas de lucro</h3>
            {a.estimates?.periods.length ? (
              <div className="table-wrap" style={{ border: 0 }}>
                <table>
                  <thead><tr><th>Período</th><th className="num">EPS esperado</th><th className="num">Receita esperada</th><th className="num">Rev. 30d</th><th className="num">Rev. 90d</th><th className="num">Analistas</th></tr></thead>
                  <tbody>
                    {a.estimates.periods.map((p) => (
                      <tr key={p.period}>
                        <td>{{ "0q": "Trimestre atual", "+1q": "Próximo trimestre", "0y": "Ano fiscal atual", "+1y": "Próximo ano fiscal" }[p.period] ?? p.period}<div className="xsmall faint">{p.period_end ?? ""}</div></td>
                        <td className="num">{n(p.eps_avg)}</td>
                        <td className="num">{compact(p.revenue_avg)}</td>
                        <td className={`num ${tone(p.eps_revision_30d_pct, 1)}`}>{pct(p.eps_revision_30d_pct, 1, true)}</td>
                        <td className={`num ${tone(p.eps_revision_90d_pct, 2)}`}>{pct(p.eps_revision_90d_pct, 1, true)}</td>
                        <td className="num">{p.analyst_count ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="small muted">Estimativas indisponíveis no fornecedor atual.</p>}
            <p className="small" style={{ marginTop: 8 }}>
              Tendência: <strong>{{ rising: "estimativas subindo", stable: "estimativas estáveis", falling: "estimativas caindo", unknown: "sem histórico suficiente" }[a.trend.direction]}</strong>
              {a.trend.basis === "stored-history" && <span className="faint"> (calculado a partir do histórico armazenado)</span>}
              {a.trend.expected_eps_growth !== null && <> · crescimento de EPS esperado {pct(a.trend.expected_eps_growth, 1, true)}</>}
            </p>
            {a.estimates?.surprises.length ? (
              <p className="xsmall muted" style={{ marginTop: 6 }}>Surpresas recentes: {a.estimates.surprises.slice(0, 4).map((s) => `${s.period}: ${pct(s.surprise_pct, 1, true)}`).join(" · ")}</p>
            ) : null}
          </div>
          <div className="card">
            <h3>Analistas</h3>
            {a.consensus ? (
              <dl className="kv">
                <dt>Número de analistas</dt><dd>{a.consensus.total}</dd>
                <dt>Buy / Hold / Sell</dt><dd>{a.consensus.buy} / {a.consensus.hold} / {a.consensus.sell}</dd>
                <dt>Mudança do consenso 1m / 3m</dt><dd>{pp(a.consensus.change_1m !== null ? a.consensus.change_1m * 100 : null, 0)} / {pp(a.consensus.change_3m !== null ? a.consensus.change_3m * 100 : null, 0)}</dd>
                <dt>Upgrades / downgrades 30d</dt><dd>{a.analysts?.upgrades_30d ?? "—"} / {a.analysts?.downgrades_30d ?? "—"}</dd>
                <dt>Upgrades / downgrades 90d</dt><dd>{a.analysts?.upgrades_90d ?? "—"} / {a.analysts?.downgrades_90d ?? "—"}</dd>
                <dt>Preço-alvo médio</dt><dd>{usd(a.analysts?.target_mean)} ({pct(a.consensus.target_upside, 1, true)})</dd>
                <dt>Preço-alvo mín. / máx.</dt><dd>{usd(a.analysts?.target_low)} / {usd(a.analysts?.target_high)}</dd>
                <dt>Dispersão</dt><dd>{pct(a.consensus.target_dispersion, 0)}</dd>
                <dt>Última revisão</dt><dd>{dateBr(a.analysts?.last_revision_at)}</dd>
              </dl>
            ) : <p className="small muted">Dados de analistas indisponíveis.</p>}
            {a.analysts && a.analysts.recommendations.length > 1 && (
              <p className="xsmall muted" style={{ marginTop: 8 }}>Histórico: {a.analysts.recommendations.slice(0, 4).map((r) => `${r.period.slice(0, 7)} ${r.strong_buy + r.buy}/${r.hold}/${r.sell + r.strong_sell}`).join(" · ")}</p>
            )}
            <p className="xsmall faint" style={{ marginTop: 8 }}>Consenso não é recomendação; o sistema dá mais peso às mudanças do que ao nível.</p>
          </div>
        </section>
      )}

      {a.isEtf && (
        <section className="section grid grid-2">
          <div className="card stack">
            <h3>{ticker} — o que é</h3>
            {etfNote && <p className="small">{etfNote.what}</p>}
            {etfNote && <div className="banner small">{etfNote.warning}</div>}
            <dl className="kv">
              <dt>Patrimônio</dt><dd>{compact(etfProfile?.net_assets)}</dd>
              <dt>Taxa de administração</dt><dd>{pct(etfProfile?.expense_ratio, 2)}</dd>
              <dt>Yield (fornecedor)</dt><dd>{pct(etfProfile?.dividend_yield, 2)}</dd>
              <dt>Yield trailing 12m (calculado)</dt><dd>{pct(ttmYield, 2)}</dd>
              <dt>Yield forward (última distribuição × 12)</dt><dd>{a.ticker === "JEPQ" ? pct(forwardYield, 2) : "—"}</dd>
              <dt>Giro da carteira</dt><dd>{pct(etfProfile?.turnover, 0)}</dd>
              {etfNote?.unavailable.map((u) => <Fragment key={u}><dt>{u}</dt><dd key={`${u}-v`} className="faint">indisponível no fornecedor atual</dd></Fragment>)}
            </dl>
          </div>
          <div className="card">
            <h3>Composição</h3>
            {etfProfile?.holdings.length ? (
              <dl className="kv">{etfProfile.holdings.slice(0, 12).map((h) => <Fragment key={h.name}><dt>{h.symbol ?? h.name}</dt><dd key={`${h.name}-w`}>{pct(h.weight, 2)}</dd></Fragment>)}</dl>
            ) : <p className="small muted">Principais posições indisponíveis.</p>}
            {etfProfile?.sectors.length ? (
              <><div className="divider" /><dl className="kv">{etfProfile.sectors.slice(0, 8).map((s) => <Fragment key={s.sector}><dt>{s.sector}</dt><dd key={`${s.sector}-w`}>{pct(s.weight, 1)}</dd></Fragment>)}</dl></>
            ) : null}
            <p className="xsmall faint" style={{ marginTop: 8 }}>{etfProfile ? `Fonte: ${etfProfile.source}` : ""}</p>
          </div>
        </section>
      )}

      <section className="section grid grid-2">
        <div className="card">
          <h3>{dividends?.kind === "distribution" ? "Distribuições" : "Dividendos"}</h3>
          {dividends?.history.length ? (
            <>
              <dl className="kv">
                <dt>Últimos 12 meses (por cota)</dt><dd>{usd(dividends.trailing_12m, 4)}</dd>
                <dt>Yield trailing</dt><dd>{pct(ttmYield, 2)}</dd>
              </dl>
              <div className="divider" />
              <dl className="kv">{dividends.history.slice(0, 8).map((d) => <Fragment key={d.ex_date}><dt>ex {dateBr(d.ex_date)}{d.pay_date ? ` · pag. ${dateBr(d.pay_date)}` : ""}</dt><dd key={`${d.ex_date}-v`}>{usd(d.amount, 4)}</dd></Fragment>)}</dl>
            </>
          ) : <p className="small muted">Histórico de proventos indisponível.</p>}
        </div>
        <div className="card">
          <h3>Eventos</h3>
          {a.events.length ? a.events.map((e) => (
            <div key={`${e.kind}-${e.date}`} className="small">{dateBr(e.date)} · {e.title}{e.time ? ` (${e.time})` : ""} <span className="faint">— {e.source}</span></div>
          )) : <p className="small muted">Nenhum evento corporativo no calendário disponível.</p>}
          {a.daysToEarnings !== null && <p className="small" style={{ marginTop: 6 }}>Próximo evento relevante em <strong>{a.daysToEarnings}</strong> dia(s).</p>}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>Notícias</h2><span className="xsmall faint">impacto por recência, fonte, relevância e gravidade</span></div>
        {a.news.length ? (
          <div className="card" style={{ padding: 0 }}>
            {a.news.slice(0, 15).map((x) => (
              <div key={x.id} className="alert">
                <span className={`sev sev-${x.impact}`}>{x.impact}</span>
                <div>
                  <div className="small">{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer nofollow"><strong>{x.title}</strong></a> : <strong>{x.title}</strong>}</div>
                  <div className="xsmall muted">{x.source} · {x.category} · {x.polarity === "negative" ? "tom negativo" : x.polarity === "positive" ? "tom positivo" : "neutro"}</div>
                  <div className="xsmall faint">{x.impact_reasons.join(" · ")}</div>
                </div>
                <div className="xsmall faint nowrap">{dateTimeEt(x.published_at)}{x.updated_at ? ` · atual. ${dateTimeEt(x.updated_at)}` : ""}</div>
              </div>
            ))}
          </div>
        ) : <div className="card empty">Sem notícia recente confiável.</div>}
      </section>

      <section className="section grid grid-2">
        <div className="card">
          <h3>Opportunity Score — composição</h3>
          <p className="xsmall faint" style={{ marginBottom: 8 }}>Mede a atratividade de um aporte AGORA dentro da carteira — não “qual empresa é melhor”. Fatores sem dado são excluídos.</p>
          <div className="stack" style={{ gap: 8 }}>
            {a.opportunity.factors.filter((x) => x.weight > 0).map((x) => (
              <div key={x.key} className="small">
                <div className="row between"><span>{x.label} <span className="faint xsmall">peso {x.weight}</span></span><span className={`num ${x.value === null ? "faint" : x.value > 0.15 ? "pos" : x.value < -0.15 ? "neg" : ""}`}>{x.value === null ? "sem dado" : n(x.value, 2)}</span></div>
                <div className="xsmall muted">{x.explanation}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Qualidade dos dados e confiança</h3>
          <dl className="kv">
            {a.dataQuality.components.map((c) => <Fragment key={c.key}><dt>{c.label} <span className="faint xsmall">({c.note})</span></dt><dd key={`${c.key}-v`} className={c.ok >= 0.9 ? "pos" : c.ok < 0.5 ? "neg" : "warn"}>{n(c.ok * 100, 0)}%</dd></Fragment>)}
          </dl>
          <div className="divider" />
          <p className="small">DATA QUALITY: <strong>{a.dataQuality.score >= 85 ? "🟢" : a.dataQuality.score >= 60 ? "🟡" : "🔴"} {n(a.dataQuality.score, 0)}%</strong>{a.dataQuality.blocksRecommendation && <span className="neg"> — recomendação automática bloqueada</span>}</p>
          <p className="small" style={{ marginTop: 6 }}>Confiança: <strong>{a.confidence.level}</strong>{a.confidence.level === "Baixa" && " — análise de baixa confiança"}</p>
          <ul className="clean xsmall muted">{a.confidence.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {a.errors.length > 0 && <details className="xsmall faint" style={{ marginTop: 8 }}><summary>Consultas sem dado ({a.errors.length})</summary><ul className="clean">{a.errors.map((e) => <li key={e}>{e}</li>)}</ul></details>}
        </div>
      </section>
    </LiveQuotesProvider>
  );
}
