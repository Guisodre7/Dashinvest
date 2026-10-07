"use client";
import { useState } from "react";

/** Campo de senha com botão para mostrar/ocultar o que foi digitado. */
export default function PasswordInput({ name, autoComplete, required = true, minLength, placeholder, ariaLabel }: {
  name: string; autoComplete: string; required?: boolean; minLength?: number; placeholder?: string; ariaLabel?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="pwd-field">
      <input name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required={required} minLength={minLength}
        placeholder={placeholder} aria-label={ariaLabel} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" className="pwd-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} aria-pressed={show}>
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a12.7 12.7 0 0 1-2.9 4.1M6.1 6.1C3.9 7.6 2.5 9.8 2 12c1 2.5 5 7 10 7a9.9 9.9 0 0 0 4.2-.9" /></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </span>
  );
}
