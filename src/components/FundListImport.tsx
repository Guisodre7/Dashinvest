"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateFundBalancesFromList } from "@/app/(app)/brasil/actions";
import { matchFundByName, parseFundList, type FundListItem } from "@/lib/ocr/parseFund";
import ReceiptReader from "./ReceiptReader";

type Fund = { code: string; name: string | null; value: number | null };
const brl = (v: number | null) => (v === null ? "—" : `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/**
 * "Atualizar saldos pelo print da lista": um print com vários fundos (saldo bruto e líquido de
 * cada um) acerta o saldo de todos de uma vez. Mostra antes × depois e só grava ao confirmar.
 */
export default function FundListImport({ funds }: { funds: Fund[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<(FundListItem & { code: string })[] | null>(null);
  const [use, setUse] = useState<"net" | "gross">("net");
  const [date, setDate] = useState(today);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function onText(text: string) {
    setMsg(null);
    const items = parseFundList(text);
    if (!items.length) { setRows(null); setMsg({ ok: false, text: "Não encontrei saldos de fundos neste print. Use a tela com a lista dos fundos (saldo bruto e líquido)." }); return; }
    setRows(items.map((it) => ({ ...it, code: matchFundByName(it.name, funds)?.code ?? "" })));
  }
  const value = (r: FundListItem) => (use === "net" ? r.netBalance ?? r.grossBalance : r.grossBalance ?? r.netBalance);
  const ready = rows?.filter((r) => r.code) ?? [];

  return (
    <div className="stack" style={{ gap: 8 }}>
      <ReceiptReader label="Ler print da lista de fundos" onText={onText}
        hint="Tela do banco com vários fundos e o saldo de cada um (ex.: BTG → Investimentos → Renda fixa). Atualiza só o saldo: não conta como aporte nem resgate." />
      {rows && (
        <div className="card card-tight stack" style={{ gap: 8 }}>
          {rows.map((r, i) => {
            const cur = funds.find((f) => f.code === r.code);
            const v = value(r);
            return (
              <div key={r.name} className="small">
                <strong>{r.name}</strong>
                <div className="xsmall muted">bruto {brl(r.grossBalance)} · líquido {brl(r.netBalance)}</div>
                <select value={r.code} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} aria-label={`Fundo cadastrado para ${r.name}`}>
                  <option value="">— não atualizar —</option>
                  {funds.map((f) => <option key={f.code} value={f.code}>{f.name ?? f.code}</option>)}
                </select>
                {cur && v !== null && (
                  <div className="xsmall">Painel {brl(cur.value)} → {brl(v)} <span className={Math.abs(v - (cur.value ?? 0)) < 0.01 ? "faint" : "warn"}>({v - (cur.value ?? 0) >= 0 ? "+" : "−"}{brl(Math.abs(v - (cur.value ?? 0)))})</span></div>
                )}
              </div>
            );
          })}
          <div className="row-wrap">
            <label className="xsmall">Usar
              <select value={use} onChange={(e) => setUse(e.target.value as "net" | "gross")}>
                <option value="net">saldo líquido (após IR, o que você resgataria)</option>
                <option value="gross">saldo bruto</option>
              </select>
            </label>
            <label className="xsmall">Data do print<input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <button type="button" className="btn btn-primary btn-sm" disabled={pending || !ready.length}
            onClick={() => start(async () => {
              const res = await updateFundBalancesFromList({ date, use, items: ready.map((r) => ({ code: r.code, gross: r.grossBalance, net: r.netBalance })) });
              setMsg({ ok: res.ok, text: res.message ?? "" });
              if (res.ok) { setRows(null); router.refresh(); }
            })}>
            {pending ? "Salvando…" : `Atualizar ${ready.length} saldo(s)`}
          </button>
        </div>
      )}
      {msg && <p className={`small ${msg.ok ? "pos" : "neg"}`}>{msg.text}</p>}
    </div>
  );
}
