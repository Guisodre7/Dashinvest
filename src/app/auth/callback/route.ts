import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Só caminhos internos (evita redirecionamento aberto). */
const safeNext = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/");

/**
 * Retorno dos links de e-mail do Supabase (recuperação de senha, confirmação):
 *  - ?code=…            → troca o código pela sessão (fluxo PKCE, mesmo navegador do pedido);
 *  - ?token_hash=&type= → verifica o token (funciona em qualquer navegador, se o modelo de
 *                         e-mail do Supabase usar {{ .TokenHash }}).
 * A sessão aberta pelo link é de 1 fator: o próximo passo é sempre o código do autenticador
 * (/mfa), e só então a senha nova pode ser definida.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next") ?? (type === "recovery" ? "/conta?redefinir=1" : "/"));
  let ok = false;
  try {
    const supabase = await createSupabaseServerClient();
    if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  } catch {
    ok = false; // sem configuração do Supabase ou falha de rede: trata como link inválido
  }
  if (!ok) return NextResponse.redirect(new URL("/login?error=link", request.url));
  return NextResponse.redirect(new URL(`/mfa?next=${encodeURIComponent(next)}`, request.url));
}
