import "server-only";
import { allowedEmails, supabasePublicConfig } from "./runtime-env";

/**
 * Configuração server-side. Nunca importar em componentes cliente —
 * `server-only` garante erro de build caso isso aconteça.
 */
export const serverConfig = {
  supabaseUrl: supabasePublicConfig().url,
  supabaseAnonKey: supabasePublicConfig().anonKey,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  /** Primeiro e-mail autorizado (usado pelo cron como identificação do dono). */
  allowedEmail: allowedEmails()[0] ?? "",
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
