/**
 * "Confirmar com fontes": onde conferir balanço, consenso de analistas, notícias e
 * comunicados oficiais do ativo antes de decidir. Links públicos, abertos em nova aba.
 */
export function sourcesFor(market: "US" | "BR", ticker: string, fii = false): { label: string; href: string }[] {
  const t = encodeURIComponent(ticker), lower = ticker.toLowerCase();
  if (market === "US") return [
    { label: "Comunicados oficiais (SEC)", href: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${t}&type=10-&dateb=&owner=include&count=40` },
    { label: "Consenso de analistas", href: `https://finance.yahoo.com/quote/${t}/analysis` },
    { label: "Análises e transcrições", href: `https://seekingalpha.com/symbol/${t}/analysis` },
    { label: "Valuation (Morningstar)", href: `https://www.morningstar.com/search?query=${t}` },
    { label: "Indicadores e notícias", href: `https://finviz.com/quote.ashx?t=${t}` },
    { label: "Notícias", href: `https://news.google.com/search?q=${t}%20stock&hl=en-US` },
  ];
  return [
    { label: "Indicadores (Status Invest)", href: `https://statusinvest.com.br/${fii ? "fundos-imobiliarios" : "acoes"}/${lower}` },
    { label: "Indicadores (Investidor10)", href: `https://investidor10.com.br/${fii ? "fiis" : "acoes"}/${lower}/` },
    { label: "Balanços (Fundamentus)", href: `https://www.fundamentus.com.br/detalhes.php?papel=${t}` },
    { label: "Fatos relevantes e RI", href: `https://www.google.com/search?q=${t}+rela%C3%A7%C3%B5es+com+investidores+fato+relevante` },
    { label: "Notícias", href: `https://news.google.com/search?q=${t}&hl=pt-BR` },
  ];
}

export default function SourceLinks({ market, ticker, fii = false }: { market: "US" | "BR"; ticker: string; fii?: boolean }) {
  return (
    <div className="xsmall source-links">
      <span className="muted">Confirmar com fontes:</span>{" "}
      {sourcesFor(market, ticker, fii).map((s, i) => (
        <span key={s.href}>{i > 0 && " · "}<a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a></span>
      ))}
    </div>
  );
}
