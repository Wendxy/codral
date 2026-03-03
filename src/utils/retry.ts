const DEFAULT_RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export interface RetryOptions {
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

function extractStatus(error: unknown): number | null {
  if (typeof error !== "object" || !error) {
    return null;
  }
  const maybeStatus = (error as { status?: number }).status;
  if (typeof maybeStatus === "number") {
    return maybeStatus;
  }
  const responseStatus = (error as { response?: { status?: number } }).response?.status;
  return typeof responseStatus === "number" ? responseStatus : null;
}

function extractRetryAfterMs(error: unknown): number | null {
  if (typeof error !== "object" || !error) {
    return null;
  }

  const retryAfterHeader =
    (error as { response?: { headers?: Record<string, string> } }).response?.headers?.["retry-after"] ??
    (error as { headers?: Record<string, string> }).headers?.["retry-after"];

  if (!retryAfterHeader) {
    return null;
  }

  const asNumber = Number(retryAfterHeader);
  if (Number.isFinite(asNumber)) {
    return Math.max(0, asNumber * 1000);
  }

  const parsedDate = Date.parse(retryAfterHeader);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, parsedDate - Date.now());
  }

  return null;
}

function defaultShouldRetry(error: unknown): boolean {
  const status = extractStatus(error);
  if (status === null) {
    return true;
  }
  return DEFAULT_RETRYABLE_STATUS.has(status);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  action: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 4;
  const minDelayMs = options.minDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) {
        throw error;
      }

      const exponential = Math.min(maxDelayMs, minDelayMs * 2 ** attempt);
      const retryAfterMs = extractRetryAfterMs(error);
      const delayMs = retryAfterMs ?? exponential;
      await sleep(delayMs);
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unknown retry failure");
}
