export function isLocalIdentityMode(env: Record<string, string | undefined>): boolean {
  if (env.APP_ENV !== "local") {
    return false;
  }
  return isLoopbackUrl(env.APP_ORIGIN) && isLoopbackUrl(env.DATABASE_URL);
}

function isLoopbackUrl(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
