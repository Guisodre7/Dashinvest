import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { serverConfig } from "./config";
import { isLocalDevMode } from "./devmode";
import { allowedEmails } from "./runtime-env";
import { createSupabaseServerClient } from "./supabase/server";

export interface SessionUser {
  id: string;
  email: string;
  aal: "aal1" | "aal2";
}

export const DEV_USER: SessionUser = { id: "00000000-0000-0000-0000-000000000001", email: "dev@local", aal: "aal2" };

/**
 * Valida a sessão no servidor (JWT verificado via getClaims) e aplica:
 *  - allowlist de e-mails (ALLOWED_EMAIL, um ou vários separados por vírgula);
 *  - MFA obrigatório (aal2) quando REQUIRE_MFA != "false".
 */
// Layout, página e ações do mesmo request compartilham uma única verificação.
export const getSessionUser = cache(async (): Promise<{ user: SessionUser | null; reason?: "unauthenticated" | "forbidden" | "mfa" }> => {
  if (isLocalDevMode()) return { user: DEV_USER };
  if (!serverConfig.supabaseUrl || !serverConfig.supabaseAnonKey) return { user: null, reason: "unauthenticated" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return { user: null, reason: "unauthenticated" };

  const email = String(claims.email ?? "").toLowerCase();
  if (!allowedEmails().includes(email)) return { user: null, reason: "forbidden" };

  const aal = (claims.aal as "aal1" | "aal2") ?? "aal1";
  const user = { id: claims.sub, email, aal };
  if (serverConfig.requireMfa && aal !== "aal2") return { user, reason: "mfa" };
  return { user };
});

/** Para páginas e server actions: redireciona se não autorizado. */
export async function requireUser(): Promise<SessionUser> {
  const { user, reason } = await getSessionUser();
  if (reason === "mfa") redirect("/mfa");
  if (!user || reason) redirect(`/login${reason === "forbidden" ? "?error=forbidden" : ""}`);
  return user;
}
