import Link from "next/link";
import MarketClock from "@/components/MarketClock";
import NavLinks from "@/components/NavLinks";
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
          <Link href="/" className="brand">Carteira Internacional</Link>
          <NavLinks />
          <MarketClock />
          <ThemeToggle />
          <form action="/auth/signout" method="post"><button className="btn btn-ghost btn-sm">Sair</button></form>
        </div>
      </header>
      {isLocalDevMode() && (
        <div className="shell" style={{ paddingTop: 12, paddingBottom: 0 }}>
          <div className="banner banner-warn">Modo local de desenvolvimento — sem autenticação e com armazenamento em arquivo. Indisponível em produção.</div>
        </div>
      )}
      <main className="shell">{children}</main>
    </>
  );
}
