import { serverEnvSchema, type ServerEnv } from "@scouthub/config";

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= serverEnvSchema.parse({
    APP_ENV: process.env.APP_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    ENABLE_DEV_ADMIN: process.env.ENABLE_DEV_ADMIN,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME
  });

  return cachedEnv;
}

export function resetServerEnvForTests(): void {
  cachedEnv = undefined;
}
