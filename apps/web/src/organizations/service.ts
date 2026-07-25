import { OrganizationUseCases } from "@scouthub/application";
import { createPgOrganizationRepository } from "@scouthub/infrastructure";
import { getServerEnv } from "@/env/server";

export function createOrganizationUseCases(): OrganizationUseCases {
  const env = getServerEnv();
  return new OrganizationUseCases(
    createPgOrganizationRepository(env.DATABASE_URL),
    {
      generate() {
        return crypto.randomUUID();
      }
    }
  );
}
