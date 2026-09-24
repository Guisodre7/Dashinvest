import type { MarketStatus } from "./types";

/**
 * Status do mercado americano (NYSE/Nasdaq) calculado no fuso America/New_York.
 * Pré-mercado 04:00–09:30, regular 09:30–16:00, after-hours 16:00–20:00 ET.
 */

// Feriados NYSE (mercado fechado o dia todo).
const NYSE_HOLIDAYS = new Set([
  // 2025
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
  "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

// Pregões encerrados às 13:00 ET.
const NYSE_EARLY_CLOSE = new Set([
  "2025-07-03", "2025-11-28", "2025-12-24",
  "2026-11-27", "2026-12-24",
  "2027-11-26",
]);

export interface EtParts {
  date: string; // YYYY-MM-DD
  minutes: number; // minutos desde 00:00 ET
  weekday: number; // 0=domingo
}

export function etParts(at: Date): EtParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: hour * 60 + Number(parts.minute),
    weekday: weekdays.indexOf(parts.weekday),
  };
}

export function isTradingDay(date: string, weekday: number): boolean {
  return weekday !== 0 && weekday !== 6 && !NYSE_HOLIDAYS.has(date);
}

export function getMarketStatus(at: Date = new Date()): MarketStatus {
  const { date, minutes, weekday } = etParts(at);
  if (!isTradingDay(date, weekday)) return "CLOSED";
  const close = NYSE_EARLY_CLOSE.has(date) ? 13 * 60 : 16 * 60;
  const afterEnd = NYSE_EARLY_CLOSE.has(date) ? 17 * 60 : 20 * 60;
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "PRE-MARKET";
  if (minutes >= 9 * 60 + 30 && minutes < close) return "OPEN";
  if (minutes >= close && minutes < afterEnd) return "AFTER-HOURS";
  return "CLOSED";
}

/** Status do mercado no instante em que a cotação foi gerada. */
export function statusAt(timestampIso: string): MarketStatus {
  return getMarketStatus(new Date(timestampIso));
}

export function formatEt(at: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(at) + " ET";
}

export const MARKET_STATUS_LABEL: Record<MarketStatus, string> = {
  "PRE-MARKET": "Pré-mercado",
  OPEN: "Mercado aberto",
  "AFTER-HOURS": "After-hours",
  CLOSED: "Mercado fechado",
};
