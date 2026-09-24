"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      // Mensagem genérica: não revela se o e-mail existe.
      setError("Credenciais inválidas.");
      return;
    }
    router.replace("/mfa");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="stack">
      <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Senha<input type="password" autoComplete="current-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="neg small">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
      <p className="faint xsmall">Após a senha, será exigido o código do app autenticador (MFA).</p>
    </form>
  );
}
