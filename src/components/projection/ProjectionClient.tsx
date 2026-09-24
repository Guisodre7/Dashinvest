"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { resetAssumptions, runProjection, saveAssumptions, saveRun } from "@/app/(app)/projecao/actions";
import type { ProjectionRunSummary } from "@/lib/db/repo";
import type { ProjectionBundle } from "@/lib/projection/server";
import type { ProjectionForm, ScenarioForm } from "@/lib/projection/settings";
import { INTL_CLASSES, SCENARIO_KEYS, type IntlClass, type ScenarioKey } from "@/lib/projection/types";
import { MonthlyLinesChart } from "./ProjectionCharts";
import { Chips, NumField, Toggle } from "./fields";

const SC: Record<ScenarioKey, { label: string; emoji: string; color: string }> = {
  pessimista: { label: "Pessimista", emoji: "🔴", color: "--neg" },
  moderado: { label: "Moderado", emoji: "🟡", color: "--warn" },
  otimista: { label: "Otimista", emoji: "🟢", color: "--pos" },
};
const CLASS_LABEL: Record<IntlClass, string> = { growth: "Crescimento (META, NVDA, MSFT, AAPL, GOOGL, BRK.B)", jepq: "Renda via opções (JEPQ)", lqd: "Crédito corporativo (LQD)", vnq: "Real estate (VNQ)" };
const HORIZONS = [12, 36, 60, 120, 180, 240];
const SPLITS = [100, 80, 60, 50, 40, 30, 20, 0];
const DISCLAIMER = "Simulação baseada nas premissas selecionadas. Não representa previsão ou garantia de retorno.";

