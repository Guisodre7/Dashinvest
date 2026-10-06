"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Ctx = "US" | "BR" | "ALL";

/** Em qual carteira a página atual está (mesma regra em todo o app). */
export function portfolioContext(path: string, params: URLSearchParams): Ctx {
  if (path.startsWith("/brasil")) return "BR";
  if (path.startsWith("/geral") || path.startsWith("/teses") || path.startsWith("/notificacoes") || path.startsWith("/mudancas")) return "ALL";
  const m = params.get("m") ?? params.get("mercado");
  if (m === "BR") return "BR";
  if (path.startsWith("/oportunidades") && !m) return "ALL";
  if (path.startsWith("/analisar") && !m) return "ALL";
  return "US";
}

const SUB: Record<"US" | "BR", { key: string; label: string; href: string }[]> = {
  US: [
    { key: "resumo", label: "Resumo", href: "/" },
    { key: "aporte", label: "Aporte e valuation", href: "/?aba=aporte" },
    { key: "posicoes", label: "Posições", href: "/?aba=carteira" },
    { key: "movimentar", label: "Movimentar", href: "/carteira" },
    { key: "estrategia", label: "Estratégia", href: "/estrategia" },
    { key: "projecao", label: "Projeção", href: "/projecao?m=US" },
    { key: "relatorio", label: "Relatório", href: "/relatorio?m=US" },
  ],
  BR: [
    { key: "resumo", label: "Resumo", href: "/brasil" },
    { key: "aporte", label: "Aporte e valuation", href: "/brasil?aba=aporte" },
    { key: "posicoes", label: "Posições", href: "/brasil?aba=posicoes" },
    { key: "movimentar", label: "Movimentar", href: "/brasil?aba=movimentar" },
    { key: "estrategia", label: "Estratégia", href: "/brasil?aba=estrategia" },
    { key: "projecao", label: "Projeção", href: "/projecao?m=BR" },
    { key: "relatorio", label: "Relatório", href: "/relatorio?m=BR" },
  ],
};

function activeKey(ctx: "US" | "BR", path: string, p: URLSearchParams): string {
  if (path.startsWith("/projecao")) return "projecao";
  if (path.startsWith("/relatorio")) return "relatorio";
  if (path.startsWith("/oportunidades") || path.startsWith("/ativo")) return "aporte";
  if (path.startsWith("/estrategia")) return "estrategia";
  if (path.startsWith("/carteira")) return "movimentar";
  if (path.startsWith("/analisar")) return "aporte";
  const aba = p.get("aba");
  if (ctx === "BR") return aba === "valuation" ? "aporte" : aba ?? "resumo";
  return aba === "aporte" ? "aporte" : aba === "carteira" ? "posicoes" : "resumo";
}

function Pending({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "is-pending" : undefined}>{children}</span>;
}

/** Seletor de carteira (topo). */
export function MarketSwitch() {
  const path = usePathname(), params = useSearchParams();
  const ctx = portfolioContext(path, params);
  const items: { key: Ctx; href: string; label: string }[] = [
    { key: "BR", href: "/brasil", label: "🇧🇷 Brasil" }, { key: "US", href: "/", label: "🇺🇸 Internacional" }, { key: "ALL", href: "/geral", label: "Visão geral" },
  ];
  return (
    <nav className="market-switch" aria-label="Carteira">
      {items.map((i) => <Link key={i.key} href={i.href} aria-current={ctx === i.key ? "page" : undefined}><Pending>{i.label}</Pending></Link>)}
    </nav>
  );
}

/** Submenu idêntico nas duas carteiras. */
export function PortfolioSubnav() {
  const path = usePathname(), params = useSearchParams();
  const ctx = portfolioContext(path, params);
  if (ctx === "ALL") return null;
  const cur = activeKey(ctx, path, params);
  return (
    <nav className="tabs subnav" aria-label={ctx === "BR" ? "Carteira Brasil" : "Carteira Internacional"}>
      {SUB[ctx].map((t) => (
        <Link key={t.key} href={t.href} scroll={false} aria-current={cur === t.key ? "page" : undefined}><Pending>{t.label}</Pending></Link>
      ))}
    </nav>
  );
}

/** Barra inferior do celular: carteiras + ações mais usadas. */
export function MobileBar() {
  const path = usePathname(), params = useSearchParams();
  const ctx = portfolioContext(path, params);
  const items = [
    { key: "BR", href: "/brasil", label: "Brasil", icon: "🇧🇷", on: ctx === "BR" && !path.startsWith("/analisar") },
    { key: "US", href: "/", label: "Internac.", icon: "🇺🇸", on: ctx === "US" && !path.startsWith("/analisar") },
    { key: "ALL", href: "/geral", label: "Geral", icon: "🌐", on: path.startsWith("/geral") || path.startsWith("/oportunidades") && ctx === "ALL" },
    { key: "AN", href: "/analisar", label: "Analisar", icon: "🔎", on: path.startsWith("/analisar") },
    { key: "TE", href: "/teses", label: "Teses", icon: "📓", on: path.startsWith("/teses") },
  ];
  return (
    <nav className="tabbar" aria-label="Seções">
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.on ? "page" : undefined}>
          <span className="navitem"><span className="tab-ico" aria-hidden="true">{i.icon}</span><span>{i.label}</span></span>
        </Link>
      ))}
    </nav>
  );
}
