"use client";
import { useState } from "react";

/** Bloco "Movimentar" com as mesmas abas nas duas carteiras (Compra · Venda · Provento · …). */
export default function MovementTabs({ panels, initial }: { panels: { key: string; label: string; content: React.ReactNode }[]; initial?: string }) {
  const [cur, setCur] = useState(initial ?? panels[0]?.key);
  return (
    <div className="card stack">
      <div className="tabs" role="tablist">
        {panels.map((p) => (
          <button key={p.key} type="button" role="tab" aria-selected={cur === p.key} className={`tab-btn${cur === p.key ? " on" : ""}`} onClick={() => setCur(p.key)}>{p.label}</button>
        ))}
      </div>
      {panels.map((p) => <div key={p.key} role="tabpanel" hidden={cur !== p.key}>{p.content}</div>)}
    </div>
  );
}
