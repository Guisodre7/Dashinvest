"use client";
import { useEffect, useState } from "react";
import { getMarketStatus, MARKET_STATUS_LABEL } from "@/lib/market/marketStatus";

export default function MarketClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return <span className="small faint">—</span>;
  const status = getMarketStatus(now);
  const et = now.toLocaleTimeString("pt-BR", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const local = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dot = status === "OPEN" ? "dot-live" : status === "CLOSED" ? "" : "dot-warn";
  return (
    <div className="row small nowrap" title={`Status do mercado americano: ${status}`}>
      <span className="row" style={{ gap: 6 }}><span className={`dot ${dot}`} /><strong>{status}</strong><span className="muted">{MARKET_STATUS_LABEL[status]}</span></span>
      <span className="num muted">{et} ET</span>
      <span className="num faint">{local} local</span>
    </div>
  );
}
