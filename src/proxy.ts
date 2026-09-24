import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { allowedEmails, supabasePublicConfig } from "./lib/runtime-env";

/**
 * Proxy de autenticação (antigo middleware). Toda rota, exceto callback de
 * auth e cron (protegido por CRON_SECRET), passa por aqui para:
 *  - renovar a sessão do Supabase e GRAVAR os cookies renovados em qualquer
 *    resposta (inclusive redirecionamentos) — o refresh token é rotativo, e
 *    perder o token novo derruba a sessão;
 *  - exigir o usuário autorizado e MFA (aal2);
 *  - mandar quem já está logado direto para o painel ao abrir /login ou /mfa.
 * As páginas e rotas repetem a verificação no servidor (defesa em profundidade).
 */
const PUBLIC_PATHS = ["/auth/", "/api/cron/", "/robots.txt"];
const AUTH_PAGES = ["/login", "/mfa"];
const ROBOTS = "noindex, nofollow, noarchive, nosnippet";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let res = NextResponse.next({ request });
  res.headers.set("X-Robots-Tag", ROBOTS);

  if (process.env.LOCAL_DEV_MODE === "true" && process.env.NODE_ENV !== "production") return res;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return res;

  const isAuthPage = AUTH_PAGES.includes(pathname);
  const { url, anonKey } = supabasePublicConfig();
  if (!url || !anonKey) return isAuthPage ? res : deny(request, "unauthenticated", res);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        res = NextResponse.next({ request });
        res.headers.set("X-Robots-Tag", ROBOTS);
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims?.sub) return isAuthPage ? res : deny(request, "unauthenticated", res);

  const allowed = allowedEmails();
  if (!allowed.length || !allowed.includes(String(claims.email ?? "").toLowerCase())) {
    await supabase.auth.signOut();
    return pathname === "/login" ? res : deny(request, "forbidden", res);
  }

  const requireMfa = process.env.REQUIRE_MFA !== "false";
  const fullyAuthenticated = !requireMfa || claims.aal === "aal2";

  // Já logado: não mostra a tela de login de novo.
  if (isAuthPage) {
    if (fullyAuthenticated) return redirectWithCookies(request, "/", res);
    if (pathname === "/login") return redirectWithCookies(request, "/mfa", res);
    return res;
  }

  if (!fullyAuthenticated) {
    if (pathname.startsWith("/api/")) return withCookies(NextResponse.json({ error: "mfa_required" }, { status: 401 }), res);
    return redirectWithCookies(request, "/mfa", res);
  }
  return res;
}

/** Copia os cookies de sessão (possivelmente renovados) para outra resposta. */
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((c) => target.cookies.set(c));
  target.headers.set("X-Robots-Tag", ROBOTS);
  return target;
}

function redirectWithCookies(request: NextRequest, path: string, source: NextResponse) {
  return withCookies(NextResponse.redirect(new URL(path, request.url)), source);
}

function deny(request: NextRequest, reason: "unauthenticated" | "forbidden", source: NextResponse) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return withCookies(NextResponse.json({ error: reason }, { status: reason === "forbidden" ? 403 : 401 }), source);
  }
  const login = new URL("/login", request.url);
  if (reason === "forbidden") login.searchParams.set("error", "forbidden");
  return withCookies(NextResponse.redirect(login), source);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
