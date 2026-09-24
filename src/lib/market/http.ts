import "server-only";
import { logApiCall } from "../db/apiLog";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * GET JSON server-side com cache do Next (revalidate em segundos; 0 = sem cache)
 * e registro em api_logs. A URL pode conter a API key — nunca é logada.
 */
export async function getJson<T>(
  provider: string,
  endpoint: string,
  url: string,
  opts: { revalidate: number; ticker?: string; timeoutMs?: number },
): Promise<T> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      ...(opts.revalidate > 0
        ? { next: { revalidate: opts.revalidate } }
        : { cache: "no-store" as const }),
    });
    const latency = Date.now() - started;
    if (!res.ok) {
      logApiCall({ provider, endpoint, ticker: opts.ticker, status: res.status, latency_ms: latency, error: res.statusText });
      throw new HttpError(res.status, `${provider} ${endpoint}: HTTP ${res.status}`);
    }
    const body = (await res.json()) as T;
    logApiCall({ provider, endpoint, ticker: opts.ticker, status: res.status, latency_ms: latency });
    return body;
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
