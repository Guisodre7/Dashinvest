import type { AllocationResult } from "@/lib/analysis/allocation";
import { brl, n, pct, usd } from "@/lib/format";

const ACTION_CLS: Record<string, string> = { COMPRAR: "badge badge-pos", "APORTE NORMAL": "badge badge-accent", AGUARDAR: "badge" };
const PRIORITY_CLS: Record<string, string> = { ALTA: "badge badge-pos", "MÉDIA": "badge", BAIXA: "badge" };

/** Resultado do aporte: só os ativos que recebem (prioridade média ou alta). Os demais ficam em "Onde aportar". */
export default function AllocationView({ result, cur = "US$" }: { result: AllocationResult; cur?: "US$" | "R$" }) {
  const money = cur === "R$" ? brl : usd;
  const buying = result.lines.filter((l) => l.amount > 0);
  const waiting = result.lines.length - buying.length;
  if (result.blocked) {
    return (
      <div className="stack">
        <div className="banner banner-neg">
          <strong>Recomendação automática bloqueada.</strong>
          <ul className="clean">{result.blockReasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
        <p className="small muted">O sistema não sugere distribuição com dados insuficientes ou desatualizados. Tente novamente quando os dados estiverem atualizados.</p>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="grid grid-4">
        <div className="card card-tight"><div className="kpi-label">Aporte</div><div className="kpi-value num">{money(result.contribution)}</div></div>
        <div className="card card-tight"><div className="kpi-label">Investimento sugerido</div><div className="kpi-value num">{money(result.invested)}</div></div>
        <div className="card card-tight">
          <div className="kpi-label">Caixa de oportunidade</div>
          <div className="kpi-value num">{money(result.opportunityCash)}</div>
          {result.cashReason && <div className="kpi-sub">{result.cashReason}</div>}
        </div>
        <div className="card card-tight"><div className="kpi-label">Qualidade dos dados</div><div className="kpi-value num">{n(result.dataQuality, 0)}%</div><div className="kpi-sub">Gerado {new Date(result.generatedAt).toLocaleTimeString("pt-BR")}</div></div>
      </div>
      {result.notes.map((x) => <div key={x} className="banner small">{x}</div>)}
      <div>
        {buying.length === 0 && <div className="card small faint">Nenhum ativo com prioridade média ou alta agora — o aporte fica na caixa de oportunidade.</div>}
        {buying.map((l) => (
          <details key={l.ticker} className="alloc-line">
            <summary>
              <div className="alloc-top">
                <div><div className="ticker">{l.ticker}</div><div className="xsmall faint">{l.bucket}</div></div>
                <div className="row-wrap">
                  <span className={ACTION_CLS[l.action]}>{l.action}</span>
                  <span className={PRIORITY_CLS[l.priority]}>Prioridade {l.priority}</span>
                  <span className="badge">Confiança {l.confidence}</span>
                </div>
                <div className="small muted num right">
                  {n(l.currentWeight, 2)}% → {n(l.weightAfter, 2)}%<br />
                  <span className="faint">alvo {n(l.targetWeight, 2)}%</span>
                </div>
                <div className="alloc-amount num right">{money(l.amount)}</div>
              </div>
            </summary>
            <div className="why">
              <p className="small">{l.why}</p>
              <div className="proscons">
                <div>
                  <div className="kpi-label">Pontos favoráveis</div>
                  <ul className="clean small">{l.favorable.length ? l.favorable.map((f) => <li key={f}>{f}</li>) : <li className="faint">nenhum destaque</li>}</ul>
                </div>
                <div>
                  <div className="kpi-label">Por que NÃO comprar?</div>
                  <ul className="clean small">{l.risks.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              </div>
              {(l.alternatives?.length || l.change) && (
                <div className="proscons">
                  {l.alternatives && l.alternatives.length > 0 && (
                    <div>
                      <div className="kpi-label">Alternativas consideradas</div>
                      <ul className="clean small">{l.alternatives.map((a) => <li key={a}>{a}</li>)}</ul>
                    </div>
                  )}
                  {l.change && (
                    <div>
                      <div className="kpi-label">O que faria mudar</div>
                      <p className="small" style={{ margin: 0 }}>{l.change}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
      {waiting > 0 && <p className="xsmall muted">{waiting} ativo(s) do radar sem aporte agora (prioridade baixa: caro, tese em risco, acima da meta ou sem dados) — veja em Onde aportar, logo abaixo.</p>}
      <p className="xsmall faint">
        Participação sugerida sobre o valor investido: {buying.map((l) => `${l.ticker} ${pct(l.share * 100, 0)}`).join(" · ")}.
        A aplicação não executa ordens. A decisão final é sua.
      </p>
    </div>
  );
}
