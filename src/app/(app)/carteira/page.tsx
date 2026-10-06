import Link from "next/link";
import { FlagUS } from "@/components/Icons";
import ActionForm from "@/components/ActionForm";
import BuyTradeForm from "@/components/BuyTradeForm";
import DividendForm from "@/components/DividendForm";
import MovementTabs from "@/components/MovementTabs";
import SellTradeForm from "@/components/SellTradeForm";
import { serverConfig } from "@/lib/config";
import HistoryChart from "@/components/HistoryChart";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { brl, dateBr, n, pct, tone, usd } from "@/lib/format";
import { deletePosition, registerBuy, registerDividend, registerSell, savePosition, setOpportunityCash, undoBuy } from "./actions";

const RANGES = [
  { key: "1S", days: 7 }, { key: "1M", days: 30 }, { key: "3M", days: 90 },
  { key: "6M", days: 180 }, { key: "1A", days: 365 }, { key: "Início", days: null },
] as const;

export default async function CarteiraPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const { r } = await searchParams;
  const range = RANGES.find((x) => x.key === r) ?? RANGES[2];
  const [positions, assets, transactions, dividends, snapshots, cash, sellReady, realizedUsd] = await Promise.all([
    repo.getPositions(), repo.getAssets(), repo.getTransactions(50), repo.getDividends(),
    repo.getSnapshots(range.days), repo.getSetting<number>("opportunity_cash_balance"),
    repo.ledgerReady(), repo.getRealizedUsd().catch(() => 0),
  ]);
  const tickers = assets.map((a) => a.ticker);
  const tickerOptions = tickers.map((t) => <option key={t} value={t} />);

  const first = snapshots[0], last = snapshots[snapshots.length - 1];
  const usdChange = first && last ? (last.total_usd / first.total_usd - 1) * 100 : null;
  const brlChange = first?.total_brl && last?.total_brl ? (last.total_brl / first.total_brl - 1) * 100 : null;
  const fxChange = first?.usd_brl && last?.usd_brl ? (last.usd_brl / first.usd_brl - 1) * 100 : null;
  // Aportes no período distorcem a variação do patrimônio — mostramos também o custo.
  const costChange = first && last ? last.cost_usd - first.cost_usd : null;

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero"><div><div className="hero-title"><FlagUS size={12} /> Carteira Internacional</div><h1>Movimentar</h1><p className="muted small">Compras, vendas e proventos — qualquer ativo da NYSE/Nasdaq (ativos novos são conferidos e cadastrados ao salvar). Nenhuma ordem é enviada a corretoras.</p></div></section>


      <section className="section">
        <MovementTabs panels={[
          { key: "compra", label: "Compra", content: (
            <div className="stack">
              <p className="xsmall faint">Atualiza quantidade, preço médio e câmbio médio. Envie o comprovante para preencher os campos (e registrar automaticamente quando tudo confere).</p>
              <BuyTradeForm action={registerBuy} undoAction={undoBuy} tickers={tickers} aiAvailable={!!serverConfig.anthropicApiKey} defaultBroker={transactions.find((t) => t.broker)?.broker ?? positions.find((p) => p.broker)?.broker ?? null} />
            </div>
          ) },
          { key: "venda", label: "Venda", content: (
            <div className="stack">
              <p className="xsmall faint">Venda total ou parcial já executada. Lucro realizado até hoje: <strong className={`num ${tone(realizedUsd)}`}>{usd(realizedUsd)}</strong>.</p>
              {sellReady ? <SellTradeForm action={registerSell} positions={positions.filter((p) => p.quantity > 0).map((p) => ({ ticker: p.ticker, quantity: p.quantity }))} /> : <p className="small muted">Disponível após aplicar a migração 0004 no Supabase.</p>}
            </div>
          ) },
          { key: "provento", label: "Provento", content: <DividendForm action={registerDividend} tickers={tickers} /> },
          { key: "posicao", label: "Corrigir posição", content: (
            <div className="stack">
              <p className="xsmall faint">Substitui a posição do ativo (para importar a carteira atual ou corrigir). O câmbio médio permite separar o retorno cambial.</p>
              <ActionForm action={savePosition} submitLabel="Salvar posição">
                <label>Ticker<input name="ticker" list="pos-tickers" required autoCapitalize="characters" placeholder="NU" /><datalist id="pos-tickers">{tickerOptions}</datalist></label>
                <label>Quantidade<input name="quantity" inputMode="decimal" required /></label>
                <label>Preço médio (US$)<input name="avg_price" inputMode="decimal" required /></label>
                <label>Câmbio médio (R$/US$)<input name="avg_fx_rate" inputMode="decimal" /></label>
                <label>Data da compra<input name="purchase_date" type="date" /></label>
                <label>Corretora<input name="broker" /></label>
                <label>Taxas (US$)<input name="fees" inputMode="decimal" /></label>
                <input type="hidden" name="currency" value="USD" />
              </ActionForm>
            </div>
          ) },
        ]} />
      </section>

      <section className="section">
        <div className="section-head"><h2>Posições</h2></div>
        {positions.length > 0 && (
          <ul className="m-list only-mobile" aria-label="Posições">
            {positions.map((p) => (
              <li key={p.ticker} className="m-row">
                <div className="m-row-top">
                  <Link href={`/ativo/${p.ticker}`} className="m-id"><span className="ticker">{p.ticker}</span><span className="xsmall faint">{p.broker ?? "corretora não informada"}</span></Link>
                  <ActionForm action={deletePosition} submitLabel="Remover" submitClassName="btn btn-sm" className="row" confirm={`Remover o registro de ${p.ticker}? (não vende nada)`}>
                    <input type="hidden" name="ticker" value={p.ticker} />
                  </ActionForm>
                </div>
                <div className="m-row-sub small num">
                  {n(p.quantity, 6)} cotas · PM {usd(p.avg_price, 2)} · câmbio {p.avg_fx_rate ? n(p.avg_fx_rate, 4) : <span className="faint">não informado</span>}
                </div>
                <div className="m-row-sub xsmall faint">{dateBr(p.purchase_date)} · taxas {n(p.fees)} {p.currency}</div>
              </li>
            ))}
          </ul>
        )}
        <div className={`table-wrap${positions.length ? " only-desktop" : ""}`}>
          <table>
            <thead><tr><th>Ativo</th><th className="num">Quantidade</th><th className="num">Preço médio</th><th className="num">Câmbio médio</th><th>Data</th><th>Corretora</th><th className="num">Taxas</th><th>Moeda</th><th /></tr></thead>
            <tbody>
              {positions.length ? positions.map((p) => (
                <tr key={p.ticker}>
                  <td><Link href={`/ativo/${p.ticker}`} className="ticker">{p.ticker}</Link></td>
                  <td className="num">{n(p.quantity, 6)}</td>
                  <td className="num">{usd(p.avg_price, 4)}</td>
                  <td className="num">{p.avg_fx_rate ? n(p.avg_fx_rate, 4) : <span className="faint">não informado</span>}</td>
                  <td>{dateBr(p.purchase_date)}</td>
                  <td>{p.broker ?? "—"}</td>
                  <td className="num">{n(p.fees)}</td>
                  <td>{p.currency}</td>
                  <td>
                    <ActionForm action={deletePosition} submitLabel="Remover" submitClassName="btn btn-sm" className="row" confirm={`Remover o registro de ${p.ticker}? (não vende nada)`}>
                      <input type="hidden" name="ticker" value={p.ticker} />
                    </ActionForm>
                  </td>
                </tr>
              )) : <tr><td colSpan={9} className="empty">Nenhuma posição cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section grid grid-2">
        <div className="card">
          <h3>Proventos e reinvestimento</h3>
          {(() => {
            const pending = dividends.filter((d) => !d.reinvested).reduce((s, d) => s + (d.net_amount ?? d.gross_amount - d.withholding_tax), 0);
            const total = dividends.reduce((s, d) => s + (d.net_amount ?? d.gross_amount - d.withholding_tax), 0);
            return (
              <dl className="kv">
                <dt>Total líquido recebido</dt><dd>{usd(total)}</dd>
                <dt>Dividendos (empresas)</dt><dd>{usd(dividends.filter((d) => d.kind === "dividend").reduce((s, d) => s + (d.net_amount ?? 0), 0))}</dd>
                <dt>Distribuições (ETFs)</dt><dd>{usd(dividends.filter((d) => d.kind === "distribution").reduce((s, d) => s + (d.net_amount ?? 0), 0))}</dd>
                <dt>Reinvestimento potencial (não reinvestido)</dt><dd><strong>{usd(pending)}</strong></dd>
              </dl>
            );
          })()}
          <p className="xsmall faint" style={{ marginTop: 6 }}>Para reinvestir, some este valor ao aporte do mês no painel — o motor distribui conforme a estratégia. Nada é executado automaticamente.</p>
          <div className="divider" />
          <h3>Caixa de oportunidade</h3>
          <ActionForm action={setOpportunityCash} submitLabel="Atualizar saldo" className="row">
            <label>Saldo atual (US$)<input name="balance" inputMode="decimal" defaultValue={cash ?? 0} /></label>
          </ActionForm>
          <p className="xsmall faint" style={{ marginTop: 6 }}>O limite acumulado é definido em Estratégia; ao atingi-lo, o motor distribui todo o aporte.</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Histórico do patrimônio</h2>
          <div className="tabs" style={{ marginBottom: 0, borderBottom: 0 }}>
            {RANGES.map((x) => <Link key={x.key} href={`/carteira?r=${x.key}`} aria-current={x.key === range.key ? "page" : undefined}>{x.key}</Link>)}
          </div>
        </div>
        {snapshots.length >= 2 ? (
          <div className="card stack">
            <div className="grid grid-4">
              <div><div className="kpi-label">Patrimônio US$</div><div className={`num ${tone(usdChange)}`}>{usd(last.total_usd)} ({pct(usdChange, 2, true)})</div></div>
              <div><div className="kpi-label">Patrimônio R$</div><div className={`num ${tone(brlChange)}`}>{brl(last.total_brl)} ({pct(brlChange, 2, true)})</div></div>
              <div><div className="kpi-label">Efeito cambial (USD/BRL)</div><div className={`num ${tone(fxChange)}`}>{pct(fxChange, 2, true)}</div></div>
              <div><div className="kpi-label">Aportes no período (custo)</div><div className="num">{usd(costChange)}</div></div>
            </div>
            <HistoryChart points={snapshots.map((s) => ({ t: s.as_of, usd: s.total_usd, cost: s.cost_usd }))} />
            <p className="xsmall faint">Variação do patrimônio inclui aportes. Performance dos ativos (US$) e efeito cambial são mostrados separadamente.</p>
          </div>
        ) : <div className="card empty">Ainda não há snapshots suficientes. O job diário (cron) grava um snapshot por dia.</div>}
      </section>

      <section className="section grid grid-2">
        <div>
          <div className="section-head"><h2>Transações</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th className="num">Qtd.</th><th className="num">Preço</th><th className="num">Câmbio</th><th className="num">Realizado</th></tr></thead>
              <tbody>{transactions.length ? transactions.map((t, i) => (
                <tr key={t.id ?? i}><td>{dateBr(t.trade_date)}</td><td>{{ buy: "Compra", sell: "Venda", deposit: "Depósito", fee: "Taxa" }[t.kind] ?? t.kind}</td><td>{t.ticker}</td><td className="num">{n(t.quantity, 4)}</td><td className="num">{n(t.price)}</td><td className="num">{n(t.fx_rate, 4)}</td><td className={`num ${tone(t.realized_pnl ?? null)}`}>{t.kind === "sell" ? n(t.realized_pnl ?? null) : ""}</td></tr>
              )) : <tr><td colSpan={7} className="empty">Sem transações.</td></tr>}</tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="section-head"><h2>Proventos</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Pagamento</th><th>Ativo</th><th>Tipo</th><th className="num">Bruto</th><th className="num">IR</th><th className="num">Líquido</th><th>Reinv.</th></tr></thead>
              <tbody>{dividends.length ? dividends.map((d, i) => (
                <tr key={i}><td>{dateBr(d.pay_date)}</td><td>{d.ticker}</td><td>{d.kind === "distribution" ? "Distribuição" : "Dividendo"}</td><td className="num">{n(d.gross_amount)}</td><td className="num">{n(d.withholding_tax)}</td><td className="num">{n(d.net_amount ?? d.gross_amount - d.withholding_tax)}</td><td>{d.reinvested ? "sim" : "não"}</td></tr>
              )) : <tr><td colSpan={7} className="empty">Sem proventos registrados.</td></tr>}</tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
