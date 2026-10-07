"use server";
import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { serverConfig } from "@/lib/config";
import { isLocalDevMode } from "@/lib/devmode";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface FormState { ok: boolean; message: string | null }

/**
 * Troca de senha dentro do painel. Confere a senha atual num cliente separado
 * (sem mexer nos cookies da sessão, que continua com MFA) e grava a nova.
 */
export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  try {
    const user = await requireUser();
    if (isLocalDevMode()) return { ok: false, message: "Modo local: sem conta real para trocar a senha." };
    const current = String(fd.get("current") ?? "");
    const next = String(fd.get("next") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (next.length < 12) return { ok: false, message: `A nova senha precisa ter pelo menos 12 caracteres (tem ${next.length}).` };
    if (next !== confirm) return { ok: false, message: "A confirmação não é igual à nova senha." };
    if (next === current) return { ok: false, message: "A nova senha é igual à atual." };
    if (!user.email) return { ok: false, message: "Conta sem e-mail associado." };

    const check = createClient(serverConfig.supabaseUrl, serverConfig.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: wrong } = await check.auth.signInWithPassword({ email: user.email, password: current });
    if (wrong) return { ok: false, message: "Senha atual incorreta." };
    await check.auth.signOut({ scope: "local" }).catch(() => undefined);

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) return { ok: false, message: /aal2|mfa/i.test(error.message) ? "Confirme o código do autenticador (MFA) novamente e tente de novo." : `Não foi possível trocar a senha: ${error.message}` };
    return { ok: true, message: "Senha alterada. Use a nova senha no próximo login." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Erro ao trocar a senha." };
  }
}
