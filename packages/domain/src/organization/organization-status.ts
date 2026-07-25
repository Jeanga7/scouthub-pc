export const organizationStatuses = ["DRAFT", "ACTIVE"] as const;

export type OrganizationStatus = (typeof organizationStatuses)[number];
