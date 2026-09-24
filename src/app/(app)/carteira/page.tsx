import Link from "next/link";
import ActionForm from "@/components/ActionForm";
import HistoryChart from "@/components/HistoryChart";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { brl, dateBr, n, pct, tone, usd } from "@/lib/format";
import { deletePosition, registerBuy, registerDividend, savePosition, setOpportunityCash } from "./actions";

const RANGES = [
  { key: "1S", days: 7 }, { key: "1M", days: 30 }, { key: "3M", days: 90 },
  { key: "6M", days: 180 }, { key: "1A", days: 365 }, { key: "Início", days: null },
] as const;

export default async function CarteiraPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const { r } = await searchParams;
  const range = RANGES.find((x) => x.key === r) ?? RANGES[2];
  const [positions, assets, transactions, dividends, snapshots, cash] = await Promise.all([
    repo.getPositions(), repo.getAssets(), repo.getTransactions(50), repo.getDividends(),
    repo.getSnapshots(range.days), repo.getSetting<number>("opportunity_cash_balance"),
  ]);
  const tickers = assets.map((a) => a.ticker);
  const tickerOptions = tickers.map((t) => <option key={t} value={t}>{t}</option>);

  const first = snapshots[0], last = snapshots[snapshots.length - 1];
  const usdChange = first && last ? (last.total_usd / first.total_usd - 1) * 100 : null;
  const brlChange = first?.total_brl && last?.total_brl ? (last.total_brl / first.total_brl - 1) * 100 : null;
  const fxChange = first?.usd_brl && last?.usd_brl ? (last.usd_brl / first.usd_brl - 1) * 100 : null;
  // Aportes no período distorcem a variação do patrimônio — mostramos também o custo.
  const costChange = first && last ? last.cost_usd - first.cost_usd : null;

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero"><div><h1>Carteira</h1><p className="muted small">Cadastro de posições, compras e proventos. Nenhuma ordem é enviada a corretoras e nenhuma credencial é armazenada.</p></div></section>

      <section className="section">
        <div className="section-head"><h2>Posições</h2></div>
        <div className="table-wrap">
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
                    <ActionForm action={deletePosition} submitLabel="Remover" className="row" confirm={`Remover o registro de ${p.ticker}? (não vende nada)`}>
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
          <h3>Cadastrar / corrigir posição</h3>
          <p className="xsmall faint" style={{ marginBottom: 8 }}>Substitui a posição do ativo. Use para importar a carteira atual. O câmbio médio (R$/US$) permite separar retorno cambial.</p>
          <ActionForm action={savePosition} submitLabel="Salvar posição">
            <label>Ticker<select name="ticker" required>{tickerOptions}</select></label>
            <label>Quantidade<input name="quantity" inputMode="decimal" required /></label>
            <label>Preço médio (US$)<input name="avg_price" inputMode="decimal" required /></label>
            <label>Câmbio médio (R$/US$)<input name="avg_fx_rate" inputMode="decimal" /></label>
            <label>Data da compra<input name="purchase_date" type="date" /></label>
            <label>Corretora<input name="broker" /></label>
            <label>Taxas (US$)<input name="fees" inputMode="decimal" /></label>
            <label>Moeda<select name="currency" defaultValue="USD"><option>USD</option></select></label>
          </ActionForm>
        </div>
        <div className="card">
          <h3>Registrar compra (aporte)</h3>
          <p className="xsmall faint" style={{ marginBottom: 8 }}>Atualiza quantidade, preço médio e câmbio médio automaticamente.</p>
          <ActionForm action={registerBuy} submitLabel="Registrar compra">
            <label>Ticker<select name="ticker" required>{tickerOptions}</select></label>
            <label>Quantidade<input name="quantity" inputMode="decimal" required /></label>
            <label>Preço (US$)<input name="price" inputMode="decimal" required /></label>
            <label>Câmbio (R$/US$)<input name="fx_rate" inputMode="decimal" /></label>
            <label>Data<input name="trade_date" type="date" /></label>
            <label>Taxas (US$)<input name="fees" inputMode="decimal" /></label>
            <label>Corretora<input name="broker" /></label>
            <label>Observação<input name="notes" /></label>
          </ActionForm>
        </div>
      </section>

      <section className="section grid grid-2">
        <div className="card">
          <h3>Registrar dividendo / distribuição</h3>
          <ActionForm action={registerDividend} submitLabel="Registrar provento">
            <label>Ticker<select name="ticker" required>{tickerOptions}</select></label>
            <label>Tipo<select name="kind"><option value="dividend">Dividendo (empresa)</option><option value="distribution">Distribuição (ETF)</option></select></label>
            <label>Valor bruto (US$)<input name="gross_amount" inputMode="decimal" required /></label>
            <label>Imposto retido (US$)<input name="withholding_tax" inputMode="decimal" /></label>
            <label>Por cota (US$)<input name="amount_per_share" inputMode="decimal" /></label>
            <label>Cotas<input name="quantity" inputMode="decimal" /></label>
            <label>Data ex<input name="ex_date" type="date" /></label>
            <label>Pagamento<input name="pay_date" type="date" /></label>
            <label style={{ flexDirection: "row", alignItems: "center" }}><input type="checkbox" name="reinvested" /> Reinvestido</label>
          </ActionForm>
        </div>
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
              <thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th className="num">Qtd.</th><th className="num">Preço</th><th className="num">Câmbio</th></tr></thead>
              <tbody>{transactions.length ? transactions.map((t, i) => (
                <tr key={t.id ?? i}><td>{dateBr(t.trade_date)}</td><td>{t.kind}</td><td>{t.ticker}</td><td className="num">{n(t.quantity, 4)}</td><td className="num">{n(t.price)}</td><td className="num">{n(t.fx_rate, 4)}</td></tr>
              )) : <tr><td colSpan={6} className="empty">Sem transações.</td></tr>}</tbody>
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
