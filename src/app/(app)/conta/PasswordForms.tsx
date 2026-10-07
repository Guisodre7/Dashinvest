"use client";
import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import PasswordInput from "@/components/PasswordInput";
import { changePassword, changePasswordWithMfa } from "./actions";

/** Trocar senha: com a senha atual, ou sem ela confirmando o código do app autenticador. */
export default function PasswordForms({ recovering }: { recovering: boolean }) {
  const [mode, setMode] = useState<"current" | "mfa">(recovering ? "mfa" : "current");
  return (
    <div className="stack">
      <div className="seg" role="tablist" aria-label="Como confirmar">
        <button type="button" role="tab" aria-selected={mode === "current"} className={`tab-btn${mode === "current" ? " on" : ""}`} onClick={() => setMode("current")}>Sei a senha atual</button>
        <button type="button" role="tab" aria-selected={mode === "mfa"} className={`tab-btn${mode === "mfa" ? " on" : ""}`} onClick={() => setMode("mfa")}>Não lembro a senha</button>
      </div>
      {mode === "current" ? (
        <ActionForm key="current" action={changePassword} submitLabel="Alterar senha" className="stack">
          <label>Senha atual<PasswordInput name="current" autoComplete="current-password" /></label>
          <label>Nova senha<PasswordInput name="next" autoComplete="new-password" minLength={12} /></label>
          <label>Confirmar nova senha<PasswordInput name="confirm" autoComplete="new-password" minLength={12} /></label>
          <p className="xsmall faint">Mínimo de 12 caracteres. A sessão continua aberta.</p>
        </ActionForm>
      ) : (
        <ActionForm key="mfa" action={changePasswordWithMfa} submitLabel="Definir nova senha" className="stack">
          <label>Código do app autenticador<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="6 dígitos" /></label>
          <label>Nova senha<PasswordInput name="next" autoComplete="new-password" minLength={12} /></label>
          <label>Confirmar nova senha<PasswordInput name="confirm" autoComplete="new-password" minLength={12} /></label>
          <p className="xsmall faint">Sem a senha antiga: a confirmação é o código de 6 dígitos do seu app autenticador (o mesmo do login). Mínimo de 12 caracteres.</p>
        </ActionForm>
      )}
    </div>
  );
}
