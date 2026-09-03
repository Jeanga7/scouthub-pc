export const organizationTypes = [
  "NSO",
  "REGION",
  "DISTRICT",
  "GROUP",
  "ANNEX",
  "UNIT",
  "TEAM"
] as const;

export type OrganizationType = (typeof organizationTypes)[number];

export const slice1CreatableOrganizationTypes = [
  "NSO",
  "REGION",
  "DISTRICT",
  "GROUP",
  "ANNEX",
  "UNIT"
] as const satisfies readonly OrganizationType[];

export function isSlice1CreatableType(type: OrganizationType): boolean {
  return slice1CreatableOrganizationTypes.includes(
    type as (typeof slice1CreatableOrganizationTypes)[number]
  );
}
