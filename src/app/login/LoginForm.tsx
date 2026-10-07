"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient, type SupabasePublicConfig } from "@/lib/supabase/browser";

export default function LoginForm({ config: supabase_cfg }: { config: SupabasePublicConfig }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Lê direto do formulário: o preenchimento automático (iPhone, gerenciador de senhas)
    // nem sempre dispara onChange, e o estado ficaria com a senha antiga/incompleta.
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    setBusy(true);
    setError(null);
    if (!supabase_cfg.url || !supabase_cfg.anonKey) {
      setBusy(false);
      setError("Servidor sem configuração do Supabase. Verifique as variáveis na Vercel e faça Redeploy.");
      return;
    }
    const supabase = createSupabaseBrowserClient(supabase_cfg);
    const { error } = await supabase.auth.signInWithPassword({ email, password }).catch(() => ({ error: new Error("rede") }));
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
      <label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
      <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="neg small">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
      <p className="faint xsmall">Após a senha, será exigido o código do app autenticador (MFA).</p>
    </form>
  );
}
