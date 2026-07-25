export function authorizedPartiesFromEnv(env: Record<string, string | undefined>): string[] {
  const configured = env.CLERK_AUTHORIZED_PARTIES ?? env.APP_ORIGIN ?? "";
  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