const brl = (v: number | null | undefined, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const pct = (v: number | null | undefined, digits = 1, signed = false) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${signed && v > 0 ? "+" : ""}${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const years = (m: number) => (m % 12 === 0 ? `${m / 12} ano${m === 12 ? "" : "s"}` : `${m} meses`);

function localErrors(f: ProjectionForm): string[] {
  const e: string[] = [];
  if (Math.abs(f.brazilPct + f.exteriorPct - 100) > 0.001) e.push("Brasil + Exterior deve somar 100%.");
  const cw = INTL_CLASSES.reduce((s, c) => s + f.classWeightsPct[c], 0);
  if (Math.abs(cw - 100) > 0.01) e.push(`Pesos das classes internacionais somam ${cw.toFixed(2)}% (devem somar 100%).`);
  if (f.usdBrl <= 0) e.push("USD/BRL deve ser maior que zero.");
  if (f.horizonMonths < 1) e.push("Horizonte deve ser maior que zero.");
  return e;
}

export default function ProjectionClient({
  initialBundle, defaults, runs, prefillNote, hasSaved,
}: {
  initialBundle: ProjectionBundle;
  /** Formulário padrão (defaults + carteira real), usado por "Restaurar premissas padrão". */
  defaults: ProjectionForm;
  runs: ProjectionRunSummary[];
  prefillNote: string[];
  hasSaved: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ProjectionForm>(initialBundle.form);
  const [bundle, setBundle] = useState<ProjectionBundle>(initialBundle);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [breakdownScenario, setBreakdownScenario] = useState<ScenarioKey>("moderado");
  const [runLabel, setRunLabel] = useState("");
  const first = useRef(true);

  const errs = useMemo(() => localErrors(form), [form]);

  // Recalcula no servidor (debounce) sempre que as premissas mudam.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (errs.length) return;
    const id = setTimeout(() => {
      start(async () => {
        const r = await runProjection(form);
        if (r.ok) { setBundle(r.bundle); setErrors([]); } else setErrors(r.errors);
      });
    }, 450);
    return () => clearTimeout(id);
  }, [form, errs.length]);

  const set = <K extends keyof ProjectionForm>(k: K, v: ProjectionForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setScenario = (k: ScenarioKey, field: keyof ScenarioForm, v: number | boolean) =>
    setForm((f) => ({ ...f, scenarios: { ...f.scenarios, [k]: { ...f.scenarios[k], [field]: v } } }));
  const setBrazil = (b: number) => setForm((f) => ({ ...f, brazilPct: b, exteriorPct: Math.round((100 - b) * 10000) / 10000 }));

  const s = bundle.scenarios;
  const f = bundle.form; // premissas efetivamente calculadas
  const H = f.horizonMonths;

  const act = (fn: () => Promise<void>) => start(fn);

  return (
    <div className="stack" style={{ gap: 0 }}>
      {/* ------------------------------------------------------------ Topo */}
      <section className="hero" style={{ display: "block" }}>
        <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="hero-title">Simulador patrimonial</div>
            <h1 style={{ fontSize: 24 }}>PROJEÇÃO PATRIMONIAL</h1>
          </div>
          <span className="xsmall faint">{pending ? "Recalculando no servidor…" : `Calculado às ${new Date(bundle.computedAt).toLocaleTimeString("pt-BR")}`}</span>
        </div>
        <div className="grid grid-3" style={{ marginTop: 14 }}>
          {SCENARIO_KEYS.map((k) => (
            <div key={k} className="card">
              <div className="kpi-label">{SC[k].emoji} {SC[k].label}</div>
              <div className="kpi-value num" style={{ fontSize: 26 }}>{brl(s[k].finalTotalBrl)}</div>
              <div className="kpi-sub num">{usd(s[k].finalTotalUsd)} · poder de compra de hoje {brl(s[k].finalRealBrl)}</div>
            </div>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Após <strong>{years(H)}</strong> · aporte de {brl(f.monthlyContributionBrl)}/mês · {f.brazilPct}% Brasil / {f.exteriorPct}% Exterior</p>
        <p className="xsmall faint" style={{ marginTop: 4 }}>{DISCLAIMER} Premissas configuráveis pelo usuário — não são expectativas de mercado.</p>
      </section>

      {(errs.length > 0 || errors.length > 0) && (
        <div className="banner banner-neg" style={{ marginTop: 12 }}>
          <ul className="clean">{[...errs, ...errors].map((e) => <li key={e}>{e}</li>)}</ul>
          <span className="xsmall">Os resultados abaixo correspondem às últimas premissas válidas.</span>
        </div>
      )}

      {/* ------------------------------------------------------------ Entradas */}
      <section className="section card stack">
        <h2>Configuração</h2>
        <div className="form-grid">
          <NumField label="Patrimônio inicial no Brasil" prefix="R$" value={form.initialBrl} min={0} onChange={(v) => set("initialBrl", v)} />
          <NumField label="Patrimônio inicial no exterior" prefix="US$" value={form.initialUsd} min={0} onChange={(v) => set("initialUsd", v)} />
          <NumField label="VOO — posição legada (sem aportes)" prefix="US$" value={form.initialLegacyUsd} min={0} onChange={(v) => set("initialLegacyUsd", v)} />
          <NumField label="Aporte mensal" prefix="R$" value={form.monthlyContributionBrl} min={0} onChange={(v) => set("monthlyContributionBrl", v)} />
          <NumField label="USD/BRL inicial (R$ por US$1)" value={form.usdBrl} digits={4} min={0.0001} max={100} onChange={(v) => set("usdBrl", v)} />
        </div>
        <p className="xsmall faint">Patrimônios em R$ e US$ não são somados: cada um fica na sua moeda e o total em R$ usa o câmbio de cada mês.</p>
        {prefillNote.length > 0 && <ul className="clean xsmall muted">{prefillNote.map((n) => <li key={n}>{n}</li>)}</ul>}

        <div className="divider" />
        <div className="grid grid-2">
          <div className="stack" style={{ gap: 6 }}>
            <span className="kpi-label">Horizonte</span>
            <Chips options={HORIZONS} value={HORIZONS.includes(form.horizonMonths) ? form.horizonMonths : null} onChange={(v) => set("horizonMonths", v)} format={years} />
            <div className="row"><NumField title="Horizonte personalizado (meses)" value={form.horizonMonths} digits={0} min={1} max={600} suffix="meses" width={150} onChange={(v) => set("horizonMonths", Math.round(v))} /></div>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="kpi-label">Distribuição do aporte — Brasil / Exterior</span>
            <input type="range" min={0} max={100} step={1} value={form.brazilPct} onChange={(e) => setBrazil(Number(e.target.value))} aria-label="Percentual Brasil" />
            <div className="row">
              <NumField title="Brasil %" value={form.brazilPct} min={0} max={100} suffix="% Brasil" width={140} onChange={(v) => setBrazil(v)} />
              <NumField title="Exterior %" value={form.exteriorPct} min={0} max={100} suffix="% Exterior" width={150} onChange={(v) => setBrazil(Math.round((100 - v) * 10000) / 10000)} />
            </div>
            <Chips options={SPLITS} value={SPLITS.includes(form.brazilPct) ? form.brazilPct : null} onChange={setBrazil} format={(b) => `${b}/${100 - b}`} />
          </div>
        </div>

        <div className="divider" />
        <div className="grid grid-2">
          <div className="stack" style={{ gap: 6 }}>
            <span className="kpi-label">Momento do aporte</span>
            <Chips options={["end", "start"] as const} value={form.contributionTiming} onChange={(v) => set("contributionTiming", v)} format={(v) => (v === "end" ? "Final do mês" : "Início do mês")} />
            <span className="kpi-label" style={{ marginTop: 6 }}>Modelo do exterior</span>
            <Chips options={["classes", "single"] as const} value={form.exteriorMode} onChange={(v) => set("exteriorMode", v)} format={(v) => (v === "classes" ? "Por classe (carteira real)" : "Taxa única")} />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <span className="kpi-label">Pesos das classes internacionais (aportes)</span>
            {INTL_CLASSES.map((c) => (
              <div key={c} className="row between small">
                <span className="muted">{CLASS_LABEL[c]}</span>
                <NumField title={CLASS_LABEL[c]} value={form.classWeightsPct[c]} min={0} max={100} suffix="%" width={110}
                  onChange={(v) => set("classWeightsPct", { ...form.classWeightsPct, [c]: v })} />
              </div>
            ))}
            <Toggle label="Distribuir o patrimônio inicial em US$ conforme a carteira atual" checked={form.useCurrentAllocation} onChange={(v) => set("useCurrentAllocation", v)} />
            <span className="xsmall faint">{bundle.usedCurrentSplit ? "Usando a divisão atual da carteira real." : "Usando os pesos-alvo para o patrimônio inicial."} Pesos padrão vêm da página Estratégia.</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Gráfico principal */}
      <section className="section card">
        <div className="section-head"><h2>Evolução mensal do patrimônio (R$)</h2><span className="xsmall faint">{H} meses simulados</span></div>
        <MonthlyLinesChart
          initial={s.moderado.initialCapitalBrl}
          lines={SCENARIO_KEYS.slice().reverse().map((k) => ({ name: SC[k].label, color: SC[k].color, values: s[k].months.map((m) => m.totalBrl) }))}
        />
      </section>

      {/* ------------------------------------------------------------ Aportado x rendimento */}
      <section className="section grid grid-2">
        <div className="card">
          <div className="section-head">
            <h2>Capital aportado × rendimentos</h2>
            <Chips options={SCENARIO_KEYS} value={breakdownScenario} onChange={setBreakdownScenario} format={(k) => SC[k].label} />
          </div>
          <MonthlyLinesChart
            height={260}
            initial={s[breakdownScenario].initialCapitalBrl}
            lines={[
              { name: "Patrimônio", color: SC[breakdownScenario].color, values: s[breakdownScenario].months.map((m) => m.totalBrl), area: true },
              { name: "Capital aportado acumulado", color: "--text-3", values: s[breakdownScenario].months.map((m) => m.contributedBrl), area: true },
            ]}
          />
          <p className="xsmall faint">A área entre as curvas é o rendimento acumulado (valorização + proventos + câmbio).</p>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Composição do patrimônio final</h2>
          <div className="table-wrap" style={{ border: 0 }}>
            <table>
              <thead><tr><th />{SCENARIO_KEYS.map((k) => <th key={k} className="num">{SC[k].emoji} {SC[k].label}</th>)}</tr></thead>
              <tbody>
                <Row label="Patrimônio projetado" values={SCENARIO_KEYS.map((k) => brl(s[k].finalTotalBrl))} strong />
                <Row label="Patrimônio inicial" values={SCENARIO_KEYS.map((k) => brl(s[k].initialCapitalBrl))} />
                <Row label="Aportes" values={SCENARIO_KEYS.map((k) => brl(s[k].contributionsBrl))} />
                <Row label="Rendimento acumulado" values={SCENARIO_KEYS.map((k) => brl(s[k].growthBrl))} strong />
                <Row label="  dos ativos" values={SCENARIO_KEYS.map((k) => brl(s[k].assetGainBrl))} />
                <Row label="  do câmbio" values={SCENARIO_KEYS.map((k) => brl(s[k].fxGainBrl))} />
                <Row label="Em poder de compra de hoje" values={SCENARIO_KEYS.map((k) => brl(s[k].finalRealBrl))} />
                <Row label="Exposição cambial final" values={SCENARIO_KEYS.map((k) => pct(s[k].finalExteriorShare, 0))} />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Efeito cambial */}
      <section className="section card">
        <h2 style={{ marginBottom: 8 }}>Exterior: retorno dos ativos × efeito cambial</h2>
        <div className="grid grid-3">
          {SCENARIO_KEYS.map((k) => (
            <div key={k} className="card card-tight">
              <div className="kpi-label">{SC[k].emoji} {SC[k].label} · {years(H)}</div>
              <dl className="kv" style={{ marginTop: 6 }}>
                <dt>Retorno dos ativos (US$)</dt><dd>{pct(s[k].exteriorAssetReturn, 1, true)}</dd>
                <dt>Efeito cambial</dt><dd>{pct(s[k].fxReturn, 1, true)}</dd>
                <dt><strong>Retorno total em BRL</strong></dt><dd><strong>{pct(s[k].exteriorTotalReturnBrl, 1, true)}</strong></dd>
                <dt>USD/BRL final</dt><dd>{s[k].months[s[k].months.length - 1].fx.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</dd>
              </dl>
            </div>
          ))}
        </div>
        <p className="xsmall faint" style={{ marginTop: 8 }}>Retornos ponderados no tempo (sem efeito dos aportes): (1 + ativos) × (1 + câmbio) − 1 = total em BRL.</p>
      </section>

      {/* ------------------------------------------------------------ Dividendos e renda */}
      <section className="section grid grid-2">
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Dividendos e distribuições</h2>
          <div className="table-wrap" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Ano</th>{SCENARIO_KEYS.map((k) => <th key={k} className="num">{SC[k].label}</th>)}</tr></thead>
              <tbody>
                {[1, 3, 5, 10, 15, 20].filter((y) => y * 12 <= H).map((y) => (
                  <tr key={y}>
                    <td>{y}º ano<div className="xsmall faint">renda mensal equivalente</div></td>
                    {SCENARIO_KEYS.map((k) => {
                      const v = s[k].incomeByYear[y - 1] ?? 0;
                      return <td key={k} className="num">{brl(v)}<div className="xsmall faint">{brl(v / 12)}/mês</div></td>;
                    })}
                  </tr>
                ))}
                <Row label="Total recebido" values={SCENARIO_KEYS.map((k) => brl(s[k].incomeTotalBrl))} />
                <Row label="Reinvestido" values={SCENARIO_KEYS.map((k) => brl(s[k].reinvestedTotalBrl))} />
                <Row label="Não reinvestido (caixa)" values={SCENARIO_KEYS.map((k) => brl(s[k].notReinvestedTotalBrl))} />
              </tbody>
            </table>
          </div>
          <p className="xsmall faint" style={{ marginTop: 6 }}>Proventos fazem parte do retorno total: reinvestidos, não são somados de novo ao patrimônio; não reinvestidos, ficam como caixa (sem rendimento).</p>
        </div>
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Renda patrimonial ao fim do período</h2>
          <div className="grid grid-3">
            {SCENARIO_KEYS.map((k) => (
              <div key={k}>
                <div className="kpi-label">{SC[k].emoji} {SC[k].label}</div>
                <dl className="kv" style={{ marginTop: 6 }}>
                  <dt>Renda anual estimada</dt><dd>{brl(s[k].lastYearIncomeBrl)}</dd>
                  <dt>Renda mensal equivalente</dt><dd>{brl(s[k].lastYearIncomeBrl / 12)}</dd>
                  <dt>Yield s/ patrimônio</dt><dd>{pct(s[k].yieldOnPatrimony, 2)}</dd>
                  <dt>Yield s/ capital aportado</dt><dd>{pct(s[k].yieldOnCapital, 2)}</dd>
                </dl>
              </div>
            ))}
          </div>
          <p className="xsmall faint" style={{ marginTop: 8 }}>Renda dos últimos 12 meses simulados. Yield sobre capital aportado = renda ÷ (patrimônio inicial + aportes).</p>
        </div>
      </section>

      {/* ------------------------------------------------------------ Comparador de aportes */}
      <section className="section grid grid-2">
        <div>
          <div className="section-head"><h2>Quanto o aporte muda meu futuro?</h2><span className="xsmall faint">{years(H)}</span></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Aporte mensal</th><th className="num">Total aportado</th>{SCENARIO_KEYS.map((k) => <th key={k} className="num">{SC[k].label}</th>)}</tr></thead>
              <tbody>
                {bundle.contributions.map((c) => (
                  <tr key={c.amount} style={c.amount === f.monthlyContributionBrl ? { background: "var(--accent-soft)" } : undefined}>
                    <td>{brl(c.amount)}{c.amount === f.monthlyContributionBrl && <span className="xsmall faint"> (atual)</span>}</td>
                    <td className="num">{brl(c.contributions)}</td>
                    {SCENARIO_KEYS.map((k) => <td key={k} className="num">{brl(c.final[k])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="section-head"><h2>E se eu investir R$ 1.000 a mais por mês?</h2></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Horizonte</th><th className="num">Aportado a mais</th>{SCENARIO_KEYS.map((k) => <th key={k} className="num">{SC[k].label}</th>)}</tr></thead>
              <tbody>
                {bundle.extra.map((e) => (
                  <tr key={e.months}>
                    <td>{years(e.months)}</td>
                    <td className="num">{brl(e.extraContributed)}</td>
                    {SCENARIO_KEYS.map((k) => <td key={k} className="num">+{brl(e.delta[k])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="xsmall faint" style={{ marginTop: 6 }}>Diferença no patrimônio final em cada cenário, com as demais premissas iguais.</p>
        </div>
      </section>

      {/* ------------------------------------------------------------ Brasil x exterior */}
      <section className="section">
        <div className="section-head"><h2>Comparador Brasil × Exterior</h2><span className="xsmall faint">cenário moderado · {years(H)}</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Estratégia</th><th className="num">Aporte total</th><th className="num">Patrimônio projetado</th><th className="num">Renda anual</th><th className="num">Exposição cambial final</th><th className="num">Efeito do câmbio</th><th>Risco assumido</th></tr></thead>
            <tbody>
              {bundle.allocations.map((a) => {
                const b = Math.round(a.brazilShare * 100);
                return (
                  <tr key={b} style={b === Math.round(f.brazilPct) ? { background: "var(--accent-soft)" } : undefined}>
                    <td>{b}% Brasil / {100 - b}% Exterior{b === Math.round(f.brazilPct) && <span className="xsmall faint"> (atual)</span>}</td>
                    <td className="num">{brl(a.contributions)}</td>
                    <td className="num">{brl(a.final)}</td>
                    <td className="num">{brl(a.annualIncome)}</td>
                    <td className="num">{pct(a.exteriorShareFinal, 0)}</td>
                    <td className="num">{brl(a.fxGain)}</td>
                    <td className="small muted">{a.exteriorShareFinal > 0.6 ? "alta exposição ao dólar e a renda variável americana" : a.exteriorShareFinal > 0.25 ? "exposição mista a Brasil e dólar" : "concentração em ativos e moeda do Brasil"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="xsmall faint" style={{ marginTop: 6 }}>
          Com estas premissas (moderado: Brasil {f.scenarios.moderado.brazilRet}% a.a., exterior {f.exteriorMode === "single" ? `${f.scenarios.moderado.exteriorRet}% a.a.` : "por classe"}, dólar {f.scenarios.moderado.fxChange}% a.a.), cada estratégia apresentou o patrimônio projetado acima. A comparação não indica qual estratégia é melhor — o resultado depende inteiramente das premissas.
        </p>
      </section>

      {/* ------------------------------------------------------------ Sensibilidade */}
      <section className="section">
        <div className="section-head"><h2>O que mais influencia meu patrimônio?</h2><span className="xsmall faint">cenário moderado · uma premissa por vez</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Premissa</th><th>De</th><th>Para</th><th className="num">Patrimônio final</th><th className="num">Impacto</th></tr></thead>
            <tbody>
              {[...bundle.sensitivity].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map((r) => (
                <tr key={r.key}>
                  <td>{r.label}{r.note && <div className="xsmall faint">{r.note}</div>}</td>
                  <td className="small">{r.from}</td>
                  <td className="small">{r.to}</td>
                  <td className="num">{brl(r.final)}</td>
                  <td className={`num ${r.delta > 0 ? "pos" : r.delta < 0 ? "neg" : ""}`}>{r.delta >= 0 ? "+" : ""}{brl(r.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------------ Stress test */}
      <section className="section card stack">
        <div className="section-head"><h2>Stress test — e se o mercado cair logo após eu começar?</h2></div>
        <div className="row-wrap" style={{ alignItems: "flex-end", gap: 16 }}>
          <div className="stack" style={{ gap: 4 }}>
            <span className="kpi-label">Queda inicial da bolsa</span>
            <Chips options={[10, 20, 30, 40]} value={[10, 20, 30, 40].includes(form.stress.dropPct) ? form.stress.dropPct : null} onChange={(v) => set("stress", { ...form.stress, dropPct: v })} format={(v) => `-${v}%`} />
          </div>
          <NumField label="Queda (%)" value={form.stress.dropPct} min={1} max={90} width={100} onChange={(v) => set("stress", { ...form.stress, dropPct: v })} />
          <NumField label="Meses até o fundo" value={form.stress.dropMonths} digits={0} min={1} max={60} width={100} onChange={(v) => set("stress", { ...form.stress, dropMonths: Math.round(v) })} />
          <NumField label="Meses de recuperação (0 = sem recuperação)" value={form.stress.recoveryMonths} digits={0} min={0} max={240} width={120} onChange={(v) => set("stress", { ...form.stress, recoveryMonths: Math.round(v) })} />
          <label>Cenário base
            <select value={form.stress.scenario} onChange={(e) => set("stress", { ...form.stress, scenario: e.target.value as ScenarioKey })}>
              {SCENARIO_KEYS.map((k) => <option key={k} value={k}>{SC[k].label}</option>)}
            </select>
          </label>
          <Toggle label="Aplicar a queda também ao Brasil" checked={form.stress.includeBrazil} onChange={(v) => set("stress", { ...form.stress, includeBrazil: v })} />
        </div>
        <p className="xsmall faint">A queda atinge Crescimento, JEPQ, VNQ e VOO{form.stress.includeBrazil ? " e a parcela Brasil" : ""}; LQD não é afetado pelo choque. A recuperação é uma premissa — não afirma que toda queda será seguida de recuperação.</p>
        <div className="grid grid-4">
          <Kpi label="Queda do mercado (premissa)" value={`-${(bundle.stress.marketDrop * 100).toFixed(0)}%`} />
          <Kpi label="Queda máxima do patrimônio" value={pct(bundle.stress.maxDrawdown, 1)} sub={bundle.stress.maxDrawdown === 0 ? "os aportes superaram a queda — veja o impacto vs sem queda" : "pico → vale, aportes incluídos"} />
          <Kpi label="Patrimônio no fundo" value={brl(bundle.stress.patrimonyAtBottom)} sub={`mês ${bundle.stress.bottomMonth} · ${pct(bundle.stress.vsBaseAtMarketBottom, 1, true)} vs sem queda`} />
          <Kpi label="Tempo para recuperar" value={bundle.stress.monthsToRecover === null ? "Não recuperou no horizonte" : bundle.stress.maxDrawdown === 0 ? "Sem queda do total" : `${bundle.stress.monthsToRecover} meses`} sub={bundle.stress.indexRecoveryMonths ? `índice volta em ${bundle.stress.indexRecoveryMonths} meses (premissa)` : "sem recuperação do índice"} />
          <Kpi label="Patrimônio no final" value={brl(bundle.stress.finalPatrimony)} sub={`${bundle.stress.vsBase >= 0 ? "+" : ""}${brl(bundle.stress.vsBase)} vs sem queda`} />
          <Kpi label="Aportado durante a queda" value={brl(bundle.stress.contributedDuringDrop)} sub={`+ ${brl(bundle.stress.contributedDuringRecovery)} na recuperação`} />
          <Kpi label="Preço médio pago na crise" value={bundle.stress.avgPriceLevelOfShockContributions === null ? "—" : pct(bundle.stress.avgPriceLevelOfShockContributions - 1, 1, true)} sub="vs nível pré-queda (ativos atingidos)" />
          <Kpi label="Efeito de continuar aportando" value={`${bundle.stress.keepContributingGain >= 0 ? "+" : ""}${brl(bundle.stress.keepContributingGain)}`} sub="ganho extra dos aportes feitos na crise vs pausar" />
        </div>
        <MonthlyLinesChart
          height={260}
          lines={[
            { name: "Sem queda", color: "--text-3", values: bundle.stress.series.map((x) => x.base), dashed: true },
            { name: "Com queda, continuando a aportar", color: "--accent", values: bundle.stress.series.map((x) => x.stressed) },
            { name: "Com queda, pausando aportes na crise", color: "--neg", values: bundle.stress.series.map((x) => x.paused) },
          ]}
        />
        <p className="xsmall faint">Na simulação, os aportes feitos durante a queda compram os ativos atingidos a preços menores; se a recuperação configurada acontecer, essas cotas valorizam mais. Isso depende da premissa de recuperação.</p>
      </section>

      {/* ------------------------------------------------------------ Premissas */}
      <section className="section card stack">
        <div className="section-head">
          <h2>Premissas</h2>
          <span className="xsmall faint">Premissas configuráveis pelo usuário · % a.a.</span>
        </div>
        <div className="table-wrap" style={{ border: 0 }}>
          <table>
            <thead><tr><th>Premissa</th>{SCENARIO_KEYS.map((k) => <th key={k}>{SC[k].emoji} {SC[k].label}</th>)}</tr></thead>
            <tbody>
              {ASSUMPTION_ROWS.filter((r) => !r.mode || r.mode === form.exteriorMode).map((r) => (
                <tr key={r.field}>
                  <td className="small">{r.label}{r.hint && <div className="xsmall faint">{r.hint}</div>}</td>
                  {SCENARIO_KEYS.map((k) => (
                    <td key={k}>
                      <NumField title={`${r.label} — ${SC[k].label}`} value={form.scenarios[k][r.field] as number} min={r.min} max={r.max} suffix="%" width={110}
                        onChange={(v) => setScenario(k, r.field, v)} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="small">Reinvestir dividendos/distribuições</td>
                {SCENARIO_KEYS.map((k) => (
                  <td key={k}><Toggle label={form.scenarios[k].reinvest ? "SIM" : "NÃO"} checked={form.scenarios[k].reinvest} onChange={(v) => setScenario(k, "reinvest", v)} /></td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="xsmall faint">Retorno = retorno TOTAL anual (valorização + proventos). Yield = parte do retorno paga como dividendo/distribuição. Taxa mensal equivalente: (1 + anual)^(1/12) − 1.</p>
        <div className="row-wrap">
          <button type="button" className="btn btn-primary btn-sm" disabled={pending || errs.length > 0} onClick={() => act(async () => {
            const r = await saveAssumptions(form);
            if (r.ok) { setBundle(r.bundle); setErrors([]); setMessage(r.message ?? "Salvo."); } else setErrors(r.errors);
          })}>Salvar premissas</button>
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => {
            if (!window.confirm("Restaurar todas as premissas padrão? As premissas salvas serão apagadas.")) return;
            act(async () => {
              const r = await resetAssumptions();
              setMessage(r.message);
              if (r.ok) {
                setForm(structuredClone(defaults));
                router.refresh();
              }
            });
          }}>Restaurar premissas padrão</button>
          <input placeholder="Nome da simulação (opcional)" value={runLabel} onChange={(e) => setRunLabel(e.target.value)} style={{ minWidth: 220 }} />
          <button type="button" className="btn btn-sm" disabled={pending || errs.length > 0} onClick={() => act(async () => {
            const r = await saveRun(form, runLabel);
            setMessage(r.message);
            if (r.ok) { setRunLabel(""); router.refresh(); }
          })}>Salvar simulação</button>
          {message && <span className="small muted">{message}</span>}
          {!hasSaved && <span className="xsmall faint">Usando premissas padrão.</span>}
        </div>
        {runs.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Simulação salva</th><th>Data</th><th className="num">Horizonte</th><th className="num">Aporte</th>{SCENARIO_KEYS.map((k) => <th key={k} className="num">{SC[k].label}</th>)}</tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label ?? "—"}</td>
                    <td className="small">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                    <td className="num">{years(r.horizon_months)}</td>
                    <td className="num">{brl(r.monthly_contribution_brl)}</td>
                    {SCENARIO_KEYS.map((k) => <td key={k} className="num">{brl(r.final[k])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ Resumo */}
      <section className="section card stack">
        <h2>Resumo da projeção</h2>
        <p>
          Com aporte mensal de <strong>{brl(f.monthlyContributionBrl)}</strong> e distribuição de <strong>{f.brazilPct}% Brasil / {f.exteriorPct}% Exterior</strong>,
          o patrimônio projetado em {years(H)} varia entre <strong>{brl(s.pessimista.finalTotalBrl)}</strong> e <strong>{brl(s.otimista.finalTotalBrl)}</strong> conforme as premissas selecionadas
          (moderado: {brl(s.moderado.finalTotalBrl)}).
        </p>
        <p>
          No cenário moderado, do patrimônio projetado, <strong>{brl(s.moderado.initialCapitalBrl + s.moderado.contributionsBrl)}</strong> corresponde a capital (patrimônio inicial + aportes)
          e <strong>{brl(s.moderado.growthBrl)}</strong> corresponde ao crescimento estimado ({brl(s.moderado.assetGainBrl)} dos ativos e {brl(s.moderado.fxGainBrl)} do câmbio).
        </p>
        <div className="divider" />
        <div className="xsmall muted">
          <strong>Premissas utilizadas:</strong> patrimônio inicial {brl(f.initialBrl)} no Brasil + {usd(f.initialUsd)} no exterior + {usd(f.initialLegacyUsd)} em VOO (legado, sem aportes);
          USD/BRL inicial {f.usdBrl.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}; aporte no {f.contributionTiming === "end" ? "final" : "início"} do mês;
          exterior {f.exteriorMode === "classes" ? `por classe (crescimento ${f.classWeightsPct.growth}%, JEPQ ${f.classWeightsPct.jepq}%, LQD ${f.classWeightsPct.lqd}%, VNQ ${f.classWeightsPct.vnq}%)` : "com taxa única"}.
          {SCENARIO_KEYS.map((k) => {
            const x = f.scenarios[k];
            return (
              <span key={k}> {SC[k].label}: Brasil {x.brazilRet}% (yield {x.brazilYield}%){f.exteriorMode === "single" ? `, exterior ${x.exteriorRet}% (yield ${x.exteriorYield}%)` : `, crescimento ${x.growthRet}%, JEPQ ${x.jepqRet}%, LQD ${x.lqdRet}%, VNQ ${x.vnqRet}%, VOO ${x.legacyRet}%`}, dólar {x.fxChange}% a.a., inflação {x.inflation}%, {x.reinvest ? "reinvestindo" : "sem reinvestir"} proventos.</span>
            );
          })}
        </div>
        <p className="xsmall faint">{DISCLAIMER}</p>
      </section>
    </div>
  );
}

function Row({ label, values, strong }: { label: string; values: string[]; strong?: boolean }) {
  return (
    <tr>
      <td className="small" style={{ whiteSpace: "pre" }}>{strong ? <strong>{label}</strong> : label}</td>
      {values.map((v, i) => <td key={i} className="num">{strong ? <strong>{v}</strong> : v}</td>)}
    </tr>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card card-tight">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value num" style={{ fontSize: 18 }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

const ASSUMPTION_ROWS: { field: keyof ScenarioForm; label: string; hint?: string; min: number; max: number; mode?: "classes" | "single" }[] = [
  { field: "brazilRet", label: "Brasil — retorno total", min: -50, max: 50 },
  { field: "brazilYield", label: "Brasil — dividend yield", min: 0, max: 30 },
  { field: "exteriorRet", label: "Exterior — retorno total (taxa única)", min: -50, max: 50, mode: "single" },
  { field: "exteriorYield", label: "Exterior — yield (taxa única)", min: 0, max: 30, mode: "single" },
  { field: "growthRet", label: "Growth equities — retorno total", hint: "META, NVDA, MSFT, AAPL, GOOGL, BRK.B", min: -50, max: 50, mode: "classes" },
  { field: "growthYield", label: "Growth — dividend yield", min: 0, max: 30, mode: "classes" },
  { field: "jepqRet", label: "JEPQ — retorno total", min: -50, max: 50, mode: "classes" },
  { field: "jepqYield", label: "JEPQ — distribution yield", min: 0, max: 30, mode: "classes" },
  { field: "lqdRet", label: "LQD — retorno total", min: -50, max: 50, mode: "classes" },
  { field: "lqdYield", label: "LQD — yield", min: 0, max: 30, mode: "classes" },
  { field: "vnqRet", label: "VNQ — retorno total", min: -50, max: 50, mode: "classes" },
  { field: "vnqYield", label: "VNQ — dividend yield", min: 0, max: 30, mode: "classes" },
  { field: "legacyRet", label: "VOO (legado) — retorno total", min: -50, max: 50, mode: "classes" },
  { field: "legacyYield", label: "VOO (legado) — dividend yield", min: 0, max: 30, mode: "classes" },
  { field: "fxChange", label: "Câmbio — variação anual do dólar", hint: "+ = dólar valoriza frente ao real", min: -50, max: 50 },
  { field: "inflation", label: "Inflação (BRL)", hint: "para valores em poder de compra de hoje", min: -10, max: 100 },
];
