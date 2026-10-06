"use client";
import { useActionState, useState } from "react";

type State = { ok: boolean; message: string | null };
type Cls = "acao" | "fii" | "renda_fixa" | "caixa";

const KINDS: Record<Cls, { value: string; label: string }[]> = {
  acao: [{ value: "buy", label: "Compra" }, { value: "sell", label: "Venda" }, { value: "dividend", label: "Dividendo / JCP" }],
  fii: [{ value: "buy", label: "Compra" }, { value: "sell", label: "Venda" }, { value: "income", label: "Rendimento" }],
  renda_fixa: [
    { value: "contribution", label: "Aporte" }, { value: "redemption", label: "Resgate" },
    { value: "balance", label: "Atualizar saldo" }, { value: "income", label: "Juros/cupom pago" },
  ],
  caixa: [{ value: "contribution", label: "Depósito" }, { value: "redemption", label: "Retirada" }, { value: "balance", label: "Atualizar saldo" }],
};

/**
 * Registro de movimentação da carteira Brasil. Ações/FIIs: quantidade × preço.
 * Renda fixa/caixa: valor (aporte, resgate) ou saldo atual (não é fluxo de caixa).
 */
/** Modo fixo usado pelas abas Compra · Venda · Provento · Renda fixa. */
type Mode = "buy" | "sell" | "income" | "rf";
const MODE_CLASSES: Record<Mode, Cls[]> = { buy: ["acao", "fii"], sell: ["acao", "fii"], income: ["acao", "fii"], rf: ["renda_fixa", "caixa"] };
const CLASS_NAME: Record<Cls, string> = { acao: "Ação", fii: "FII", renda_fixa: "Renda fixa", caixa: "Caixa" };
const modeKind = (mode: Mode | undefined, c: Cls) =>
  mode === "buy" ? "buy" : mode === "sell" ? "sell" : mode === "income" ? (c === "fii" ? "income" : "dividend") : KINDS[c][0].value;

export default function LedgerForm({ action, fixedIncome, suggestions, mode }: {
  action: (s: State, fd: FormData) => Promise<State>;
  fixedIncome: { code: string; name: string | null }[];
  suggestions: string[];
  mode?: Mode;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true, message: null });
  const classes: Cls[] = mode ? MODE_CLASSES[mode] : ["acao", "fii", "renda_fixa", "caixa"];
  const [cls, setCls] = useState<Cls>(classes[0]);
  const [kind, setKind] = useState(modeKind(mode, classes[0]));
  const kindLocked = mode === "buy" || mode === "sell" || mode === "income";
  const [existing, setExisting] = useState("");
  const priced = cls === "acao" || cls === "fii";
  const flowOnly = kind === "dividend" || kind === "income";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="form-grid" key={state.ok && state.message ? state.message : "f"}>
      <label>Classe
        <select name="asset_class" value={cls} onChange={(e) => { const c = e.target.value as Cls; setCls(c); setKind(modeKind(mode, c)); }}>
          {classes.map((c) => <option key={c} value={c}>{CLASS_NAME[c]}</option>)}
        </select>
      </label>
      {kindLocked ? <input type="hidden" name="kind" value={kind} /> : (
        <label>Movimentação
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS[cls].map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </label>
      )}

      {priced ? (
        <label>Ticker<input name="code" list="br-tickers" required autoCapitalize="characters" placeholder="ITUB4" /></label>
      ) : (
        <>
          {fixedIncome.length > 0 && (
            <label>Título/fundo
              <select name="existing_code" value={existing} onChange={(e) => setExisting(e.target.value)}>
                <option value="">Novo…</option>
                {fixedIncome.map((f) => <option key={f.code} value={f.code}>{f.name ?? f.code}</option>)}
              </select>
            </label>
          )}
          {!existing && <label>Nome do título/fundo<input name="name" required placeholder="CDB Banco X 2028" /></label>}
          {!existing && <label>CNPJ (opcional)<input name="cnpj" inputMode="numeric" /></label>}
          {!existing && <label>Emissor/gestor (opcional)<input name="issuer" /></label>}
        </>
      )}

      <label>Data<input name="trade_date" type="date" defaultValue={today} max={today} required /></label>
      {priced && !flowOnly && <label>Quantidade<input name="quantity" inputMode="decimal" required /></label>}
      {priced && !flowOnly && <label>Preço (R$)<input name="price" inputMode="decimal" required /></label>}
      {(!priced || flowOnly) && (
        <label>{kind === "balance" ? "Saldo atual (R$)" : "Valor (R$)"}<input name="amount" inputMode="decimal" required /></label>
      )}
      {kind !== "balance" && !flowOnly && <label>Custos/taxas (R$)<input name="fees" inputMode="decimal" placeholder="0" /></label>}
      <label className="span-2">Observação<input name="notes" maxLength={200} /></label>
      <datalist id="br-tickers">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>

      <div className="row span-2">
        <button className="btn btn-primary btn-sm" disabled={pending}>{pending ? "Salvando…" : mode === "buy" ? "Registrar compra" : mode === "sell" ? "Registrar venda" : mode === "income" ? "Registrar provento" : "Registrar"}</button>
        {state.message && <span className={`small ${state.ok ? "pos" : "neg"}`} role="status">{state.message}</span>}
      </div>
      {kind === "balance" && <p className="xsmall faint span-2">O saldo atualiza o valor da posição; não conta como aporte nem como resgate.</p>}
    </form>
  );
}
