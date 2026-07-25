export function authorizedPartiesFromEnv(env: Record<string, string | undefined>): string[] {
  const explicit = env.CLERK_AUTHORIZED_PARTIES?.trim();
  const configured =
    explicit !== undefined && explicit.length > 0
      ? explicit
      : env.APP_ORIGIN?.trim() ?? "";
  const origins = configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map(validateOrigin);
  if (origins.length === 0) {
    throw new Error("At least one Clerk authorized party origin is required.");
  }
  return origins;
}

function validateOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid Clerk authorized party origin: ${value}`);
  }
  if (url.origin !== value || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error(`Invalid Clerk authorized party origin: ${value}`);
  }
  return value;
}
