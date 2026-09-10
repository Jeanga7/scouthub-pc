import { MemberUseCases } from "@scouthub/application";
import { createPgMemberRepository } from "@scouthub/infrastructure";
import { getServerEnv } from "@/env/server";

export function createMemberUseCases() {
  return new MemberUseCases(
    createPgMemberRepository(getServerEnv().DATABASE_URL),
    {
      generate() {
        return crypto.randomUUID();
      },
    },
  );
}
