import { redirect } from "next/navigation";
import { isLocalDevMode } from "@/lib/devmode";
import { supabasePublicConfig } from "@/lib/runtime-env";
import MfaForm from "./MfaForm";

export const dynamic = "force-dynamic";

export default function MfaPage() {
  if (isLocalDevMode()) redirect("/");
  return (
    <main className="login-wrap">
      <div className="card login-card stack">
        <div>
          <h1>Verificação em duas etapas</h1>
          <p className="muted small">Informe o código de 6 dígitos do seu app autenticador.</p>
        </div>
        <MfaForm config={supabasePublicConfig()} />
      </div>
    </main>
  );
}
