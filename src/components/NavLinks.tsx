"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "home" | "wallet" | "sliders" | "trend" | "doc";

const LINKS: { href: string; label: string; short: string; icon: IconName }[] = [
  { href: "/", label: "Painel", short: "Painel", icon: "home" },
  { href: "/carteira", label: "Carteira", short: "Carteira", icon: "wallet" },
  { href: "/estrategia", label: "Estratégia", short: "Estratégia", icon: "sliders" },
  { href: "/projecao", label: "Projeção Patrimonial", short: "Projeção", icon: "trend" },
  { href: "/relatorio", label: "Relatório", short: "Relatório", icon: "doc" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/ativo") : path.startsWith(href));

/** Navegação do topo (desktop/tablet). */
export default function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Seções">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isActive(path, l.href) ? "page" : undefined}>{l.label}</Link>
      ))}
    </nav>
  );
}

/** Barra de abas fixa na base da tela (celular). */
export function MobileTabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Seções">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isActive(path, l.href) ? "page" : undefined}>
          <Icon name={l.icon} />
          <span>{l.short}</span>
        </Link>
      ))}
    </nav>
  );
}

function Icon({ name }: { name: IconName }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "home":
      return <svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h5v-6h4v6h5V9.5" /></svg>;
    case "wallet":
      return <svg {...p}><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M16 15h2" /><path d="M7 6V4.5A1.5 1.5 0 0 1 8.5 3h9A1.5 1.5 0 0 1 19 4.5V6" /></svg>;
    case "sliders":
      return <svg {...p}><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
    case "trend":
      return <svg {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>;
    case "doc":
      return <svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>;
  }
}
