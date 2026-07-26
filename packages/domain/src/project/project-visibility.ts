export type ProjectVisibility =
  | "PRIVATE"
  | "INTERNAL"
  | "REVIEW_PUBLIC"
  | "PUBLIC"
  | "UNPUBLISHED"
  | "ARCHIVED";

export const projectVisibilities = [
  "PRIVATE",
  "INTERNAL",
  "REVIEW_PUBLIC",
  "PUBLIC",
  "UNPUBLISHED",
  "ARCHIVED"
] as const;

export function isSlice3MutableProjectVisibility(
  visibility: ProjectVisibility
): boolean {
  return visibility === "PRIVATE" || visibility === "INTERNAL";
}

