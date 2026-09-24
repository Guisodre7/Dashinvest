"use client";
import { useEffect, useState } from "react";

/** Converte texto pt-BR ("5.000,50" ou "5000.5") em número. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(/^R\$|^US\$/i, "");
  if (!t) return null;
  // "5.000,50" → 5000.5 · "7.000" / "1.250.000" (milhar pt-BR) → 7000 / 1250000 · "5.5" → 5.5
  const normalized = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

const fmt = (v: number, digits: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: digits });

/** Campo numérico que aceita formato brasileiro e só propaga valores válidos. */
export function NumField({
  label, value, onChange, prefix, suffix, digits = 2, min, max, width, title,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  digits?: number;
  min?: number;
  max?: number;
  width?: number;
  title?: string;
}) {
  const [text, setText] = useState(fmt(value, digits));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value, digits));
  }, [value, digits, focused]);
  const n = parseNum(text);
  const invalid = n === null || (min !== undefined && n < min) || (max !== undefined && n > max);
  const input = (
    <span className="numfield" style={width ? { width } : undefined} data-invalid={invalid || undefined}>
      {prefix && <span className="faint">{prefix}</span>}
      <input
        inputMode="decimal"
        value={text}
        title={title}
        aria-label={label ?? title}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); if (!invalid) setText(fmt(n!, digits)); }}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseNum(e.target.value);
          if (v !== null && (min === undefined || v >= min) && (max === undefined || v <= max)) onChange(v);
        }}
      />
      {suffix && <span className="faint">{suffix}</span>}
    </span>
  );
  if (!label) return input;
  return <label>{label}{input}</label>;
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Chips<T extends string | number>({ options, value, onChange, format }: {
  options: T[]; value: T | null; onChange: (v: T) => void; format?: (v: T) => string;
}) {
  return (
    <div className="row-wrap">
      {options.map((o) => (
        <button key={String(o)} type="button" className={`btn btn-sm ${o === value ? "" : "btn-ghost"}`} aria-pressed={o === value} onClick={() => onChange(o)}>
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}
