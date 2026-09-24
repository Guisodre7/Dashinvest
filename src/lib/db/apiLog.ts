import "server-only";
import { createSupabaseAdminClient } from "../supabase/server";

export interface ApiLogEntry {
  provider: string;
  endpoint: string;
  ticker?: string;
  status: number | null;
  latency_ms: number;
  error?: string;
}

/** Registro assíncrono (fire-and-forget) em api_logs. Nunca inclui a URL (contém a API key). */
export function logApiCall(entry: ApiLogEntry): void {
  const db = createSupabaseAdminClient();
  if (!db) return;
  void db.from("api_logs").insert({ ...entry, error: entry.error?.slice(0, 500) } as never).then(() => undefined, () => undefined);
}
