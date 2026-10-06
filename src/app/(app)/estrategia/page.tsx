import ActionForm from "@/components/ActionForm";
import { FACTOR_KEYS, FACTOR_LABELS } from "@/lib/analysis/settings";
import { requireUser } from "@/lib/auth";
import { getRepo } from "@/lib/db/repo";
import { n, pct, tone, usd } from "@/lib/format";
import { saveEngineSettings, saveStrategy, saveStrategyClasses } from "./actions";
import ClassRow from "@/components/ClassRow";
import { loadContext, loadSettings } from "@/lib/data/load";

export default async function EstrategiaPage() {
  const user = await requireUser();
  const repo = await getRepo(user.id);
  const [strategy, settings, assets, defaultContribution] = await Promise.all([
    repo.getStrategy(), loadSettings(repo), repo.getAssets(), repo.getSetting<number>("default_contribution"),
  ]);
  const sum = strategy.filter((s) => s.enabled && !s.is_legacy).reduce((a, s) => a + s.target_weight, 0);
  const names = new Map(assets.map((a) => [a.ticker, a.name]));
  const ctx = await loadContext(user);
  // Classes = buckets da estratégia (ordem pela prioridade); legado em linha própria.
  const active = strategy.filter((s) => s.enabled && !s.is_legacy);
  const buckets = [...new Set(active.sort((a, b) => a.priority - b.priority).map((s) => s.strategy_bucket))];
  const classRows = buckets.map((b) => {
    const list = active.filter((s) => s.strategy_bucket === b);
    return { name: b, pct: Math.round(list.reduce((a, s) => a + s.target_weight, 0) * 100) / 100, tickers: list.map((s) => s.ticker).join(", ") };
  });
  const rows = [...classRows, { name: "", pct: 0, tickers: "" }, { name: "", pct: 0, tickers: "" }];
  const legacy = strategy.filter((s) => s.is_legacy).map((s) => s.ticker).join(", ");
  const held = new Set(ctx.portfolio.positions.filter((p) => p.quantity > 0).map((p) => p.ticker));
  const watch = active.filter((s) => !held.has(s.ticker));

  return (
    <div className="stack" style={{ gap: 0 }}>
      <section className="hero"><div><div className="hero-title">🇺🇸 Carteira Internacional</div><h1>Estratégia</h1></div></section>

      <section className="section grid grid-2">
        <div>
          <div className="section-head"><h2>Acompanhamento</h2><span className="xsmall faint">ativos da estratégia sem posição</span></div>
          <div className="card stack small">
            {watch.length === 0 ? <span className="faint">Todos os ativos da estratégia já estão na carteira.</span> : watch.map((s) => {
              const q = ctx.quotes[s.ticker];
              return (
                <div key={s.ticker} className="row-between">
                  <span><strong>{s.ticker}</strong> <span className="faint xsmall">{names.get(s.ticker) ?? ""} · {s.strategy_bucket}</span></span>
                  <span className="num">{q?.price != null ? <>{usd(q.price)} <span className={`xsmall ${tone(q.change_pct)}`}>{pct(q.change_pct, 2, true)}</span></> : <span className="xsmall faint">sem cotação</span>}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="section-head"><h2>Estratégia Internacional</h2></div>
          <div className="card">
            <ActionForm action={saveStrategyClasses} submitLabel="Salvar estratégia" className="stack">
              <input type="hidden" name="rows" value={rows.length} />
              <div className="class-head"><span>Classe</span><span>Meta</span><span>Ativos</span></div>
              {rows.map((r, i) => <ClassRow key={i} name={r.name} nameField={`cls_name_${i}`} pctField={`cls_pct_${i}`} pct={r.pct || null} listField={`cls_tickers_${i}`} list={r.tickers} />)}
              <ClassRow name="Legado (fora dos aportes)" listField="legacy" list={legacy} />
            </ActionForm>
            <p className="xsmall faint" style={{ marginTop: 6 }}>Para adicionar um ativo, escreva o ticker na classe (ex.: NU em CRESCIMENTO) — ele é conferido na NYSE/Nasdaq e cadastrado. Para tirar, apague. Use as linhas vazias para criar uma classe. A soma das classes deve ser 100%; a meta de cada ativo é a da classe dividida pelo nº de ativos. Legado é monitorado, não recebe aportes e nunca tem venda sugerida.</p>
          </div>
        </div>
      </section>

      <details className="section">
        <summary className="muted small" style={{ cursor: "pointer" }}>Ajuste fino por ativo (peso, mínimo, máximo, prioridade)</summary>
      <section className="section">
        <div className="section-head"><h2>Carteira estratégica</h2><span className={`small ${Math.abs(sum - 100) > 0.05 ? "neg" : "muted"}`}>Soma dos pesos ativos: {n(sum, 2)}%</span></div>
        <ActionForm action={saveStrategy} submitLabel="Salvar ajuste fino" className="stack">
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

      </details>

      <details className="section">
        <summary className="muted small" style={{ cursor: "pointer" }}>Regras do motor de alocação e pesos do Opportunity Score</summary>
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
      </details>
    </div>
  );
}
