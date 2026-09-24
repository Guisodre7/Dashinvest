import { freshnessConfig } from "../freshness-config";
import { getMarketStatus } from "./marketStatus";
import type { DataMeta, MarketStatus } from "./types";

export type FreshnessLevel = "realtime" | "fresh" | "delayed" | "stale" | "missing";

export interface Freshness {
  level: FreshnessLevel;
  label: string;
  /** Idade atual (s). */
  age: number | null;
  /** Bloqueia recomendações baseadas no preço atual. */
  blocksPriceDecisions: boolean;
}

export function ageSeconds(timestampIso: string, now: Date = new Date()): number {
  return Math.max(0, Math.round((now.getTime() - new Date(timestampIso).getTime()) / 1000));
}

export function buildMeta(input: {
  timestamp: string;
  source: string;
  is_realtime: boolean;
  delay_minutes?: number | null;
  now?: Date;
}): DataMeta {
  const now = input.now ?? new Date();
  const delay = input.delay_minutes ?? (input.is_realtime ? 0 : null);
  return {
    timestamp: input.timestamp,
    source: input.source,
    data_age: ageSeconds(input.timestamp, now),
    market_status: getMarketStatus(now),
    is_realtime: input.is_realtime,
    is_delayed: !input.is_realtime,
    delay_minutes: delay,
  };
}

export function humanAge(seconds: number): string {
  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? "" : "s"}`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} minuto${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} hora${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} dia${d === 1 ? "" : "s"}`;
}

/**
 * Avalia a validade de uma cotação. Com mercado aberto exige idade <= MAX_MARKET_DATA_AGE;
 * fora do pregão regular aceita o último fechamento, mas nunca o rotula como tempo real.
 */
export function quoteFreshness(
  meta: DataMeta | null | undefined,
  now: Date = new Date(),
  statusNow: MarketStatus = getMarketStatus(now),
  cfg: Pick<typeof freshnessConfig, "maxMarketDataAgeSec" | "maxMarketDataAgeClosedSec"> = freshnessConfig,
): Freshness {
  if (!meta) {
    return { level: "missing", label: "Sem cotação disponível", age: null, blocksPriceDecisions: true };
  }
  const age = ageSeconds(meta.timestamp, now);

  if (statusNow === "OPEN") {
    if (age > cfg.maxMarketDataAgeSec) {
      const delayedByContract = meta.is_delayed && meta.delay_minutes
        ? ` (fornecedor com atraso de ${meta.delay_minutes} min)`
        : "";
      return {
        level: "stale",
        label: `Dados desatualizados — há ${humanAge(age)}${delayedByContract}`,
        age,
        blocksPriceDecisions: true,
      };
    }
    if (!meta.is_realtime) {
      return {
        level: "delayed",
        label: meta.delay_minutes
          ? `Dados com atraso de ${meta.delay_minutes} minutos`
          : `Dados não-realtime — atualizados há ${humanAge(age)}`,
        age,
        blocksPriceDecisions: true,
      };
    }
    return { level: "realtime", label: `Dados atualizados há ${humanAge(age)}`, age, blocksPriceDecisions: false };
  }

  // Fora do pregão regular: o preço de referência é o último fechamento (ou pré/pós, explicitado na UI).
  if (age > cfg.maxMarketDataAgeClosedSec) {
    return {
      level: "stale",
      label: `Dados desatualizados — há ${humanAge(age)}`,
      age,
      blocksPriceDecisions: true,
    };
  }
  return {
    level: "fresh",
    label: `Mercado ${statusNow === "CLOSED" ? "fechado" : statusNow === "PRE-MARKET" ? "em pré-mercado" : "em after-hours"} — última atualização há ${humanAge(age)}`,
    age,
    blocksPriceDecisions: false,
  };
}

export function isOlderThan(timestampIso: string | null | undefined, maxSec: number, now = new Date()): boolean {
  if (!timestampIso) return true;
  return ageSeconds(timestampIso, now) > maxSec;
}
