"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PasswordInput from "@/components/PasswordInput";
import { createSupabaseBrowserClient, type SupabasePublicConfig } from "@/lib/supabase/browser";

/** Depois do link de recuperação: confirma o código do autenticador e vai direto para definir a senha nova. */
const RESET_NEXT = "/conta?redefinir=1";

export default function LoginForm({ config: supabase_cfg, linkError }: { config: SupabasePublicConfig; linkError?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(linkError ? "O link de redefinição expirou ou já foi usado. Peça um novo abaixo." : null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">(linkError ? "reset" : "login");

  // Link de recuperação no formato antigo do Supabase (tokens no #hash): abre a sessão e segue.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const desc = hash.get("error_description");
    if (desc) { setError(`Link inválido ou expirado (${desc.replace(/\+/g, " ")}). Peça um novo abaixo.`); setMode("reset"); return; }
    const access_token = hash.get("access_token"), refresh_token = hash.get("refresh_token");
    if (!access_token || !refresh_token || !supabase_cfg.url) return;
    const supabase = createSupabaseBrowserClient(supabase_cfg);
    supabase.auth.setSession({ access_token, refresh_token }).then(({ error: e }) => {
      if (e) { setError("Não foi possível abrir o link. Peça um novo abaixo."); setMode("reset"); return; }
      history.replaceState(null, "", window.location.pathname);
      router.replace(hash.get("type") === "recovery" ? `/mfa?next=${encodeURIComponent(RESET_NEXT)}` : "/mfa");
    });
  }, [router, supabase_cfg]);

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    // Lê direto do formulário: o preenchimento automático (iPhone, gerenciador de senhas)
    // nem sempre dispara onChange, e o estado ficaria com a senha antiga/incompleta.
    const fd = new FormData(ev.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    setBusy(true);
    setError(null);
    setInfo(null);
    if (!supabase_cfg.url || !supabase_cfg.anonKey) {
      setBusy(false);
      setError("Servidor sem configuração do Supabase. Verifique as variáveis na Vercel e faça Redeploy.");
      return;
    }
    const supabase = createSupabaseBrowserClient(supabase_cfg);
    if (mode === "reset") {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(RESET_NEXT)}`;
      const { error: e } = await supabase.auth.resetPasswordForEmail(email, { redirectTo }).catch(() => ({ error: new Error("rede") }));
      setBusy(false);
      // Mensagem neutra: não revela se o e-mail existe.
      if (e && /rate|limit|seconds/i.test(e.message)) setError("Muitos pedidos seguidos. Aguarde um minuto e tente de novo.");
      else setInfo("Se o e-mail estiver cadastrado, o link chegou na sua caixa de entrada (confira o spam). Abra o link NESTE aparelho e navegador.");
      return;
    }
    const { error: e } = await supabase.auth.signInWithPassword({ email, password }).catch(() => ({ error: new Error("rede") }));
    setBusy(false);
    if (e) {
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
      {mode === "login" && <label>Senha<PasswordInput name="password" autoComplete="current-password" /></label>}
      {error && <p className="neg small">{error}</p>}
      {info && <p className="pos small">{info}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? (mode === "reset" ? "Enviando…" : "Entrando…") : mode === "reset" ? "Enviar link para redefinir a senha" : "Entrar"}</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setMode(mode === "login" ? "reset" : "login"); setError(null); setInfo(null); }}>
        {mode === "login" ? "Esqueci minha senha" : "Voltar para o login"}
      </button>
      <p className="faint xsmall">
        {mode === "login"
          ? "Após a senha, será exigido o código do app autenticador (MFA)."
          : "Pelo link você confirma o código do autenticador e define a senha nova — sem precisar da antiga."}
      </p>
    </form>
  );
}
