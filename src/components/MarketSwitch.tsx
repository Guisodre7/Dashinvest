"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Seletor de carteira no topo: muda o contexto da interface. */
export default function MarketSwitch() {
  const path = usePathname();
  const current = path.startsWith("/brasil") ? "br" : path.startsWith("/geral") ? "all" : "us";
  const items = [
    { key: "br", href: "/brasil", label: "🇧🇷 Brasil" },
    { key: "us", href: "/", label: "🇺🇸 Internacional" },
    { key: "all", href: "/geral", label: "Visão geral" },
  ];
  return (
    <nav className="market-switch" aria-label="Carteira">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={current === i.key ? "page" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
