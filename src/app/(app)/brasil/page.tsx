import Link from "next/link";
import { FlagBR } from "@/components/Icons";
import ActionForm from "@/components/ActionForm";
import BrFundamentalsLine from "@/components/BrFundamentalsLine";
import FundPrintImport from "@/components/FundPrintImport";
import EntryReviewList from "@/components/EntryReviewList";
import SourceLinks from "@/components/SourceLinks";
import ValueRange from "@/components/ValueRange";
import AuditList from "@/components/AuditList";
import { brConfidence } from "@/lib/analysis/brValuation";
import StanceCard from "@/components/StanceCard";
import AllocationView from "@/components/AllocationView";
import { BuyCard, SellCard, type SummaryAsset } from "@/components/SummaryCards";
import WhereBoard, { overTarget, priorityFromStance, type BoardRow } from "@/components/WhereBoard";
import ClassRow from "@/components/ClassRow";
import LedgerForm from "@/components/LedgerForm";
import MovementTabs from "@/components/MovementTabs";
import { Kpi, WeightBar } from "@/components/sections";
import { requireUser } from "@/lib/auth";
import { loadBrazil } from "@/lib/data/brazil";
import { loadBrStances } from "@/lib/data/brStances";
import { allocateBr } from "@/lib/allocation/brAllocate";
import { brAllocationResult } from "@/lib/allocation/brView";
import { appendAudit, auditEntry, listAudit } from "@/lib/data/audit";
import { getCycleCapital, setCycleCapital } from "@/lib/data/cycleCapital";
import { parseMoneyInput } from "@/lib/userNumber";
import { HISTORY_KEY, snapshotOn, type StanceHistory } from "@/lib/data/stances";
import { getRepo } from "@/lib/db/repo";
import { brl, dateBr, n, pct, pp, tone } from "@/lib/format";
import { humanAge } from "@/lib/market/freshness";
import { CLASS_LABEL, KIND_LABEL, PRICED } from "@/lib/portfolio/ledger";
import { registerEntry, saveBrStrategy, undoEntry } from "./actions";

// Abas navegadas pelo submenu da carteira (mesmo padrão do Internacional).
const BR_TABS = [{ key: "resumo" }, { key: "aporte" }, { key: "posicoes" }, { key: "movimentar" }, { key: "estrategia" }] as const;
type BrTab = (typeof BR_TABS)[number]["key"];

