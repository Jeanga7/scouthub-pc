import { describe, expect, it } from "vitest";
import {
  assertEvidenceByteSize,
  assertEvidenceClassification,
  assertEvidenceExtension,
  assertEvidenceMagicBytes,
  assertEvidenceMime,
  assertEvidenceMimeMatchesType,
  assertEvidenceSha256Hex,
  assertEvidenceVisibility,
  assertSlice5EvidenceType,
  assertUploadableProjectStatus,
  evidenceDownloadUrlTtlSeconds,
  evidenceMaxImageBytes,
  evidenceMaxPdfBytes,
  evidenceUploadUrlTtlSeconds
} from "../index";

describe("evidence domain invariants", () => {
  it("keeps signed URL lifetimes short and never permanent", () => {
    // Guards against a future edit quietly turning a private Evidence link into
    // a durable one. Both stay positive and capped at fifteen minutes.
    expect(evidenceDownloadUrlTtlSeconds).toBeGreaterThan(0);
    expect(evidenceDownloadUrlTtlSeconds).toBeLessThanOrEqual(15 * 60);
    expect(evidenceUploadUrlTtlSeconds).toBeGreaterThan(0);
    expect(evidenceUploadUrlTtlSeconds).toBeLessThanOrEqual(15 * 60);
    // A download link must not outlive the upload window it was derived from.
    expect(evidenceDownloadUrlTtlSeconds).toBeLessThanOrEqual(evidenceUploadUrlTtlSeconds);
  });


  it("allows only conservative Slice 5 MIME and extensions", () => {
    expect(assertEvidenceMime("image/jpeg")).toBe("image/jpeg");
    expect(assertEvidenceMime("image/png")).toBe("image/png");
    expect(assertEvidenceMime("application/pdf")).toBe("application/pdf");
    expect(() => assertEvidenceMime("image/svg+xml")).toThrow("Unsupported");
    expect(() => assertEvidenceExtension("preuve.jpg", "image/jpeg")).not.toThrow();
    expect(() => assertEvidenceExtension("preuve.html", "image/jpeg")).toThrow("extension");
  });

  it("checks declared sizes by MIME", () => {
    expect(() => assertEvidenceByteSize(evidenceMaxImageBytes, "image/png")).not.toThrow();
    expect(() => assertEvidenceByteSize(evidenceMaxImageBytes + 1, "image/png")).toThrow("size");
    expect(() => assertEvidenceByteSize(evidenceMaxPdfBytes, "application/pdf")).not.toThrow();
    expect(() => assertEvidenceByteSize(evidenceMaxPdfBytes + 1, "application/pdf")).toThrow("size");
  });

  it("validates checksum format and allowed classifications", () => {
    expect(assertEvidenceSha256Hex("a".repeat(64))).toBe("a".repeat(64));
    expect(() => assertEvidenceSha256Hex("A".repeat(64))).toThrow("checksum");
    expect(assertEvidenceClassification(undefined)).toBe("P3");
    expect(() => assertEvidenceClassification("P4")).toThrow("classification");
  });

  it("allows only private/internal visibility and file-backed types", () => {
    expect(assertEvidenceVisibility(undefined)).toBe("PRIVATE");
    expect(assertSlice5EvidenceType("PHOTO")).toBe("PHOTO");
    expect(assertSlice5EvidenceType("DOCUMENT")).toBe("DOCUMENT");
    expect(() => assertSlice5EvidenceType("VIDEO_LINK")).toThrow("file-backed");
    expect(() => assertEvidenceVisibility("PUBLIC")).toThrow("visibility");
  });

  it("validates MIME against type", () => {
    expect(() => assertEvidenceMimeMatchesType("PHOTO", "image/jpeg")).not.toThrow();
    expect(() => assertEvidenceMimeMatchesType("DOCUMENT", "application/pdf")).not.toThrow();
    expect(() => assertEvidenceMimeMatchesType("PHOTO", "application/pdf")).toThrow("MIME");
  });

  it("checks magic bytes instead of trusting extension or content type", () => {
    expect(() => assertEvidenceMagicBytes("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff]))).not.toThrow();
    expect(() => assertEvidenceMagicBytes("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).not.toThrow();
    expect(() => assertEvidenceMagicBytes("application/pdf", new TextEncoder().encode("%PDF-1.7"))).not.toThrow();
    expect(() => assertEvidenceMagicBytes("image/jpeg", new TextEncoder().encode("<html>"))).toThrow("magic");
  });

  it("allows evidence creation only in uploadable project statuses", () => {
    expect(() => assertUploadableProjectStatus("DRAFT")).not.toThrow();
    expect(() => assertUploadableProjectStatus("CHANGES_REQUESTED")).not.toThrow();
    expect(() => assertUploadableProjectStatus("APPROVED_FOR_EXECUTION")).not.toThrow();
    expect(() => assertUploadableProjectStatus("READY_FOR_REVIEW")).toThrow("current status");
    expect(() => assertUploadableProjectStatus("IN_REVIEW")).toThrow("current status");
    expect(() => assertUploadableProjectStatus("REJECTED")).toThrow("current status");
  });
});
