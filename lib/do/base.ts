/**
 * Shared DigitalOcean API client base
 * Includes configurable timeouts, retry with exponential backoff,
 * rate limit (429) handling, and request logging.
 */

export const DO_API_BASE = "https://api.digitalocean.com/v2";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

export interface DORequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

export class DOApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "DOApiError";
  }
}

/** Validate that an ID is a positive integer (DigitalOcean resource IDs) */
export function assertDOId(id: number, label: string): void {
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    throw new DOApiError(400, `Invalid ${label} id: ${id}`);
  }
}

function isRetryable(status: number): boolean {
  return status >= 500 || status === 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make a request to the DigitalOcean API.
 */
export async function doRequest<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  options?: DORequestOptions,
): Promise<T> {
  const url = `${DO_API_BASE}${path}`;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const durationMs = Date.now() - start;
      console.log(
        `[do] ${method} ${path} → ${res.status} (${durationMs}ms)`,
      );

      // Handle 429 rate limiting
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter
          ? parseRetryAfter(retryAfter)
          : INITIAL_BACKOFF_MS * Math.pow(2, attempt);

        if (attempt < maxRetries) {
          console.log(`[do] Rate limited, waiting ${waitMs}ms before retry`);
          await sleep(waitMs);
          continue;
        }
        throw new DOApiError(429, `DO API ${method} ${path}: rate limited`);
      }

      // Retry on 5xx
      if (res.status >= 500) {
        const text = await res.text();
        lastError = new DOApiError(
          res.status,
          `DO API ${method} ${path}: ${res.status} ${text}`,
        );
        if (attempt < maxRetries) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.log(
            `[do] Server error ${res.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await sleep(backoff);
          continue;
        }
        throw lastError;
      }

      // Non-retryable error
      if (!res.ok) {
        const text = await res.text();
        throw new DOApiError(
          res.status,
          `DO API ${method} ${path}: ${res.status} ${text}`,
        );
      }

      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timer);

      // Network errors and timeouts are retryable
      if (
        err instanceof DOApiError &&
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
          `[do] ${method} ${path} → ${reason} (${durationMs}ms)`,
        );
        lastError = new DOApiError(
          isAbort ? 504 : 502,
          `DO API ${method} ${path}: ${reason}`,
        );
        if (attempt < maxRetries) {
          const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.log(
            `[do] ${reason}, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`,
          );
          await sleep(backoff);
          continue;
        }
        throw lastError;
      }

      // Re-throw DOApiError (already handled above for retryable)
      if (err instanceof DOApiError) {
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
