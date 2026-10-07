import { afterEach, describe, expect, it, vi } from "vitest";
import { groupPushes, newsText, NEWS_LINK_PREFIX, type Decision, type NewsRef } from "@/lib/notify/rules";
import { translateToPt } from "@/lib/translate";

afterEach(() => vi.unstubAllGlobals());

const news: NewsRef = {
  ticker: "NVDA", title: "Nvidia beats estimates as data center sales surge", summary: "Revenue rose 60%.",
  url: "https://www.reuters.com/x", source: "Reuters", publishedAt: "2026-10-07T12:00:00Z",
  interpretation: "notícia de resultados com impacto alto (empresa citada no título).",
};

describe("notícia na notificação", () => {
  it("traduzida: título e resumo em português, marcada como tradução, com link", () => {
    const t = newsText(news, { title: "Nvidia supera estimativas com alta nas vendas de data center", summary: "A receita subiu 60%." });
    expect(t.title).toBe("NVDA: Nvidia supera estimativas com alta nas vendas de data center");
    expect(t.body).toMatch(/Resumo: A receita subiu 60%\./);
    expect(t.body).toMatch(/Tradução automática/);
    expect(t.body).toContain(`${NEWS_LINK_PREFIX} (Reuters): https://www.reuters.com/x`);
  });

  it("sem tradução: original, sem aviso de tradução", () => {
    const t = newsText(news);
    expect(t.title).toContain("Nvidia beats");
    expect(t.body).not.toMatch(/Tradução automática/);
  });

  it("link não-http é descartado", () => {
    expect(newsText({ ...news, url: "javascript:alert(1)" }).body).not.toContain(NEWS_LINK_PREFIX);
  });

  it("o texto do push sai sem a linha do link (fica na central)", () => {
    const d = { ...newsText(news), category: "news", priority: "medium", market: "US", ticker: "NVDA", reason: "x", url: "/ativo/NVDA", key: "k", delivery: "sent", group_key: null } as Decision;
    const [push] = groupPushes([d], false, "r");
    expect(push.body).not.toContain(NEWS_LINK_PREFIX);
    expect(push.body).toContain("FATO:");
  });
});

describe("tradução gratuita (MyMemory)", () => {
  it("devolve o texto traduzido", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: "Olá &quot;mundo&quot;" } })));
    expect(await translateToPt("Hello \"world\" unique-1")).toBe("Olá \"mundo\"");
  });
  it("limite esgotado ou erro → null (fica o original)", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ responseStatus: 429, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS" } })));
    expect(await translateToPt("Hello unique-2")).toBeNull();
    vi.stubGlobal("fetch", async () => { throw new Error("rede"); });
    expect(await translateToPt("Hello unique-3")).toBeNull();
  });
});
