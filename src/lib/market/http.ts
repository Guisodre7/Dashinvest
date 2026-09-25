import "server-only";
import { logApiCall } from "../db/apiLog";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Disjuntor: endpoints que respondem "não incluso no plano" (401/403) são
// pausados por 12h; limite de requisições (429) pausa o fornecedor por 60s.
// Evita dezenas de chamadas inúteis por página (e o efeito cascata no limite).
// ---------------------------------------------------------------------------
const blocked = new Map<string, { until: number; status: number }>();

export function blockEndpoint(key: string, status: number, ms: number) {
  blocked.set(key, { until: Date.now() + ms, status });
}

function checkBlocked(provider: string, endpoint: string) {
  const now = Date.now();
  for (const key of [`${provider}|*`, `${provider}|${endpoint}`]) {
    const b = blocked.get(key);
    if (b && b.until > now) throw new HttpError(b.status, `${provider} ${endpoint}: pausado (${b.status})`);
    if (b) blocked.delete(key);
  }
}

/**
 * GET JSON server-side com cache do Next (revalidate em segundos; 0 = sem cache).
 * Só erros são registrados em api_logs. A URL pode conter a API key — nunca é logada.
 */
export async function getJson<T>(
  provider: string,
  endpoint: string,
  url: string,
  opts: { revalidate: number; ticker?: string; timeoutMs?: number },
): Promise<T> {
  checkBlocked(provider, endpoint);
  const started = Date.now();
  const controller = new AbortController();
  // Página não espera fornecedor lento: sem resposta em 5s, o dado aparece como indisponível.
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      ...(opts.revalidate > 0
        ? { next: { revalidate: opts.revalidate } }
        : { cache: "no-store" as const }),
    });
    const latency = Date.now() - started;
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) blockEndpoint(`${provider}|${endpoint}`, res.status, 12 * 3600_000);
      if (res.status === 429) blockEndpoint(`${provider}|*`, 429, 60_000);
      logApiCall({ provider, endpoint, ticker: opts.ticker, status: res.status, latency_ms: latency, error: res.statusText });
      throw new HttpError(res.status, `${provider} ${endpoint}: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (!(err instanceof HttpError)) {
      logApiCall({
        provider, endpoint, ticker: opts.ticker, status: null,
        latency_ms: Date.now() - started, error: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || v === "None" || v === "-") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