export default async function BrasilPage({ searchParams }: { searchParams: Promise<{ aba?: string; valor?: string }> }) {
  const { aba, valor } = await searchParams;
  // "valuation" (links antigos) agora é a mesma página do aporte.
  const tab: BrTab = aba === "valuation" ? "aporte" : BR_TABS.some((t) => t.key === aba) ? (aba as BrTab) : "resumo";
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const br = await loadBrazil(repo);
  // Fundamentos só quando a aba de aporte/valuation é aberta (mais rápido no resto).
  const brs = tab === "aporte" || tab === "resumo" ? await loadBrStances(br, repo) : { views: [], errors: {} as Record<string, string> };
  // Capital disponível NESTE ciclo: o valor informado agora; senão, o já informado neste mês.
  // Sem valor padrão, piso ou teto (a faixa de aportes do perfil é só contexto — spec §2).
  const informed = parseMoneyInput(valor);
  const cycle = tab === "aporte" || tab === "resumo" ? await getCycleCapital(repo, "BR") : null;
  if (informed && informed > 0 && informed !== cycle?.amount) await setCycleCapital(repo, "BR", informed);
  const aporteValor = informed && informed > 0 ? informed : cycle?.amount ?? null;
  const alloc = tab === "aporte" && aporteValor && aporteValor > 0 ? brAllocationResult(allocateBr(aporteValor, br.summary, br.strategy, brs.views), br.summary, br.strategy, brs.views) : null;
  // Auditoria (spec §33): grava quando o usuário calcula (valor enviado), sem repetir no mesmo dia.
  if (alloc && informed && informed > 0) {
    await appendAudit(repo, auditEntry("BR", alloc, (t) => {
      const v = brs.views.find((x) => x.code === t);
      return { price: v?.price ?? null, stance: v?.stance ?? null, fair: v?.fair ? { low: v.fair.low, mid: v.fair.mean, high: v.fair.high } : null };
    }));
  }
  const audit = tab === "aporte" ? await listAudit(repo, "BR") : [];
  const hist = tab === "aporte" ? await repo.getSetting<StanceHistory>(HISTORY_KEY).catch(() => null) : null;
  const brBuys = tab === "aporte" ? [...br.entries].reverse().filter((e) => e.kind === "buy" && e.price).map((e) => {
    const v = brs.views.find((x) => x.code === e.code);
    return { ticker: e.code, date: e.trade_date, price: e.price!, quantity: e.quantity, snap: snapshotOn(hist, e.trade_date, e.code), now: { price: v?.price ?? null, band: v?.stance.band ?? null, thesis: v?.stance.thesis ?? "não verificável" as const } };
  }) : [];
  const { summary: s, strategy, quotes } = br;
  const month = new Date().toISOString().slice(0, 7);
  const monthIn = br.entries.filter((e) => e.trade_date.startsWith(month) && (e.kind === "buy" || e.kind === "contribution")).reduce((a, e) => a + e.amount + e.fees, 0);
  const monthIncome = br.entries.filter((e) => e.trade_date.startsWith(month) && (e.kind === "dividend" || e.kind === "income")).reduce((a, e) => a + e.amount, 0);
  const fixedIncome = s.holdings.filter((h) => !PRICED.has(h.asset_class)).map((h) => ({ code: h.code, name: h.name }));
  const nameOf = (code: string) => s.holdings.find((h) => h.code === code)?.name ?? strategy.assets.find((a) => a.code === code)?.name ?? code;
  const ageOf = (code: string) => {
    const q = quotes[code];
    return q ? humanAge(Math.max(0, Math.round((Date.now() - new Date(q.meta.timestamp).getTime()) / 1000))) : null;
  };
  const label = (h: { code: string; name: string | null; asset_class: Parameters<typeof PRICED.has>[0] }) => (PRICED.has(h.asset_class) ? h.code : h.name ?? h.code);
  const recent = [...br.entries].reverse().slice(0, 30);
  const summaryAssets: SummaryAsset[] = brs.views.map((v) => {
    const nIn = strategy.assets.filter((x) => x.enabled && x.asset_class === v.assetClass).length || 1;
    const target = strategy.assets.some((x) => x.enabled && x.code === v.code) ? strategy.classes[v.assetClass] / nIn : 0;
    return { stance: v.stance, price: v.price, href: `/brasil?aba=aporte#br-${v.code}`, weight: s.holdings.find((h) => h.code === v.code)?.weight ?? null, maxWeight: target ? target * 1.5 : null };
  });
  // Próximo aporte (prévia): quem tem prioridade média/alta e está abaixo da meta.
  const nextUp = brs.views.map((v) => {
    const a = strategy.assets.find((x) => x.code === v.code);
    const nIn = strategy.assets.filter((x) => x.enabled && x.asset_class === v.assetClass).length || 1;
    const target = a?.enabled ? strategy.classes[v.assetClass] / nIn : 0;
    const cur = s.currentValue > 0 ? s.holdings.find((h) => h.code === v.code)?.weight ?? 0 : null;
    return { v, priority: a?.enabled ? priorityFromStance(v.stance.action, cur, target) : "BAIXA" as const };
  }).filter((x) => x.priority !== "BAIXA").sort((a, b) => (a.priority === "ALTA" ? 0 : 1) - (b.priority === "ALTA" ? 0 : 1));
  // "Onde aportar": todos os ativos do radar, com o valuation dentro da linha.
  const board: BoardRow[] = tab === "aporte" ? strategy.assets.filter((a) => a.enabled || s.holdings.some((h) => h.code === a.code && h.quantity > 0)).map((a) => {
    const v = brs.views.find((x) => x.code === a.code);
    const nIn = strategy.assets.filter((x) => x.enabled && x.asset_class === a.asset_class).length || 1;
    const h = s.holdings.find((x) => x.code === a.code);
    const current = s.currentValue > 0 ? h?.weight ?? 0 : null, target = a.enabled ? strategy.classes[a.asset_class] / nIn : 0;
    return {
      id: `br-${a.code}`, ticker: a.code, bucket: CLASS_LABEL[a.asset_class], priority: a.enabled ? priorityFromStance(v?.stance.action, current, target) : "BAIXA",
      price: v?.price ?? null, cur: "R$" as const, stance: v?.stance ?? null, current, target,
      note: !a.enabled ? "Fora da estratégia: não recebe aporte." : !v ? `Sem dados de valuation${brs.errors[a.code] ? ` (${brs.errors[a.code]})` : ""}: espera.` : overTarget(current, target) ? `${v.stance.headline} Espera: já na meta ou acima.` : v.stance.headline,
      detail: v ? (
        <StanceCard s={v.stance} price={v.price} cur="R$" name={v.name ?? undefined} compact href={`/analisar?ativo=${encodeURIComponent(a.code)}&mercado=BR`}>
          <ValueRange cur="R$" price={v.price} low={v.fair?.low ?? null} mid={v.fair?.mean ?? null} high={v.fair?.high ?? null} methods={v.methods}
            confidence={brConfidence(v)} note={v.fairReason} />
          <BrFundamentalsLine v={v} error={brs.errors[a.code]} />
          <SourceLinks market="BR" ticker={a.code} fii={a.asset_class === "fii"} />
        </StanceCard>
      ) : <><p className="small faint">Fundamentos indisponíveis{brs.errors[a.code] ? ` (${brs.errors[a.code]})` : ""} — sem faixa de valuation.</p><SourceLinks market="BR" ticker={a.code} fii={a.asset_class === "fii"} /></>,
    };
  }) : [];

  return (
    <div className="stack" style={{ gap: 0 }}>
      {!br.ready && (
        <div className="banner banner-warn" style={{ marginTop: 16 }}>
          <strong>Carteira Brasil ainda não ativada.</strong> Falta executar <code>supabase/migrations/0004_brasil_ledger.sql</code> no SQL Editor do Supabase. A estratégia abaixo já pode ser editada; movimentações ficam disponíveis após a migração.
        </div>
      )}

      <section className="hero">
        <div>
          <div className="hero-title"><FlagBR size={12} /> Carteira Brasil</div>
          <div className="hero-value num">{brl(s.currentValue)}</div>
          <div className="row-wrap small muted">
            <span>Capital aportado líquido <strong className="num">{brl(s.netContributed)}</strong></span>
            <span className={`num ${tone(s.marketGain)}`}>Gerado pelo mercado {s.marketGain !== null ? brl(s.marketGain) : "—"} ({pct(s.marketGainPct, 2, true)})</span>
          </div>
          {s.missingValues.length > 0 && <p className="xsmall neg">Sem cotação/saldo para {s.missingValues.join(", ")} — patrimônio parcial; retorno total indisponível.</p>}
        </div>
        <div className="card card-tight small">
          <div>Cotações B3: brapi (atrasadas, nunca tempo real)</div>
          <div className="xsmall faint">Renda fixa: saldo informado por você, com a data de cada atualização.</div>
        </div>
      </section>


      {tab === "resumo" && (
        <>
      <section className="section grid grid-4 kpis-compact">
        <Kpi label="Dinheiro que eu coloquei" value={brl(s.contributed)} sub={`voltou ${brl(s.withdrawn)} em vendas/resgates`} />
        <Kpi label="Lucro / prejuízo" value={brl(s.unrealized)} cls={tone(s.unrealized)} sub={`realizado ${brl(s.realized)}`} />
        <Kpi label="Dividendos e rendimentos" value={brl(s.income)} sub={`no mês: ${brl(monthIncome)}`} />
        <Kpi label="Aporte do mês" value={brl(monthIn)} sub="compras + aportes" />
      </section>

      <section className="section grid grid-2">
        <BuyCard items={summaryAssets} cur="R$" href="/brasil?aba=aporte" />
        <SellCard items={summaryAssets} cur="R$" />
      </section>

      <section className="section grid grid-2">
        <div className="card stack">
          <div className="row-between"><h3>Próximo aporte{cycle ? ` (${brl(cycle.amount)})` : ""}</h3><Link href="/brasil?aba=aporte" scroll={false} className="small">{cycle ? "Ver divisão →" : "Informar capital →"}</Link></div>
          {!cycle && <p className="xsmall muted" style={{ margin: 0 }}>Capital disponível deste ciclo ainda não informado. Prioridades atuais:</p>}
          {nextUp.length ? (
            <ul className="decision-list">
              {nextUp.slice(0, 5).map(({ v, priority }) => (
                <li key={v.code}><Link href={`/brasil?aba=aporte#br-${v.code}`} className="ticker">{v.code}</Link><span className={`badge ${priority === "ALTA" ? "badge-pos" : ""}`}>{priority === "ALTA" ? "Alta · oportunidade" : "Média · aporte normal"}</span></li>
              ))}
            </ul>
          ) : <p className="small faint">Nenhum ativo com prioridade média ou alta agora: o aporte vai para renda fixa ou caixa de oportunidade.</p>}
          {s.classes.some((c) => c.asset_class === "renda_fixa" && (c.toTarget ?? 0) >= 1) && <p className="xsmall muted">Renda fixa abaixo da meta também recebe parte do aporte.</p>}
        </div>
        <div className="card stack">
          <div className="row-between"><h3>Alocação atual × meta</h3><Link href="/brasil?aba=estrategia" scroll={false} className="small">Metas →</Link></div>
          {s.classes.filter((c) => c.target > 0 || c.value > 0).map((c) => (
            <div key={c.asset_class} className="alloc-row">
              <div className="alloc-label"><strong>{CLASS_LABEL[c.asset_class]}</strong><span className="xsmall faint num">{brl(c.value)}</span></div>
              <WeightBar current={c.weight} target={c.target} />
              <div className="num small alloc-nums">
                {n(c.weight, 1)}% / {n(c.target, 0)}%
                <span className={`xsmall ${c.gap !== null && Math.abs(c.gap) >= 5 ? (c.gap > 0 ? "neg" : "pos") : "faint"}`}> {c.gap !== null ? pp(c.gap, 1) : ""}</span>
              </div>
              {c.toTarget !== null && Math.abs(c.toTarget) >= 1 && (
                <div className="xsmall muted">{c.toTarget > 0 ? `Faltam ${brl(c.toTarget)} para a meta` : `${brl(-c.toTarget)} acima da meta (corrigido pelos próximos aportes)`}</div>
              )}
            </div>
          ))}
          {s.currentValue === 0 && <p className="small faint">Sem posições ainda. Registre compras, aportes ou saldos em Movimentar.</p>}
        </div>
      </section>

      <section className="section">
        <div className="card stack">
          <div className="row-between"><h3>Minhas posições</h3><Link href="/brasil?aba=posicoes" scroll={false} className="small">Tabela completa →</Link></div>
          {s.holdings.length === 0 ? <p className="small faint">Nenhuma posição registrada.</p> : (
            <ul className="decision-list">
              {s.holdings.map((h) => (
                <li key={h.code}>
                  <span className="ticker">{label(h)}</span>
                  <span className={`xsmall num ${tone(h.unrealized)}`}>{pct(h.unrealizedPct, 1, true)} · {n(h.weight, 1)}%</span>
                  <strong className="num">{brl(h.value)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

        </>
      )}

      {tab === "aporte" && (
        <section className="section stack">
          <form className="card contrib" method="get">
            <input type="hidden" name="aba" value="aporte" />
            <div className="stack" style={{ gap: 4 }}>
              <span className="small muted">Capital disponível para aporte neste ciclo (Brasil)</span>
              <div className="money"><span>R$</span><input name="valor" inputMode="decimal" defaultValue={valor ?? (cycle ? String(cycle.amount).replace(".", ",") : "")} placeholder="valor disponível" aria-label="Capital disponível neste ciclo, em reais" /></div>
            </div>
            <button className="btn btn-primary" style={{ alignSelf: "flex-end", padding: "12px 20px" }}>CALCULAR APORTE</button>
          </form>
          <p className="xsmall faint">
            {aporteValor ? <>O motor analisa exatamente {brl(aporteValor)} — sem valor padrão nem limite. </> : null}
            Não sabe quanto vai para o Brasil e quanto para o exterior? <Link href="/geral#plano">Plano do mês na Visão geral</Link>.
          </p>
          {alloc && (
            <div className="card stack">
              <AllocationView result={alloc} cur="R$" />
              <div className="row-wrap">
                <Link className="btn btn-sm" href="/brasil?aba=movimentar">Registrar as compras feitas</Link>
                <Link className="btn btn-ghost btn-sm" href="/analisar?mercado=BR">Analisar um ativo antes</Link>
              </div>
            </div>
          )}
          <div className="section-head"><h2>Onde aportar</h2><span className="xsmall faint">todo o radar · toque no ativo para ver o valuation</span></div>
          <WhereBoard rows={board} />
          {brBuys.length > 0 && (
            <details className="card">
              <summary className="small muted">Minhas compras × valuation de hoje (retrospectiva)</summary>
              <div style={{ marginTop: 10 }}><EntryReviewList buys={brBuys} cur="R$" /></div>
            </details>
          )}
          <AuditList entries={audit} cur="R$" />
        </section>
      )}

      {tab === "posicoes" && (
        <>
      <section className="section">
        <div className="section-head"><h2>Posições</h2></div>
        {s.holdings.length === 0 ? <p className="small faint">Nenhuma posição registrada.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ativo</th><th>Classe</th><th className="num">Qtd.</th><th className="num">Preço médio</th><th className="num">Preço / saldo</th><th className="num">Valor</th><th className="num">Custo</th><th className="num">Valorização</th><th className="num">Renda</th><th className="num">Peso</th></tr></thead>
              <tbody>
                {s.holdings.map((h) => {
                  const priced = PRICED.has(h.asset_class);
                  return (
                    <tr key={h.code}>
                      <td className="cell-main"><span className="ticker">{priced ? h.code : h.name ?? h.code}</span>{priced && h.name && <div className="xsmall faint">{h.name}</div>}{h.cnpj && <div className="xsmall faint">CNPJ {h.cnpj}</div>}</td>
                      <td data-label="Classe">{CLASS_LABEL[h.asset_class]}</td>
                      <td data-label="Qtd." className="num">{priced ? n(h.quantity, 4) : "—"}</td>
                      <td data-label="Preço médio" className="num">{priced ? brl(h.avg_price) : "—"}</td>
                      <td data-label="Preço / saldo" className="num">
                        {priced ? (h.price !== null ? <>{brl(h.price)}<div className="xsmall faint">há {ageOf(h.code)}</div></> : <span className="neg xsmall">sem cotação{br.quoteErrors[h.code] ? ` · ${br.quoteErrors[h.code]}` : ""}</span>)
                          : <>{brl(h.current_value)}<div className="xsmall faint">{h.current_value_at ? `em ${dateBr(h.current_value_at.slice(0, 10))}` : "saldo não informado"}</div></>}
                      </td>
                      <td data-label="Valor" className="num">{brl(h.value)}</td>
                      <td data-label="Custo" className="num">{brl(h.cost_basis)}</td>
                      <td data-label="Valorização" className={`num ${tone(h.unrealized)}`}>{brl(h.unrealized)}<div className="xsmall">{pct(h.unrealizedPct, 1, true)}</div></td>
                      <td data-label="Renda" className="num">{brl(h.income)}</td>
                      <td data-label="Peso" className="num">{n(h.weight, 1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

        </>
      )}

      {tab === "movimentar" && (
        <>
      {br.ready && (
        <section className="section">
          <div className="section-head"><h2>Movimentar</h2><span className="xsmall faint">mesmo padrão da carteira internacional · nenhuma ordem é enviada</span></div>
          <MovementTabs panels={[
            { key: "compra", label: "Compra", content: <LedgerForm action={registerEntry} fixedIncome={fixedIncome} suggestions={strategy.assets.map((a) => a.code)} mode="buy" /> },
            { key: "venda", label: "Venda", content: <LedgerForm action={registerEntry} fixedIncome={fixedIncome} suggestions={s.holdings.filter((h) => PRICED.has(h.asset_class)).map((h) => h.code)} mode="sell" /> },
            { key: "provento", label: "Provento", content: <LedgerForm action={registerEntry} fixedIncome={fixedIncome} suggestions={s.holdings.filter((h) => PRICED.has(h.asset_class)).map((h) => h.code)} mode="income" /> },
            { key: "rf", label: "Renda fixa", content: (
              <div className="stack">
                <FundPrintImport />
                <details><summary className="small muted">Registrar manualmente (aporte, resgate, saldo)</summary>
                  <LedgerForm action={registerEntry} fixedIncome={fixedIncome} suggestions={[]} mode="rf" />
                </details>
              </div>
            ) },
          ]} />
        </section>
      )}

      {recent.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Histórico de movimentações</h2></div>
          <ul className="m-list" aria-label="Movimentações">
            {recent.map((e) => (
              <li key={e.id} className="m-row">
                <div className="m-row-top">
                  <div className="m-id"><span className="ticker">{KIND_LABEL[e.kind]} · {PRICED.has(e.asset_class) ? e.code : nameOf(e.code)}</span><span className="xsmall faint">{dateBr(e.trade_date)} · {CLASS_LABEL[e.asset_class]}</span></div>
                  <ActionForm action={undoEntry} submitLabel="Desfazer" submitClassName="btn btn-sm" className="row" confirm="Desfazer esta movimentação? A posição será recalculada.">
                    <input type="hidden" name="id" value={e.id} /><input type="hidden" name="code" value={e.code} />
                  </ActionForm>
                </div>
                <div className="m-row-sub small num">
                  {e.quantity !== null && e.price !== null ? `${n(e.quantity, 4)} × ${brl(e.price)} = ` : ""}{brl(e.amount)}
                  {e.fees > 0 && <span className="faint"> · custos {brl(e.fees)}</span>}
                  {e.avg_price_after !== null && <span className="faint"> · PM após {brl(e.avg_price_after)}</span>}
                  {e.realized_pnl !== null && <span className={tone(e.realized_pnl)}> · realizado {brl(e.realized_pnl)}</span>}
                </div>
                {e.notes && <div className="m-row-sub xsmall faint">{e.notes}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

        </>
      )}

      {tab === "estrategia" && (
        <>
      <section className="section grid grid-2">
        <div>
          <div className="section-head"><h2>Ativos da estratégia</h2><span className="xsmall faint">meta · posição ou cotação</span></div>
          <div className="card stack small">
            {strategy.assets.filter((a) => a.enabled).map((a) => {
              const q = quotes[a.code];
              const h = s.holdings.find((x) => x.code === a.code && x.quantity > 0);
              const nIn = strategy.assets.filter((x) => x.enabled && x.asset_class === a.asset_class).length || 1;
              return (
                <div key={a.code} className="row-between">
                  <span><strong>{a.code}</strong> <span className="faint xsmall">{n(strategy.classes[a.asset_class] / nIn, 2)}% · {CLASS_LABEL[a.asset_class]}</span></span>
                  {h ? <span className="num">{brl(h.value)} <span className="xsmall muted">{n(h.weight, 1)}% da carteira</span></span>
                    : <span className="num xsmall faint">sem posição · {q?.price != null ? <>{brl(q.price)} <span className={tone(q.change_pct)}>{pct(q.change_pct, 2, true)}</span></> : `sem cotação${br.quoteErrors[a.code] ? ` · ${br.quoteErrors[a.code]}` : ""}`}</span>}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="section-head"><h2>Estratégia Brasil</h2></div>
          <div className="card">
            <ActionForm action={saveBrStrategy} submitLabel="Salvar estratégia" className="stack">
              <div className="class-head"><span>Classe</span><span>Meta</span><span>Ativos</span></div>
              <ClassRow name="Renda fixa" pctField="renda_fixa" pct={strategy.classes.renda_fixa} listHint="títulos e fundos registrados em Movimentar" />
              <ClassRow name="Ações" pctField="acao" pct={strategy.classes.acao} listField="acoes" list={strategy.assets.filter((a) => a.asset_class === "acao").map((a) => a.code).join(", ")} />
              <ClassRow name="FIIs" pctField="fii" pct={strategy.classes.fii} listField="fiis" list={strategy.assets.filter((a) => a.asset_class === "fii").map((a) => a.code).join(", ")} />
            </ActionForm>
            <p className="xsmall faint" style={{ marginTop: 6 }}>Para adicionar um ativo, escreva o ticker na classe (separe por vírgula); para tirar, apague. A soma das classes deve ser 100%; a meta de cada ativo é a da classe dividida pelo nº de ativos.</p>
          </div>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
