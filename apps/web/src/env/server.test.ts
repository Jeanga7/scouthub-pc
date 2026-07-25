import { describe, expect, it } from "vitest";
import { serverEnvSchema } from "@scouthub/config";

describe("serverEnvSchema", () => {
  it("accepts local bootstrap configuration", () => {
    const parsed = serverEnvSchema.parse({
      APP_ENV: "local",
      DATABASE_URL: "postgres://scouthub:scouthub@localhost:5433/scouthub",
      ENABLE_DEV_ADMIN: "false",
      NEXT_PUBLIC_APP_NAME: "ScoutHub-PC"
    });

    expect(parsed.APP_ENV).toBe("local");
    expect(parsed.ENABLE_DEV_ADMIN).toBe(false);
  });
});
