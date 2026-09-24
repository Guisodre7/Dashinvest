"use client";

export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch {}
  }
  return <button type="button" className="btn btn-ghost btn-sm" onClick={toggle} aria-label="Alternar tema claro/escuro">◐</button>;
}
