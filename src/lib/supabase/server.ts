import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { serverConfig } from "../config";

/** Cliente com a sessão do usuário (respeita RLS). */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(serverConfig.supabaseUrl, serverConfig.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de um Server Component: o proxy renova a sessão.
        }
      },
    },
  });
}

let admin: ReturnType<typeof createClient> | null = null;

/**
 * Cliente service-role — somente backend, para gravar dados de mercado
 * (cache, histórico de estimativas, logs). Nunca exposto ao navegador.
 */
export function createSupabaseAdminClient() {
  if (!serverConfig.supabaseUrl || !serverConfig.supabaseServiceRoleKey) return null;
  admin ??= createClient(serverConfig.supabaseUrl, serverConfig.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
