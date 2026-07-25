import { describe, expect, it } from "vitest";
import { denyByDefault } from ".";

describe("denyByDefault", () => {
  it("denies until explicit policies are added", () => {
    expect(denyByDefault()).toBe("deny");
  });
});
