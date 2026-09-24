import Link from "next/link";
import MarketClock from "@/components/MarketClock";
import NavLinks, { MobileTabBar } from "@/components/NavLinks";
import ThemeToggle from "@/components/ThemeToggle";
import { requireUser } from "@/lib/auth";
import { isLocalDevMode } from "@/lib/devmode";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand" aria-label="Carteira Internacional — painel">
            <svg className="brand-mark" width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#1f3a5f" /><path d="M8 21l5-6 4 3 7-8" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="hide-mobile">Carteira Internacional</span>
          </Link>
          <NavLinks />
          <MarketClock />
          <ThemeToggle />
          <form action="/auth/signout" method="post"><button className="btn btn-ghost btn-sm" aria-label="Sair da conta">Sair</button></form>
        </div>
      </header>
      {isLocalDevMode() && (
        <div className="shell" style={{ paddingTop: 12, paddingBottom: 0 }}>
          <div className="banner banner-warn">Modo local de desenvolvimento — sem autenticação e com armazenamento em arquivo. Indisponível em produção.</div>
        </div>
      )}
      <main className="shell">{children}</main>
      <MobileTabBar />
    </>
  );
}
