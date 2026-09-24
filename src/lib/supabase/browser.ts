"use client";
import { createBrowserClient } from "@supabase/ssr";

/** Usa apenas URL + anon key (públicas por definição). Nenhum segredo no navegador. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
