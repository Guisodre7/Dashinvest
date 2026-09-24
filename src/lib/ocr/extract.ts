import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { serverConfig } from "../config";
import type { RawTrade } from "./normalize";

/**
 * Leitura de comprovantes de compra (print da corretora ou nota em PDF) com
 * o Claude (visão + saída estruturada). A imagem é processada em memória e
 * NÃO é armazenada. O resultado é apenas um rascunho: o usuário revisa e
 * confirma antes de qualquer registro.
 */

const TradeSchema = z.object({
  is_trade_confirmation: z.boolean().describe("true se o documento é a confirmação/nota de uma ordem executada de compra ou venda de ativo"),
  side: z.enum(["buy", "sell", "unknown"]),
  ticker: z.string().nullable().describe("Ticker exatamente como aparece (ex.: NVDA, BRK.B, JEPQ). null se não aparecer"),
  company_name: z.string().nullable(),
  quantity: z.number().nullable().describe("Quantidade de cotas/ações executadas, inclusive frações"),
  price: z.number().nullable().describe("Preço de execução por cota, na moeda do ativo"),
  gross_amount: z.number().nullable().describe("Valor bruto da operação (quantidade × preço), se exibido"),
  fees: z.number().nullable().describe("Soma de taxas/corretagem/emolumentos da operação, se exibida; 0 se o documento disser explicitamente que não há taxa"),
  total_amount: z.number().nullable().describe("Valor total debitado/creditado, se exibido"),
  currency: z.string().nullable().describe("Moeda dos valores (ex.: USD, BRL)"),
  trade_date: z.string().nullable().describe("Data de execução no formato YYYY-MM-DD"),
  broker: z.string().nullable().describe("Nome da corretora, se identificável"),
  fx_rate: z.number().nullable().describe("Câmbio R$ por US$1 somente se aparecer explicitamente no documento"),
  notes: z.string().nullable().describe("Ambiguidades relevantes (texto cortado, valores ilegíveis, múltiplas ordens); null se nada a observar"),
});

const SYSTEM = `Você extrai dados de comprovantes de ordens de corretoras (Avenue, Nomad, Inter, XP, Interactive Brokers, Schwab etc.).
Regras:
- Transcreva somente o que está visível no documento. Nunca estime, arredonde de forma criativa ou complete com conhecimento externo (por exemplo, não use o preço de mercado do ativo).
- Campo ausente, cortado ou ilegível = null. Na dúvida entre dois valores, use null e explique em notes.
- Números: converta formato brasileiro (1.234,56) para decimal (1234.56). Preserve frações de cotas.
- Se houver várias ordens, extraia a principal/mais recente e mencione as demais em notes.
- Datas no formato YYYY-MM-DD.`;

export type ExtractError = { kind: "not_configured" | "refused" | "unreadable" | "api"; message: string };

export type ExtractInput =
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string }
  | { type: "pdf"; base64: string };

let client: Anthropic | null = null;

export async function extractTradeFromDocument(input: ExtractInput): Promise<{ ok: true; raw: RawTrade; model: string } | { ok: false; error: ExtractError }> {
  if (!serverConfig.anthropicApiKey) {
    return { ok: false, error: { kind: "not_configured", message: "Leitura automática indisponível: configure ANTHROPIC_API_KEY na Vercel." } };
  }
  client ??= new Anthropic({ apiKey: serverConfig.anthropicApiKey, timeout: 60_000, maxRetries: 1 });

  const source: Anthropic.Beta.BetaContentBlockParam = input.type === "pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } }
    : { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } };

  try {
    const response = await client.beta.messages.parse({
      model: serverConfig.llmModel,
      max_tokens: 4000,
      // Recusas raras: o servidor reencaminha automaticamente para outro modelo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(TradeSchema) },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [source, { type: "text", text: "Extraia os dados da ordem deste comprovante." }],
      }],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: { kind: "refused", message: "O documento não pôde ser processado. Preencha manualmente." } };
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return { ok: false, error: { kind: "unreadable", message: "Não foi possível ler o comprovante com segurança. Tente uma imagem mais nítida ou preencha manualmente." } };
    }
    return { ok: true, raw: response.parsed_output, model: response.model };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: { kind: "api", message: "Muitas leituras em sequência — aguarde alguns segundos e tente de novo." } };
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: { kind: "not_configured", message: "ANTHROPIC_API_KEY inválida — verifique a variável na Vercel." } };
    }
    if (err instanceof Anthropic.BadRequestError) {
      return { ok: false, error: { kind: "unreadable", message: "Arquivo não aceito pela leitura automática (formato ou tamanho). Envie JPG, PNG ou PDF menor." } };
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: { kind: "api", message: `Serviço de leitura indisponível (HTTP ${err.status ?? "?"}). Tente novamente.` } };
    }
    return { ok: false, error: { kind: "api", message: "Falha de conexão com o serviço de leitura. Tente novamente." } };
  }
}
