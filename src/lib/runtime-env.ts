/**
 * Leitura de variáveis de ambiente em TEMPO DE EXECUÇÃO.
 * O Next.js substitui `process.env.NEXT_PUBLIC_*` literal durante o build; se a
 * variável não existia no build (ex.: cadastrada na Vercel depois), o valor
 * ficaria vazio para sempre. O acesso dinâmico evita essa substituição.
 */
export function runtimeEnv(name: string): string {
  const env = process.env as Record<string, string | undefined>;
  return (env[name] ?? "").trim();
}

export function supabasePublicConfig() {
  return {
    url: runtimeEnv("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

/** E-mails autorizados (ALLOWED_EMAIL aceita um ou vários, separados por vírgula). */
export function allowedEmails(): string[] {
  return runtimeEnv("ALLOWED_EMAIL").toLowerCase().split(/[,;\s]+/).filter(Boolean);
}
