import { OrganizationUseCases } from "@scouthub/application";
import type { OrganizationRepository } from "@scouthub/application";
import { getServerEnv } from "@/env/server";

interface InfrastructureOrganizationModule {
  readonly createPgOrganizationRepository: (
    databaseUrl: string
  ) => OrganizationRepository;
}

export async function createOrganizationUseCases(): Promise<OrganizationUseCases> {
  const env = getServerEnv();
  /* eslint-disable @typescript-eslint/no-implied-eval -- The PostgreSQL Node adapter is dev-admin local/test only and must not be statically traced into the Cloudflare Worker bundle. */
  const loadInfrastructure =
    new Function("specifier", "return import(specifier)") as (
      specifier: string
    ) => Promise<InfrastructureOrganizationModule>;
  /* eslint-enable @typescript-eslint/no-implied-eval */
  const { createPgOrganizationRepository } = await loadInfrastructure(
    "@scouthub/infrastructure"
  );

  return new OrganizationUseCases(
    createPgOrganizationRepository(env.DATABASE_URL),
    {
      generate() {
        return crypto.randomUUID();
      }
    }
  );
}
