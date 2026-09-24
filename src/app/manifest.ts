import type { MetadataRoute } from "next";

/** Permite "Adicionar à tela inicial" — abre em tela cheia, como app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Carteira Internacional",
    short_name: "Carteira",
    description: "Painel privado da carteira internacional.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f6f3",
    theme_color: "#1f3a5f",
    icons: [
      { src: "/pwa-icon?s=192", sizes: "192x192", type: "image/png" },
      { src: "/pwa-icon?s=512", sizes: "512x512", type: "image/png" },
      { src: "/pwa-icon?s=512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
