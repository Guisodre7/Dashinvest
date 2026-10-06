import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import BrFundamentalsLine from "@/components/BrFundamentalsLine";
import FundPrintImport from "@/components/FundPrintImport";
import StanceCard from "@/components/StanceCard";
import LedgerForm from "@/components/LedgerForm";
import { Kpi, WeightBar } from "@/components/sections";
import { requireUser } from "@/lib/auth";
import { loadBrazil } from "@/lib/data/brazil";
import { loadBrStances } from "@/lib/data/brStances";
import { getRepo } from "@/lib/db/repo";
import { brl, dateBr, n, pct, pp, tone } from "@/lib/format";
import { humanAge } from "@/lib/market/freshness";
import { CLASS_LABEL, KIND_LABEL, PRICED } from "@/lib/portfolio/ledger";
import { registerEntry, saveBrStrategy, undoEntry } from "./actions";

const BR_TABS = [
  { key: "resumo", label: "Resumo" }, { key: "valuation", label: "Valuation" },
  { key: "movimentar", label: "Movimentar" }, { key: "estrategia", label: "Estratégia" },
] as const;
type BrTab = (typeof BR_TABS)[number]["key"];

export default async function BrasilPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams;
  const tab: BrTab = BR_TABS.some((t) => t.key === aba) ? (aba as BrTab) : "resumo";
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const br = await loadBrazil(repo);
  // Fundamentos só quando a aba de valuation é aberta (mais rápido no resto).
  const brs = tab === "valuation" ? await loadBrStances(br, repo) : { views: [], errors: {} as Record<string, string> };
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
  const owned = new Set(s.holdings.map((h) => h.code));
  const watch = strategy.assets.filter((a) => a.enabled && !owned.has(a.code));
  const recent = [...br.entries].reverse().slice(0, 30);

  return (
    <div className="stack" style={{ gap: 0 }}>
      {!br.ready && (
        <div className="banner banner-warn" style={{ marginTop: 16 }}>
          <strong>Carteira Brasil ainda não ativada.</strong> Falta executar <code>supabase/migrations/0004_brasil_ledger.sql</code> no SQL Editor do Supabase. A estratégia abaixo já pode ser editada; movimentações ficam disponíveis após a migração.
        </div>
      )}

      <section className="hero">
        <div>
          <div className="hero-title">🇧🇷 Carteira Brasil</div>
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

      <nav className="tabs dash-tabs" aria-label="Seções da carteira Brasil">
        {BR_TABS.map((t) => <Link key={t.key} href={t.key === "resumo" ? "/brasil" : `/brasil?aba=${t.key}`} scroll={false} aria-current={tab === t.key ? "page" : undefined}>{t.label}</Link>)}
      </nav>

      {tab === "resumo" && (
        <>
      <section className="section grid grid-4 kpis-compact">
        <Kpi label="Dinheiro que eu coloquei" value={brl(s.contributed)} sub={`voltou ${brl(s.withdrawn)} em vendas/resgates`} />
        <Kpi label="Valorização (não realizada)" value={brl(s.unrealized)} cls={tone(s.unrealized)} sub="valor atual − custo" />
        <Kpi label="Lucro realizado" value={brl(s.realized)} cls={tone(s.realized)} sub="vendas e resgates" />
        <Kpi label="Dividendos e rendimentos" value={brl(s.income)} sub={`no mês: ${brl(monthIncome)}`} />
        <Kpi label="Aporte do mês" value={brl(monthIn)} sub="compras + aportes" />
        <Kpi label="Maior posição" value={s.largest ? s.largest.name ?? s.largest.code : "—"} sub={s.largest ? `${n(s.largest.weight, 1)}% da carteira` : undefined} />
        <Kpi label="Maior ganho" value={s.bestGain ? label(s.bestGain) : "—"} cls="pos" sub={s.bestGain ? brl(s.bestGain.unrealized) : undefined} />
        <Kpi label="Maior perda" value={s.worstLoss ? label(s.worstLoss) : "—"} cls={s.worstLoss ? "neg" : ""} sub={s.worstLoss ? brl(s.worstLoss.unrealized) : undefined} />
      </section>

      <section className="section">
        <div className="section-head"><h2>Alocação atual × desejada</h2><span className="xsmall faint">metas editáveis abaixo</span></div>
        <div className="card stack">
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
          {s.currentValue === 0 && <p className="small faint">Sem posições ainda. Registre compras, aportes ou saldos abaixo.</p>}
        </div>
      </section>

        </>
      )}

      {tab === "valuation" && (
        <>
      <section className="section">
        <div className="section-head"><h2>Valuation dos ativos</h2><span className="xsmall faint">qualidade · faixa de valuation · peso na carteira — não é ordem</span></div>
        <div className="grid grid-2">
          {brs.views.map((v) => (
            <StanceCard key={v.code} s={v.stance} price={v.price} cur="R$" name={v.name ?? undefined} compact href={`/brasil#br-${v.code}`}>
              <BrFundamentalsLine v={v} error={brs.errors[v.code]} />
            </StanceCard>
          ))}
        </div>
      </section>

        </>
      )}

      {tab === "resumo" && (
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
          <div className="section-head"><h2>Adicionar atualização da carteira</h2><span className="xsmall faint">print de fundo / renda fixa → confere → você confirma</span></div>
          <div className="card"><FundPrintImport /></div>
        </section>
      )}

      {br.ready && (
        <section className="section">
          <div className="section-head"><h2>Registrar movimentação</h2><span className="xsmall faint">Compra, venda, aporte, resgate, dividendo, rendimento ou saldo</span></div>
          <div className="card">
            <LedgerForm action={registerEntry} fixedIncome={fixedIncome} suggestions={strategy.assets.map((a) => a.code)} />
          </div>
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
          <div className="section-head"><h2>Acompanhamento</h2><span className="xsmall faint">ativos da estratégia sem posição</span></div>
          <div className="card stack small">
            {watch.length === 0 ? <span className="faint">Todos os ativos da estratégia já estão na carteira.</span> : watch.map((a) => {
              const q = quotes[a.code];
              return (
                <div key={a.code} className="row-between">
                  <span><strong>{a.code}</strong> <span className="faint xsmall">{a.name ?? ""} · {CLASS_LABEL[a.asset_class]}</span></span>
                  <span className="num">{q?.price != null ? <>{brl(q.price)} <span className={`xsmall ${tone(q.change_pct)}`}>{pct(q.change_pct, 2, true)}</span></> : <span className="xsmall faint">sem cotação{br.quoteErrors[a.code] ? ` · ${br.quoteErrors[a.code]}` : ""}</span>}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="section-head"><h2>Estratégia Brasil</h2></div>
          <div className="card">
            <ActionForm action={saveBrStrategy} submitLabel="Salvar estratégia">
              <label>Renda fixa (%)<input name="renda_fixa" inputMode="decimal" defaultValue={strategy.classes.renda_fixa} required /></label>
              <label>Ações (%)<input name="acao" inputMode="decimal" defaultValue={strategy.classes.acao} required /></label>
              <label>FIIs (%)<input name="fii" inputMode="decimal" defaultValue={strategy.classes.fii} required /></label>
              <label className="span-2">Ações acompanhadas<input name="acoes" defaultValue={strategy.assets.filter((a) => a.asset_class === "acao").map((a) => a.code).join(", ")} /></label>
              <label className="span-2">FIIs acompanhados<input name="fiis" defaultValue={strategy.assets.filter((a) => a.asset_class === "fii").map((a) => a.code).join(", ")} /></label>
            </ActionForm>
            <p className="xsmall faint" style={{ marginTop: 6 }}>Separe os tickers por vírgula. A soma das classes deve ser 100%.</p>
          </div>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
