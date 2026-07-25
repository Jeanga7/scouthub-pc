import { z } from "zod";

export const appEnvironmentSchema = z.enum([
  "local",
  "test",
  "preview",
  "staging",
  "production"
]);

export const serverEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema.default("local"),
  DATABASE_URL: z.url().startsWith("postgres"),
  ENABLE_DEV_ADMIN: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("ScoutHub Region")
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function isDevAdminEnabled(env: ServerEnv): boolean {
  return (env.APP_ENV === "local" || env.APP_ENV === "test") && env.ENABLE_DEV_ADMIN;
}
