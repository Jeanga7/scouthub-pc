import type { ProjectStatus } from "./project-status";
import { ProjectDomainError } from "./project-errors";

export type Slice4ProjectTransition =
  | { readonly from: "DRAFT"; readonly to: "READY_FOR_REVIEW" }
  | { readonly from: "READY_FOR_REVIEW"; readonly to: "IN_REVIEW" }
  | { readonly from: "IN_REVIEW"; readonly to: "CHANGES_REQUESTED" }
  | { readonly from: "CHANGES_REQUESTED"; readonly to: "READY_FOR_REVIEW" }
  | { readonly from: "IN_REVIEW"; readonly to: "APPROVED_FOR_EXECUTION" }
  | { readonly from: "IN_REVIEW"; readonly to: "REJECTED" };

export type ApprovalRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "CANCELLED";

export type ApprovalDecision = "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
export type ApprovalResourceType = "PROJECT";
export type ApprovalWorkflow = "PROJECT";
export type ApprovalStage = "INITIAL_REVIEW";
export type ProjectCommentKind = "GLOBAL" | "FIELD";

export const slice4ProjectTransitions = [
  { from: "DRAFT", to: "READY_FOR_REVIEW" },
  { from: "READY_FOR_REVIEW", to: "IN_REVIEW" },
  { from: "IN_REVIEW", to: "CHANGES_REQUESTED" },
  { from: "CHANGES_REQUESTED", to: "READY_FOR_REVIEW" },
  { from: "IN_REVIEW", to: "APPROVED_FOR_EXECUTION" },
  { from: "IN_REVIEW", to: "REJECTED" }
] as const satisfies readonly Slice4ProjectTransition[];

export const slice4EditableProjectStatuses = ["DRAFT", "CHANGES_REQUESTED"] as const;

export const projectCommentFieldKeys = [
  "title",
  "summary",
  "problemStatement",
  "diagnostic",
  "projectMode",
  "visibility",
  "locationLabel",
  "plannedStartAt",
  "plannedEndAt",
  "actualStartAt",
  "actualEndAt"
] as const;

export type ProjectCommentFieldKey = typeof projectCommentFieldKeys[number];

export function assertSlice4Transition(from: ProjectStatus, to: ProjectStatus): void {
  if (!slice4ProjectTransitions.some((transition) => transition.from === from && transition.to === to)) {
    throw new ProjectDomainError("Project workflow transition is not allowed.", "PROJECT_TRANSITION_INVALID");
  }
}

export function isProjectContentEditable(status: ProjectStatus): boolean {
  return status === "DRAFT" || status === "CHANGES_REQUESTED";
}

export function normalizeReviewText(input: string, code: string): string {
  const normalized = input.trim();
  if (normalized.length === 0) {
    throw new ProjectDomainError("Review text is required.", code);
  }
  if (normalized.length > 4000) {
    throw new ProjectDomainError("Review text is too long.", `${code}_TOO_LONG`);
  }
  return normalized;
}

export function assertProjectCommentShape(input: {
  readonly kind: ProjectCommentKind;
  readonly fieldKey: string | null;
  readonly body: string;
}): { readonly fieldKey: ProjectCommentFieldKey | null; readonly body: string } {
  const body = normalizeReviewText(input.body, "PROJECT_COMMENT_BODY_REQUIRED");
  if (input.kind === "GLOBAL") {
    if (input.fieldKey !== null) {
      throw new ProjectDomainError("Global comments cannot target a field.", "PROJECT_COMMENT_FIELD_FORBIDDEN");
    }
    return { fieldKey: null, body };
  }
  if (input.fieldKey === null) {
    throw new ProjectDomainError("Field comments require a field key.", "PROJECT_COMMENT_FIELD_REQUIRED");
  }
  if (!projectCommentFieldKeys.includes(input.fieldKey as ProjectCommentFieldKey)) {
    throw new ProjectDomainError("Project comment field is not allowed.", "PROJECT_COMMENT_FIELD_INVALID");
  }
  return { fieldKey: input.fieldKey as ProjectCommentFieldKey, body };
}
