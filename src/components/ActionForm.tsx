"use client";
import { useActionState } from "react";

type State = { ok: boolean; message: string | null };

/** Formulário genérico ligado a uma server action com feedback. */
export default function ActionForm({
  action, children, submitLabel, className, confirm, submitClassName,
}: {
  action: (s: State, fd: FormData) => Promise<State>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  confirm?: string;
  /** Classe do botão (padrão: primário). */
  submitClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true, message: null });
  return (
    <form
      action={formAction}
      className={className ?? "form-grid"}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {children}
      <div className="row">
        <button className={submitClassName ?? "btn btn-primary btn-sm"} disabled={pending}>{pending ? "Salvando…" : submitLabel}</button>
        {state.message && <span className={`small ${state.ok ? "pos" : "neg"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
