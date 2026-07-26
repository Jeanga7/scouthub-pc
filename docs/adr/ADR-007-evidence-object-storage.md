# ADR-007: Evidence Object Storage

## Status

Accepted for Slice 5.

## Context

ScoutHub-PC needs private project Evidence files without proxying large uploads through Next.js route handlers. Evidence may contain P1/P2/P3 internal data, so signed URLs are treated as temporary bearer credentials.

## Decision

Evidence uses a provider-neutral `ObjectStorage` port in application code and an R2/S3-compatible adapter in infrastructure. Domain and application do not import Cloudflare, Wrangler, R2 bindings or S3 SDK types.

Uploads use two object keys:

```text
tmp/evidence/<tenant-id>/<asset-id>/<random>
evidence/<tenant-id>/<asset-id>/<random>
```

Only the temporary key is signed for browser `PUT`. After upload, the server verifies R2 metadata, checksum, size and magic bytes, then promotes the object with server-side CopyObject to the permanent key. The copy is conditional on the ETag observed during verification. Reuse of an old presigned PUT can only overwrite `tmp/*`; it can never alter accepted Evidence.

The R2 bucket is private. No public bucket, `r2.dev` public access, custom public domain or public Evidence route is introduced.

Allowed file policy is deliberately conservative:

- MIME: `image/jpeg`, `image/png`, `application/pdf`
- size: 12 MiB for JPEG/PNG, 20 MiB for PDF
- classification: P1/P2/P3 only, default P3
- visibility: PRIVATE/INTERNAL only
- scan status: `NOT_SCANNED`

No antivirus claim is made. No EXIF stripping or derivative generation occurs in Slice 5 because no media is public.

## Authorization

Evidence authorization extends `@scouthub/authz`. A single active RoleAssignment must provide tenant, permission and organization scope covering the Project owner path.

Permissions:

- `evidence.create`
- `evidence.read`
- `evidence.download`

`UNIT_LEADER` and `GROUP_ADMIN` can create/read/download in their scope. `REGIONAL_PROGRAMME_REVIEWER` can read/download in its region. `REGIONAL_ADMIN`, `REGIONAL_COMMS`, `DATA_OFFICER`, `NATIONAL_OBSERVER` and `PLATFORM_ADMIN` do not receive private file access by default.

## Consistency Boundaries

PostgreSQL and R2 are not atomic together. Confirmation verifies and promotes storage first, then locks the Project and MediaAsset in PostgreSQL before creating Evidence. If DB finalization fails after promotion, permanent-object cleanup is best-effort and the original DB error remains authoritative.

Project is locked before Evidence creation so submit/review freeze races serialize:

- Evidence wins first: Evidence is included before submit.
- Submit wins first: Project status becomes non-uploadable and Evidence confirmation is denied.

## Deferred

Slice 6 owns durable async cleanup, expired temporary upload cleanup, orphan cleanup, thumbnails, compression, EXIF removal, transactional outbox, Queue consumer and retries.

Evidence deletion, publication, consent, participants, SDGs/challenges, indicators, public media and final review are out of scope.
