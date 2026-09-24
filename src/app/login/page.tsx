import { redirect } from "next/navigation";
import { isLocalDevMode } from "@/lib/devmode";
import { supabasePublicConfig } from "@/lib/runtime-env";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (isLocalDevMode()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="login-wrap">
      <div className="card login-card stack">
        <div>
          <h1>Carteira Internacional</h1>
          <p className="muted small">Acesso restrito ao titular.</p>
        </div>
        {error === "forbidden" && <div className="banner banner-neg">Conta não autorizada para este painel.</div>}
        <LoginForm config={supabasePublicConfig()} />
      </div>
    </main>
  );
}
