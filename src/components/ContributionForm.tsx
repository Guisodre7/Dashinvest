"use client";
import { useActionState } from "react";
import { calculateContribution, type ContributionState } from "@/app/(app)/actions";
import AllocationView from "./AllocationView";

export default function ContributionForm({ defaultAmount, previous }: { defaultAmount: number; previous: ContributionState["result"] }) {
  const [state, action, pending] = useActionState(calculateContribution, { result: previous, error: null });
  return (
    <div className="stack">
      <form action={action} className="contrib">
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">Quanto vou aportar este mês?</span>
          <div className="money"><span>US$</span><input name="amount" inputMode="decimal" defaultValue={defaultAmount} aria-label="Valor do aporte em dólares" /></div>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-end", padding: "12px 20px" }} disabled={pending}>
          {pending ? "Analisando carteira…" : "CALCULAR APORTE"}
        </button>
      </form>
      {state.error && <div className="banner banner-neg">{state.error}</div>}
      {state.result && (
        <>
          {state.result === previous && <p className="xsmall faint">Última recomendação calculada — clique em calcular para atualizar com os dados atuais.</p>}
          <AllocationView result={state.result} />
        </>
      )}
    </div>
  );
}
