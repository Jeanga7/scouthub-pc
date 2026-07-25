import { z } from "zod";

export const appEnvironmentSchema = z.enum([
  "local",
  "test",
  "preview",
  "staging",
  "production"
]);

export const serverEnvSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  APP_ORIGIN: z.url(),
  DATABASE_URL: z.url().startsWith("postgres"),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
  CLERK_SECRET_KEY: z.string(),
  CLERK_AUTHORIZED_PARTIES: z.string().optional(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default("/sign-up"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("ScoutHub-PC")
}).superRefine((env, context) => {
  const clerkRequired = env.APP_ENV === "preview" || env.APP_ENV === "staging" || env.APP_ENV === "production";
  if (clerkRequired && env.CLERK_SECRET_KEY.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["CLERK_SECRET_KEY"],
      message: "CLERK_SECRET_KEY is required outside local/test."
    });
  }
  if (clerkRequired && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      message: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required outside local/test."
    });
  }
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
