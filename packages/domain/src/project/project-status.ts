export type ProjectStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FINAL_SUBMITTED"
  | "FINAL_APPROVED"
  | "CANCELLED";

export const projectStatuses = [
  "DRAFT",
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "APPROVED",
  "IN_PROGRESS",
  "COMPLETED",
  "FINAL_SUBMITTED",
  "FINAL_APPROVED",
  "CANCELLED"
] as const;

