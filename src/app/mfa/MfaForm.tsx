"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient, type SupabasePublicConfig } from "@/lib/supabase/browser";

type State =
  | { step: "loading" }
  | { step: "enroll"; factorId: string; qr: string; secret: string }
  | { step: "verify"; factorId: string }
  | { step: "error"; message: string };

export default function MfaForm({ config: supabase_cfg }: { config: SupabasePublicConfig }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient(supabase_cfg);
    (async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") { router.replace("/"); return; }
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) { setState({ step: "error", message: "Sessão expirada. Faça login novamente." }); return; }
      const verified = data.totp.find((f) => f.status === "verified");
      if (verified) { setState({ step: "verify", factorId: verified.id }); return; }
      // Primeiro acesso: cadastra o fator TOTP (apenas quando não há fator verificado).
      for (const f of data.all.filter((f) => f.status === "unverified")) await supabase.auth.mfa.unenroll({ factorId: f.id });
      const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `totp-${Date.now()}` });
      if (enrolled.error) { setState({ step: "error", message: enrolled.error.message }); return; }
      setState({ step: "enroll", factorId: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
    })();
  }, [router]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (state.step !== "enroll" && state.step !== "verify") return;
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowserClient(supabase_cfg);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: code.trim() });
    setBusy(false);
    if (error) { setError("Código inválido."); return; }
    router.replace("/");
    router.refresh();
  }

  if (state.step === "loading") return <p className="muted small">Carregando…</p>;
  if (state.step === "error") return <p className="neg small">{state.message} <a href="/login">Voltar ao login</a></p>;

  return (
    <form onSubmit={verify} className="stack">
      {state.step === "enroll" && (
        <div className="stack">
          <p className="small">Primeiro acesso: escaneie o QR code no seu app autenticador (1Password, Authy, Google Authenticator…).</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt="QR code TOTP" width={180} height={180} style={{ background: "#fff", borderRadius: 8, padding: 8 }} />
          <p className="faint xsmall mono">Chave manual: {state.secret}</p>
        </div>
      )}
      <label>Código<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} /></label>
      {error && <p className="neg small">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Verificando…" : "Verificar"}</button>
    </form>
  );
}
