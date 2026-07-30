# R2 Evidence Setup

ScoutHub-PC Evidence files are private. Do not enable public bucket access, `r2.dev` public access or a public custom domain.

## Manual Setup

1. Create one private Cloudflare R2 bucket for the target environment, for example `scouthub-pc-evidence`.
2. Create S3-compatible credentials scoped to this bucket with the minimum operations needed for signed `PUT`, signed `GET`, `HEAD`, `DELETE` and server-side CopyObject.
3. Configure runtime variables:

```text
R2_ACCOUNT_ID=<account id>
R2_BUCKET_NAME=<bucket name>
```

4. Configure runtime secrets:

```text
R2_ACCESS_KEY_ID=<bucket-scoped access key>
R2_SECRET_ACCESS_KEY=<bucket-scoped secret key>
```

5. Do not place `R2_SECRET_ACCESS_KEY` in frontend build variables or logs.

## CORS

Configure CORS with explicit origins only. Use `APP_ORIGIN` and explicitly approved preview origins. Never use `*`.

Minimum policy:

```json
[
  {
    "AllowedOrigins": ["https://example.scouthub-pc.org"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

## Verification

1. Confirm public access is disabled.
2. Initiate an upload from an authorized ScoutHub-PC account.
3. Verify the browser uploads directly to R2 using the signed `PUT`.
4. Confirm upload and check that the accepted object key starts with `evidence/`, not `tmp/`.
5. Verify the browser computes SHA-256 locally and the server recomputes the actual SHA-256 from the temporary object before promotion.
6. Request a download URL and verify it expires quickly.
7. Check audit entries for URL issuance and confirm no signed URL or secret appears in metadata.

## Rotation and Compromise

To rotate credentials, create a new bucket-scoped key, deploy updated secrets, verify upload/download, then revoke the old key.

If a key is suspected compromised:

1. Revoke it immediately.
2. Deploy replacement secrets.
3. Inspect audit logs for unexpected `evidence.download_url_issued` or upload initiation spikes.
4. Review R2 object activity for unusual writes to `tmp/`.

## Cost and Quota

Monitor R2 storage and Class A/B operations. Slice 5 limits files to JPEG/PNG 12 MiB and PDF 20 MiB and adds a DB guard for pending and verifying upload intents, but this is not a complete abuse-prevention system.

## Rollback

If Evidence upload must be disabled, remove Evidence UI links and block the Evidence route handlers at deployment configuration while keeping the private bucket intact. Do not delete accepted objects as part of rollback.

## Deferred to Slice 6

Expired temporary upload cleanup, orphan permanent cleanup, thumbnails, compression, EXIF cleanup, transactional outbox, Queue processing and retries are deliberately deferred.
