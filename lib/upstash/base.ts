/**
 * Shared Upstash Management API client base
 * Includes configurable timeouts, retry with exponential backoff,
 * rate limit (429) handling, and request logging.
 *
 * Auth: HTTP Basic with UPSTASH_EMAIL:UPSTASH_API_KEY
 */

export const UPSTASH_API_BASE = "https://api.upstash.com/v2";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

export interface UpstashRequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

export class UpstashApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "UpstashApiError";
  }
}

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make a request to the Upstash Management API.
 * Uses HTTP Basic auth with email:api_key.
 */
export async function upstashRequest<T>(
  email: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
  options?: UpstashRequestOptions,
): Promise<T> {
  const url = `${UPSTASH_API_BASE}${path}`;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;
  const basicAuth = Buffer.from(`${email}:${apiKey}`).toString("base64");

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const durationMs = Date.now() - start;
      console.log(
        `[upstash] ${method} ${path} → ${res.status} (${durationMs}ms)`,
      );

      // Handle 429 rate limiting
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter
          ? parseRetryAfter(retryAfter)
          : INITIAL_BACKOFF_MS * Math.pow(2, attempt);

        if (attempt < maxRetries) {
          console.log(`[upstash] Rate limited, waiting ${waitMs}ms before retry`);
          await sleep(waitMs);
          continue;
        }
        throw new UpstashApiError(429, `Upstash API ${method} ${path}: rate limited`);
      }

      // Retry on 5xx
      if (res.status >= 500) {
        const text = await res.text();
        lastError = new UpstashApiError(
          res.status,
          `Upstash API ${method} ${path}: ${res.status} ${text}`,
        );
        if (attempt < maxRetries) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.log(
            `[upstash] Server error ${res.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await sleep(backoff);
          continue;
        }
        throw lastError;
      }

      // Non-retryable error
      if (!res.ok) {
        const text = await res.text();
        throw new UpstashApiError(
          res.status,
          `Upstash API ${method} ${path}: ${res.status} ${text}`,
        );
      }

      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timer);

      // Network errors and timeouts are retryable
      if (
        err instanceof UpstashApiError &&
        !isRetryable(err.statusCode)
      ) {
        throw err;
      }

      const isAbort =
        err instanceof DOMException && err.name === "AbortError";
      const isNetworkError =
        err instanceof TypeError && (err.message.includes("fetch") || err.message.includes("network"));

      if (isAbort || isNetworkError) {
        const durationMs = Date.now() - start;
        const reason = isAbort ? "timeout" : "network error";
        console.log(
          `[upstash] ${method} ${path} → ${reason} (${durationMs}ms)`,
        );
        lastError = new UpstashApiError(
          isAbort ? 504 : 502,
          `Upstash API ${method} ${path}: ${reason}`,
        );
        if (attempt < maxRetries) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.log(
            `[upstash] ${reason}, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await sleep(backoff);
          continue;
        }
        throw lastError;
      }

      // Re-throw UpstashApiError (already handled above for retryable)
      if (err instanceof UpstashApiError) {
        throw err;
      }

      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("Unexpected: exhausted retries");
}

/** Parse retry-after header value (seconds or HTTP date) */
function parseRetryAfter(value: string): number {
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) {
    return Math.max(seconds * 1000, 100);
  }
  const date = new Date(value).getTime();
  if (!Number.isNaN(date)) {
    return Math.max(date - Date.now(), 100);
  }
  return INITIAL_BACKOFF_MS;
}
