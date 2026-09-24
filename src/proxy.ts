import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicConfig } from "./lib/runtime-env";

/**
 * Proxy de autenticação (antigo middleware). Toda rota, exceto login,
 * callback de auth e cron (protegido por CRON_SECRET), exige sessão válida
 * do único usuário autorizado e, por padrão, MFA (aal2).
 * As páginas e rotas repetem a verificação no servidor (defesa em profundidade).
 */
const PUBLIC_PATHS = ["/login", "/auth/", "/api/cron/", "/robots.txt"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next({ request });
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");

  if (process.env.LOCAL_DEV_MODE === "true" && process.env.NODE_ENV !== "production") return response;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) return response;

  const { url, anonKey: key } = supabasePublicConfig();
  if (!url || !key) return deny(request, "unauthenticated");

  let res = response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        res = NextResponse.next({ request });
        res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
        toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return deny(request, "unauthenticated");

  const allowed = (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
  if (!allowed || String(claims.email ?? "").toLowerCase() !== allowed) {
    await supabase.auth.signOut();
    return deny(request, "forbidden");
  }

  const requireMfa = process.env.REQUIRE_MFA !== "false";
  if (requireMfa && claims.aal !== "aal2" && pathname !== "/mfa") {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "mfa_required" }, { status: 401 });
    return NextResponse.redirect(new URL("/mfa", request.url));
  }
  return res;
}

function deny(request: NextRequest, reason: "unauthenticated" | "forbidden") {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: reason }, { status: reason === "forbidden" ? 403 : 401 });
  }
  const login = new URL("/login", request.url);
  if (reason === "forbidden") login.searchParams.set("error", "forbidden");
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
