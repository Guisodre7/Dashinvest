import "server-only";

/**
 * Configuração server-side. Nunca importar em componentes cliente —
 * `server-only` garante erro de build caso isso aconteça.
 */
export const serverConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  allowedEmail: (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase(),
  requireMfa: process.env.REQUIRE_MFA !== "false",
  cronSecret: process.env.CRON_SECRET ?? "",

  marketDataProvider: process.env.MARKET_DATA_PROVIDER ?? "composite",
  finnhubApiKey: process.env.FINNHUB_API_KEY ?? "",
  alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY ?? "",
  /** Plano Alpha Vantage com dados realtime/US premium contratado? */
  alphaVantageRealtime: process.env.ALPHA_VANTAGE_REALTIME === "true",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "claude-sonnet-5",
} as const;

export { freshnessConfig } from "./freshness-config";
