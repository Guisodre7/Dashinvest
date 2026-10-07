"use client";
import { useActionState, useState } from "react";
import { calculateContribution, type ContributionState } from "@/app/(app)/actions";
import AllocationView from "./AllocationView";

/** Capital disponível neste ciclo: qualquer valor informado; sem valor padrão. */
export default function ContributionForm({ defaultAmount, previous }: { defaultAmount: number | null; previous: ContributionState["result"] }) {
  const [state, action, pending] = useActionState(calculateContribution, { result: previous, error: null });
  // Controlado: o valor digitado continua no campo depois do cálculo.
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount).replace(".", ",") : "");
  return (
    <div className="stack">
      <form action={action} className="contrib">
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">Capital disponível para aporte neste ciclo (exterior)</span>
          <div className="money"><span>US$</span><input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="valor disponível" aria-label="Capital disponível neste ciclo, em dólares" /></div>
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
