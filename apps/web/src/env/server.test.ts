import { describe, expect, it } from "vitest";
import { serverEnvSchema } from "@scouthub/config";

describe("serverEnvSchema", () => {
  it("accepts local bootstrap configuration", () => {
    const parsed = serverEnvSchema.parse({
      APP_ENV: "local",
      APP_ORIGIN: "http://localhost:3000",
      DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
      NEXT_PUBLIC_APP_NAME: "ScoutHub-PC"
    });

    expect(parsed.APP_ENV).toBe("local");
    expect(parsed.APP_ORIGIN).toBe("http://localhost:3000");
  });
});
