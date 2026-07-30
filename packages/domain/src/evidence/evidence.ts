import type { ProjectStatus } from "../project/project-status";

export type EvidenceMime = "image/jpeg" | "image/png" | "application/pdf";
export type EvidenceClassification = "P1" | "P2" | "P3";
export type EvidenceUploadStatus = "PENDING_UPLOAD" | "VERIFYING" | "VERIFIED" | "REJECTED";
export type EvidenceScanStatus = "NOT_SCANNED";
export type EvidenceType =
  | "PHOTO"
  | "VIDEO_LINK"
  | "DOCUMENT"
  | "ATTESTATION"
  | "ATTENDANCE_LIST"
  | "MEASUREMENT"
  | "LOCATION"
  | "TESTIMONIAL"
  | "YOUTH_OUTPUT"
  | "RECEIPT"
  | "EXTERNAL_CAPTURE";
export type EvidenceVisibility = "PRIVATE" | "INTERNAL";
export type EvidenceValidationStatus = "UNREVIEWED" | "VALIDATED" | "REJECTED";
export type EvidenceRejectionCode =
  | "OBJECT_NOT_FOUND"
  | "SIZE_MISMATCH"
  | "CHECKSUM_MISMATCH"
  | "MAGIC_BYTES_MISMATCH"
  | "MIME_MISMATCH"
  | "UPLOAD_EXPIRED"
  | "SOURCE_CHANGED"
  | "PROMOTION_FAILED"
  | "UPLOAD_SIGNING_FAILED";

export class EvidenceDomainError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "EvidenceDomainError";
  }
}

export const evidenceUploadUrlTtlSeconds = 5 * 60;
export const evidenceDownloadUrlTtlSeconds = 2 * 60;
export const evidenceMaxImageBytes = 12 * 1024 * 1024;
export const evidenceMaxPdfBytes = 20 * 1024 * 1024;

const allowedExtensionsByMime: Record<EvidenceMime, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/pdf": [".pdf"]
};

const allowedMimes = new Set<EvidenceMime>([
  "image/jpeg",
  "image/png",
  "application/pdf"
]);

export function assertEvidenceMime(value: string): EvidenceMime {
  if (!allowedMimes.has(value as EvidenceMime)) {
    throw new EvidenceDomainError("Unsupported evidence MIME type.", "EVIDENCE_MIME_FORBIDDEN");
  }
  return value as EvidenceMime;
}

export function assertEvidenceExtension(filename: string, mime: EvidenceMime): void {
  const lower = filename.trim().toLowerCase();
  if (!allowedExtensionsByMime[mime].some((extension) => lower.endsWith(extension))) {
    throw new EvidenceDomainError("File extension does not match the allowed MIME type.", "EVIDENCE_EXTENSION_FORBIDDEN");
  }
}

export function assertEvidenceByteSize(byteSize: number, mime: EvidenceMime): void {
  const limit = mime === "application/pdf" ? evidenceMaxPdfBytes : evidenceMaxImageBytes;
  if (!Number.isInteger(byteSize) || byteSize <= 0 || byteSize > limit) {
    throw new EvidenceDomainError("Evidence file size is outside the allowed limit.", "EVIDENCE_SIZE_FORBIDDEN");
  }
}

export function assertEvidenceSha256Hex(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new EvidenceDomainError("Evidence checksum must be lowercase SHA-256 hex.", "EVIDENCE_SHA256_INVALID");
  }
  return value;
}

export function assertEvidenceClassification(value: string | undefined | null): EvidenceClassification {
  const classification = value ?? "P3";
  if (classification !== "P1" && classification !== "P2" && classification !== "P3") {
    throw new EvidenceDomainError("Evidence classification is not allowed in Slice 5.", "EVIDENCE_CLASSIFICATION_FORBIDDEN");
  }
  return classification;
}

export function assertEvidenceVisibility(value: string | undefined | null): EvidenceVisibility {
  const visibility = value ?? "PRIVATE";
  if (visibility !== "PRIVATE" && visibility !== "INTERNAL") {
    throw new EvidenceDomainError("Evidence visibility is not allowed in Slice 5.", "EVIDENCE_VISIBILITY_FORBIDDEN");
  }
  return visibility;
}

export function assertSlice5EvidenceType(value: EvidenceType): EvidenceType {
  if (!["PHOTO", "DOCUMENT", "ATTESTATION", "EXTERNAL_CAPTURE"].includes(value)) {
    throw new EvidenceDomainError("Evidence type is not file-backed in Slice 5.", "EVIDENCE_TYPE_FORBIDDEN");
  }
  return value;
}

export function assertEvidenceMimeMatchesType(type: EvidenceType, mime: EvidenceMime): void {
  if (type === "PHOTO" && mime !== "image/jpeg" && mime !== "image/png") {
    throw new EvidenceDomainError("Evidence type does not match uploaded MIME.", "EVIDENCE_TYPE_MIME_MISMATCH");
  }
  if (type === "DOCUMENT" && mime !== "application/pdf") {
    throw new EvidenceDomainError("Evidence type does not match uploaded MIME.", "EVIDENCE_TYPE_MIME_MISMATCH");
  }
}

export function assertUploadableProjectStatus(status: ProjectStatus): void {
  if (status !== "DRAFT" && status !== "CHANGES_REQUESTED" && status !== "APPROVED_FOR_EXECUTION") {
    throw new EvidenceDomainError("Project does not accept evidence in the current status.", "EVIDENCE_PROJECT_STATUS_FORBIDDEN");
  }
}

export function normalizeEvidenceTitle(value: string): string {
  const title = value.trim();
  if (title.length === 0) {
    throw new EvidenceDomainError("Evidence title is required.", "EVIDENCE_TITLE_REQUIRED");
  }
  if (title.length > 160) {
    throw new EvidenceDomainError("Evidence title is too long.", "EVIDENCE_TITLE_TOO_LONG");
  }
  return title;
}

export function normalizeEvidenceDescription(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > 2000) {
    throw new EvidenceDomainError("Evidence description is too long.", "EVIDENCE_DESCRIPTION_TOO_LONG");
  }
  return normalized;
}

export function assertEvidenceMagicBytes(mime: EvidenceMime, bytes: Uint8Array): void {
  const valid =
    (mime === "image/jpeg" && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (mime === "image/png" &&
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a) ||
    (mime === "application/pdf" &&
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d);
  if (!valid) {
    throw new EvidenceDomainError("Evidence object magic bytes do not match MIME.", "MAGIC_BYTES_MISMATCH");
  }
}
