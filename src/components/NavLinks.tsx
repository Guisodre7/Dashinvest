"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Painel" },
  { href: "/carteira", label: "Carteira" },
  { href: "/estrategia", label: "Estratégia" },
  { href: "/projecao", label: "Projeção Patrimonial" },
  { href: "/relatorio", label: "Relatório" },
];

export default function NavLinks() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={(l.href === "/" ? path === "/" : path.startsWith(l.href)) ? "page" : undefined}>{l.label}</Link>
      ))}
    </nav>
  );
}
