/** Formatação pt-BR, segura para cliente e servidor. `null` vira "—" (nunca preenchido). */

export const DASH = "—";

export function n(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function usd(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : `US$ ${n(v, digits)}`;
}

export function brl(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? DASH : `R$ ${n(v, digits)}`;
}

export function pct(v: number | null | undefined, digits = 1, signed = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${signed && v > 0 ? "+" : ""}${n(v, digits)}%`;
}

export function pp(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  return `${v > 0 ? "+" : ""}${n(v, digits)} p.p.`;
}

export function compact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return DASH;
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${n(v / 1e12, 2)} tri`;
  if (abs >= 1e9) return `${n(v / 1e9, 2)} bi`;
  if (abs >= 1e6) return `${n(v / 1e6, 2)} mi`;
  if (abs >= 1e3) return `${n(v / 1e3, 1)} mil`;
  return n(v, 0);
}

export function tone(v: number | null | undefined, threshold = 0): "pos" | "neg" | "" {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  if (v > threshold) return "pos";
  if (v < -threshold) return "neg";
  return "";
}

export function dateBr(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: iso.length === 10 ? "UTC" : undefined });
}

export function dateTimeEt(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/New_York", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " ET";
}

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}
