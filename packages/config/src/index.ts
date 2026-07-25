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
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.url().startsWith("postgres"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().default(""),
  CLERK_SECRET_KEY: z.string().default(""),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/sign-up"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("ScoutHub-PC")
}).superRefine((env, context) => {
  if ((env.APP_ENV === "preview" || env.APP_ENV === "production") && env.CLERK_SECRET_KEY.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["CLERK_SECRET_KEY"],
      message: "CLERK_SECRET_KEY is required outside local/test."
    });
  }
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
