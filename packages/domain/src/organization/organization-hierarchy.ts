import type { OrganizationType } from "./organization-type";

const allowedParentChild = new Set<string>([
  "NSO:REGION",
  "REGION:DISTRICT",
  "DISTRICT:GROUP",
  "GROUP:ANNEX",
  "GROUP:UNIT",
  "ANNEX:UNIT"
]);

export function isAllowedParentChild(
  parentType: OrganizationType,
  childType: OrganizationType
): boolean {
  return allowedParentChild.has(`${parentType}:${childType}`);
}

/** V1 vocabulary for the server-side organization containment policy. */
export const canContain = isAllowedParentChild;

export function buildOrganizationPath(
  parentPath: string | null,
  organizationId: string
): string {
  // A trailing slash makes UUID segment prefix checks unambiguous for descendants.
  return parentPath === null ? `/${organizationId}/` : `${parentPath}${organizationId}/`;
}

export function isDescendantPath(candidatePath: string, parentPath: string): boolean {
  return candidatePath.startsWith(parentPath) && candidatePath !== parentPath;
}

export function replacePathPrefix(
  path: string,
  oldPrefix: string,
  newPrefix: string
): string {
  return `${newPrefix}${path.slice(oldPrefix.length)}`;
}
