import "server-only";
import { unstable_cache } from "next/cache";
import { getJson } from "./http";
import { isDemoProvider } from "./index";

export interface BrRates { selic: number; ipca12m: number; real: number; asOf: string }

type SgsRow = { data: string; valor: string };
const sgs = (id: number) => `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${id}/dados/ultimos/1?formato=json`;

/** Juro real anual (%) a partir da Selic meta e do IPCA de 12 meses. */
export const realRate = (selic: number, ipca: number) => ((1 + selic / 100) / (1 + ipca / 100) - 1) * 100;

/**
 * Selic meta (SGS 432) e IPCA acumulado em 12 meses (SGS 13522) — Banco Central,
 * gratuito e sem chave. Cache de 12h; sem resposta → null (o valuation usa a convenção fixa).
 */
const fetchRates = unstable_cache(async (): Promise<BrRates | null> => {
  const [s, i] = await Promise.all([getJson<SgsRow[]>("bcb", "sgs.432", sgs(432), { revalidate: 0 }), getJson<SgsRow[]>("bcb", "sgs.13522", sgs(13522), { revalidate: 0 })]);
  const selic = Number(s?.[0]?.valor), ipca = Number(i?.[0]?.valor);
  if (!Number.isFinite(selic) || !Number.isFinite(ipca)) throw new Error("SGS sem valor");
  return { selic, ipca12m: ipca, real: realRate(selic, ipca), asOf: (s[0].data ?? "").split("/").reverse().join("-") };
}, ["bcb-rates"], { revalidate: 12 * 3600 });

export async function getBrRates(): Promise<BrRates | null> {
  if (isDemoProvider() && process.env.NODE_ENV !== "production") return { selic: 15, ipca12m: 5, real: realRate(15, 5), asOf: "2026-10-01" };
  return fetchRates().catch(() => null);
}
