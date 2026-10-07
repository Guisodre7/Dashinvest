import Link from "next/link";
import { Suspense } from "react";
import MarketClock from "@/components/MarketClock";
import NotificationBell from "@/components/NotificationBell";
import { MarketSwitch, MobileBar, PortfolioSubnav } from "@/components/PortfolioNav";
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
          <Link href="/" className="brand" aria-label="DashInvest — painel">
            <svg className="brand-mark" width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#1f3a5f" /><path d="M8 21l5-6 4 3 7-8" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="hide-mobile">DashInvest</span>
          </Link>
          <div className="hide-mobile"><Suspense><MarketSwitch /></Suspense></div>
          <nav className="nav hide-mobile" aria-label="Ferramentas">
            <Link href="/analisar">Analisar compra</Link>
            <Link href="/teses">Minhas teses</Link>
          </nav>
          <MarketClock />
          <NotificationBell />
          <ThemeToggle />
          <Link href="/conta" className="btn btn-ghost btn-sm account-link" aria-label="Minha conta" title="Minha conta">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
          </Link>
          <form action="/auth/signout" method="post"><button className="btn btn-ghost btn-sm" aria-label="Sair da conta">Sair</button></form>
        </div>
      </header>
      {isLocalDevMode() && (
        <div className="shell" style={{ paddingTop: 12, paddingBottom: 0 }}>
          <div className="banner banner-warn">Modo local de desenvolvimento — sem autenticação e com armazenamento em arquivo. Indisponível em produção.</div>
        </div>
      )}
      <main className="shell">
        <Suspense><PortfolioSubnav /></Suspense>
        {children}
      </main>
      <Suspense><MobileBar /></Suspense>
    </>
  );
}
