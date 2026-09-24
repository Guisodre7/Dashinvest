"use client";
import { createBrowserClient } from "@supabase/ssr";

export interface SupabasePublicConfig { url: string; anonKey: string }

/**
 * URL + chave publicável (públicas por definição) recebidas do servidor em
 * tempo de execução. Nenhum segredo chega ao navegador.
 */
export function createSupabaseBrowserClient(cfg: SupabasePublicConfig) {
  if (!cfg.url || !cfg.anonKey) {
    throw new Error("Supabase não configurado no servidor (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  }
  return createBrowserClient(cfg.url, cfg.anonKey);
}
