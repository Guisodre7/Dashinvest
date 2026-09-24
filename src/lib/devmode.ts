/**
 * Modo local de desenvolvimento (LOCAL_DEV_MODE=true): dispensa Supabase,
 * usa um arquivo JSON local e um usuário fictício. Proibido em produção.
 */
export function isLocalDevMode(): boolean {
  return process.env.LOCAL_DEV_MODE === "true" && process.env.NODE_ENV !== "production";
}
