import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Carteira Internacional",
  description: "Painel privado de acompanhamento da carteira internacional.",
  robots: {
    index: false, follow: false, nocache: true, noarchive: true, nosnippet: true,
    googleBot: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true },
  },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1113" },
  ],
};

// Aplica o tema salvo antes da hidratação (evita flash).
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Script id="theme" strategy="beforeInteractive">{themeScript}</Script>
        {children}
      </body>
    </html>
  );
}
