import type { AllocationResult } from "@/lib/analysis/allocation";
import { n, pct, usd } from "@/lib/format";

const ACTION_CLS: Record<string, string> = { COMPRAR: "badge badge-pos", "APORTE NORMAL": "badge badge-accent", AGUARDAR: "badge" };
const PRIORITY_CLS: Record<string, string> = { ALTA: "badge badge-pos", "MÉDIA": "badge", BAIXA: "badge" };

export default function AllocationView({ result }: { result: AllocationResult }) {
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
        <div className="card card-tight"><div className="kpi-label">Aporte</div><div className="kpi-value num">{usd(result.contribution)}</div></div>
        <div className="card card-tight"><div className="kpi-label">Investimento sugerido</div><div className="kpi-value num">{usd(result.invested)}</div></div>
        <div className="card card-tight">
          <div className="kpi-label">Caixa de oportunidade</div>
          <div className="kpi-value num">{usd(result.opportunityCash)}</div>
          {result.cashReason && <div className="kpi-sub">{result.cashReason}</div>}
        </div>
        <div className="card card-tight"><div className="kpi-label">Qualidade dos dados</div><div className="kpi-value num">{n(result.dataQuality, 0)}%</div><div className="kpi-sub">Gerado {new Date(result.generatedAt).toLocaleTimeString("pt-BR")}</div></div>
      </div>
      {result.notes.map((x) => <div key={x} className="banner small">{x}</div>)}
      <div>
        {result.lines.map((l) => (
          <details key={l.ticker} className="alloc-line">
            <summary>
              <div className="alloc-top">
                <div><div className="ticker">{l.ticker}</div><div className="xsmall faint">{l.bucket}</div></div>
                <div className="row-wrap">
                  <span className={ACTION_CLS[l.action]}>{l.action}</span>
                  <span className={PRIORITY_CLS[l.priority]}>Prioridade {l.priority}</span>
                  <span className="badge" title="Opportunity Score (0–100): atratividade do aporte AGORA dentro da carteira — não mede qual empresa é melhor">Score {l.opportunityScore !== null ? n(l.opportunityScore, 0) : "—"}</span>
                  <span className="badge">Confiança {l.confidence}</span>
                </div>
                <div className="small muted num right">
                  {n(l.currentWeight, 2)}% → {n(l.weightAfter, 2)}%<br />
                  <span className="faint">alvo {n(l.targetWeight, 2)}%</span>
                </div>
                <div className="alloc-amount num right">{l.amount > 0 ? usd(l.amount) : "—"}</div>
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
              <div className="xsmall faint">Dados utilizados: {l.dataUsed.join(" · ")}</div>
            </div>
          </details>
        ))}
      </div>
      <p className="xsmall faint">
        Participação sugerida sobre o valor investido: {result.lines.filter((l) => l.amount > 0).map((l) => `${l.ticker} ${pct(l.share * 100, 0)}`).join(" · ")}.
        A aplicação não executa ordens. A decisão final é sua.
      </p>
    </div>
  );
}
