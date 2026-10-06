"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmFundImport, previewFundImport } from "@/app/(app)/brasil/actions";
import { parseFundPosition, type FundPosition } from "@/lib/ocr/parseFund";
import type { FundImportPlan } from "@/lib/portfolio/fundImport";
import ReceiptReader from "./ReceiptReader";

type Fields = { name: string; cnpj: string; invested: string; gross: string; net: string; asOf: string; use: "net" | "gross" };
const num = (s: string) => {
  const t = s.trim().replace(/\s|R\$/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : NaN;
};
const show = (v: number | null) => (v === null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const brl = (v: number | null) => (v === null ? "—" : `R$ ${show(v)}`);

/**
 * "Adicionar atualização da carteira" para fundos/renda fixa: lê o print da
 * posição, compara com o último estado salvo, mostra o que mudou e só grava
 * depois da confirmação.
 */
export default function FundPrintImport() {
  const router = useRouter();
  const [parsed, setParsed] = useState<FundPosition | null>(null);
  const [f, setF] = useState<Fields | null>(null);
  const [plan, setPlan] = useState<FundImportPlan | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function onText(text: string, confidence: number) {
    const p = parseFundPosition(text);
    setPlan(null); setMsg(null);
    if (p.invested === null && p.grossBalance === null && p.netBalance === null) {
      setParsed(null); setF(null);
      setMsg({ ok: false, text: "Não encontrei uma posição de fundo neste print. Use a tela do fundo que mostra saldo bruto, saldo líquido e valor investido." });
      return;
    }
    if (confidence < 70) p.warnings.push(`Leitura com baixa nitidez (${Math.round(confidence)}%).`);
    setParsed(p);
    setF({ name: p.name ?? "", cnpj: p.cnpj ?? "", invested: show(p.invested), gross: show(p.grossBalance), net: show(p.netBalance), asOf: p.asOf ?? new Date().toISOString().slice(0, 10), use: p.netBalance !== null ? "net" : "gross" });
  }

  function payload() {
    if (!f || !parsed) return null;
    const invested = num(f.invested), gross = num(f.gross), net = num(f.net);
    if ([invested, gross, net].some((v) => Number.isNaN(v))) { setMsg({ ok: false, text: "Há um valor inválido nos campos." }); return null; }
    return {
      name: f.name.trim(), cnpj: f.cnpj.replace(/\D/g, "") || null, invested: invested ?? 0, grossBalance: gross, netBalance: net,
      asOf: f.asOf, lots: parsed.lots, use: f.use, creditPrivate: parsed.creditPrivate,
    };
  }

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f!, [k]: e.target.value }); setPlan(null); };
  const unconfirmed = parsed && !parsed.verified;

  return (
    <div className="stack">
      <ReceiptReader label="Enviar print do fundo" onText={onText}
        hint="Tire o print da tela do fundo no app do banco que mostra saldo bruto, saldo líquido, rendimento e valor investido (como a tela do BTG). A leitura é feita no seu aparelho." />
      {msg && <p className={`small ${msg.ok ? "pos" : "neg"}`} role="status">{msg.text}</p>}

      {f && parsed && (
        <>
          {unconfirmed && <div className="banner banner-warn small">Informação não confirmada — revise antes de salvar.{parsed.warnings.length ? ` ${parsed.warnings.join(" ")}` : ""}</div>}
          {parsed.verified && <p className="small pos">Valores conferidos: saldo − investido = rendimento informado pelo banco.</p>}
          <div className="form-grid">
            <label className="span-2">Fundo/título<input value={f.name} onChange={set("name")} /></label>
            <label>CNPJ (opcional)<input value={f.cnpj} onChange={set("cnpj")} inputMode="numeric" /></label>
            <label>Data da posição<input type="date" value={f.asOf} onChange={set("asOf")} /></label>
            <label>Valor investido (R$)<input value={f.invested} onChange={set("invested")} inputMode="decimal" /></label>
            <label>Saldo bruto (R$)<input value={f.gross} onChange={set("gross")} inputMode="decimal" /></label>
            <label>Saldo líquido (R$)<input value={f.net} onChange={set("net")} inputMode="decimal" /></label>
            <label>Usar como valor atual
              <select value={f.use} onChange={(e) => { setF({ ...f, use: e.target.value as "net" | "gross" }); setPlan(null); }}>
                <option value="net">Saldo líquido (após IR/IOF)</option><option value="gross">Saldo bruto</option>
              </select>
            </label>
          </div>
          {parsed.creditPrivate && <p className="xsmall faint">Identificado como crédito privado — entra na exposição a crédito.</p>}
          {!plan && (
            <button className="btn btn-sm" disabled={pending} onClick={() => start(async () => {
              const p = payload(); if (!p) return;
              const r = await previewFundImport(p);
              if (r.ok) setPlan(r.plan); else setMsg({ ok: false, text: r.message });
            })}>{pending ? "Comparando…" : "Ver o que mudou"}</button>
          )}
        </>
      )}

      {plan && (
        <div className="card card-tight stack">
          <strong>ATUALIZAÇÃO DETECTADA</strong>
          <div className="small"><strong>{plan.name}</strong></div>
          <dl className="bell-stats">
            <dt>Valor investido</dt><dd>{brl(plan.before?.invested ?? 0)} → {brl(plan.after.invested)}</dd>
            <dt>Valor atual</dt><dd>{brl(plan.before?.value ?? 0)} → {brl(plan.after.value)}</dd>
            <dt>Variação</dt><dd>{(plan.after.value - (plan.before?.value ?? 0)) >= 0 ? "+" : ""}{brl(plan.after.value - (plan.before?.value ?? 0))}</dd>
          </dl>
          <ul className="clean small">{plan.changes.map((c) => <li key={c}>{c}</li>)}</ul>
          {plan.blocker && <p className="small neg">{plan.blocker}</p>}
          {plan.nothingChanged && <p className="small muted">Nada mudou desde o último print.</p>}
          {!plan.blocker && !plan.nothingChanged && (
            <div className="row-wrap">
              <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
                const p = payload(); if (!p) return;
                const r = await confirmFundImport(p);
                setMsg({ ok: r.ok, text: r.message ?? "" });
                if (r.ok) { setPlan(null); setParsed(null); setF(null); router.refresh(); }
              })}>{pending ? "Salvando…" : "Confirmar atualização"}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPlan(null)}>Cancelar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
