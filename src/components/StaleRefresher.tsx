"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Quando a página foi servida com a análise anterior (navegação instantânea),
 * mostra de quando ela é e recarrega sozinha assim que a nova estiver pronta.
 */
export default function StaleRefresher({ computedAt, staleAfterMs = 30_000 }: { computedAt: string; staleAfterMs?: number }) {
  const router = useRouter();
  // Calculado só no navegador (evita divergência de hidratação com o relógio do servidor).
  const [stale, setStale] = useState(false);
  useEffect(() => {
    setStale(Date.now() - new Date(computedAt).getTime() > staleAfterMs);
  }, [computedAt, staleAfterMs]);
  useEffect(() => {
    if (!stale) return;
    const id = setTimeout(() => router.refresh(), 3500);
    return () => clearTimeout(id);
  }, [stale, computedAt, router]);
  if (!stale) return null;
  const hhmm = new Date(computedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return <span className="badge stale-badge" role="status">Análise de {hhmm} — atualizando…</span>;
}
