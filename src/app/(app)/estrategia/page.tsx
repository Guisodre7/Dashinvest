import ActionForm from "@/components/ActionForm";
import { FACTOR_KEYS, FACTOR_LABELS } from "@/lib/analysis/settings";
import { requireUser } from "@/lib/auth";
import { loadSettings } from "@/lib/data/load";
import { getRepo } from "@/lib/db/repo";
import { n } from "@/lib/format";
import { addAsset, saveEngineSettings, saveStrategy } from "./actions";

export default async function EstrategiaPage() {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const [strategy, settings, assets, defaultContribution] = await Promise.all([
    repo.getStrategy(), loadSettings(repo), repo.getAssets(), repo.getSetting<number>("default_contribution"),
  ]);
  const sum = strategy.filter((s) => s.enabled && !s.is_legacy).reduce((a, s) => a + s.target_weight, 0);
  const names = new Map(assets.map((a) => [a.ticker, a.name]));

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero"><div><h1>Estratégia</h1><p className="muted small">Pesos-alvo e regras do motor de alocação. Nada aqui está fixo no código do frontend.</p></div></section>

      <section className="section">
        <div className="section-head"><h2>Carteira estratégica</h2><span className={`small ${Math.abs(sum - 100) > 0.05 ? "neg" : "muted"}`}>Soma dos pesos ativos: {n(sum, 2)}%</span></div>
        <ActionForm action={saveStrategy} submitLabel="Salvar estratégia" className="stack">
          <input type="hidden" name="tickers" value={strategy.map((s) => s.ticker).join(",")} />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ativo</th><th>Bucket</th><th className="num">Peso-alvo %</th><th className="num">Mín %</th><th className="num">Máx %</th><th className="num">Prioridade</th><th>Ativo</th><th>Recebe aportes</th><th>Legado</th></tr></thead>
              <tbody>
                {strategy.map((s) => (
                  <tr key={s.ticker}>
                    <td><span className="ticker">{s.ticker}</span><div className="xsmall faint">{names.get(s.ticker) ?? ""}{s.is_legacy ? ` · ${s.legacy_label}` : ""}</div></td>
                    <td><input name={`bucket_${s.ticker}`} defaultValue={s.strategy_bucket} style={{ width: 170 }} /></td>
                    <td className="num"><input name={`target_${s.ticker}`} defaultValue={Number(s.target_weight.toFixed(6))} inputMode="decimal" style={{ width: 100, textAlign: "right" }} /></td>
                    <td className="num"><input name={`min_${s.ticker}`} defaultValue={s.min_weight ?? ""} inputMode="decimal" style={{ width: 70, textAlign: "right" }} /></td>
                    <td className="num"><input name={`max_${s.ticker}`} defaultValue={s.max_weight ?? ""} inputMode="decimal" style={{ width: 70, textAlign: "right" }} /></td>
                    <td className="num"><input name={`priority_${s.ticker}`} defaultValue={s.priority} inputMode="numeric" style={{ width: 60, textAlign: "right" }} /></td>
                    <td><input type="checkbox" name={`enabled_${s.ticker}`} defaultChecked={s.enabled} /></td>
                    <td><input type="checkbox" name={`contrib_${s.ticker}`} defaultChecked={s.accepts_contributions} /></td>
                    <td><input type="checkbox" name={`legacy_${s.ticker}`} defaultChecked={s.is_legacy} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="xsmall faint">Posições legadas (ex.: VOO — Anchor) são monitoradas, não recebem aportes e nunca têm venda sugerida. Peso acima do máximo é corrigido apenas pelos novos aportes.</p>
        </ActionForm>
      </section>

      <section className="section card">
        <h3>Adicionar ativo</h3>
        <ActionForm action={addAsset} submitLabel="Adicionar">
          <label>Ticker<input name="ticker" required placeholder="ex.: AMZN" /></label>
          <label>Nome<input name="name" /></label>
          <label>Tipo<select name="asset_type"><option value="stock">Ação</option><option value="etf">ETF</option></select></label>
          <label>Bucket<input name="bucket" placeholder="CRESCIMENTO" /></label>
        </ActionForm>
      </section>

      <section className="section">
        <div className="section-head"><h2>Motor de alocação</h2></div>
        <ActionForm action={saveEngineSettings} submitLabel="Salvar configurações" className="stack">
          <div className="card">
            <h3>Pesos do Opportunity Score</h3>
            <p className="xsmall faint" style={{ marginBottom: 8 }}>Pesos relativos (normalizados). Zero desativa o fator.</p>
            <div className="form-grid">
              {FACTOR_KEYS.map((k) => <label key={k}>{FACTOR_LABELS[k]}<input name={`w_${k}`} defaultValue={settings.weights[k]} inputMode="decimal" /></label>)}
            </div>
          </div>
          <div className="card">
            <h3>Regras</h3>
            <div className="form-grid">
              <label>Aporte padrão (US$)<input name="default_contribution" defaultValue={defaultContribution ?? 550} inputMode="decimal" /></label>
              <label>Caixa de oportunidade máx. (% do aporte)<input name="maxOpportunityCashPct" defaultValue={settings.maxOpportunityCashPct * 100} inputMode="decimal" /></label>
              <label>Saldo máx. de caixa (nº de aportes)<input name="maxOpportunityCashContributions" defaultValue={settings.maxOpportunityCashContributions} inputMode="decimal" /></label>
              <label>Ordem mínima (US$)<input name="minOrderUsd" defaultValue={settings.minOrderUsd} inputMode="decimal" /></label>
              <label>Cautela antes de earnings (dias)<input name="earningsCautionDays" defaultValue={settings.earningsCautionDays} inputMode="numeric" /></label>
              <label>Data quality mínima (%)<input name="minDataQuality" defaultValue={settings.minDataQuality} inputMode="decimal" /></label>
              <label>Anti-FOMO: alta em 30 dias (%)<input name="fomo1mPct" defaultValue={settings.fomo1mPct} inputMode="decimal" /></label>
              <label>Anti-FOMO: alta em ~60 dias (%)<input name="fomo60dPct" defaultValue={settings.fomo60dPct} inputMode="decimal" /></label>
            </div>
            <p className="xsmall faint" style={{ marginTop: 8 }}>Idade máxima das cotações (MAX_MARKET_DATA_AGE) é configurada por variável de ambiente no servidor.</p>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
