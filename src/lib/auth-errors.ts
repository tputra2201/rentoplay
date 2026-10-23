/** Network failures are not invalid credentials and must remain retryable. */
export function isAuthConnectionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { message?: unknown; name?: unknown };
  const message = typeof value.message === "string" ? value.message : "";
  return value.name === "AuthRetryableFetchError" ||
    /failed to fetch|fetch failed|networkerror|network request failed|load failed|network connection|timed?\s*out/i.test(message);
}