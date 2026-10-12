# Private batch discovery — batches-1.0.0

Additive schemas: `src/lib/contracts/batches.ts`. Frozen domain `src/lib/contracts/index.ts`, API_CONTRACT.md and api-examples.json remain v1.0.0, unchanged.

`GET /api/batches?page=1&pageSize=25&batchId=UUID` uses a verified cookie user (`getUser`), the publishable/legacy anon client with that user's session, existing SELECT grants and workspace RLS. Explicit owner_id, ready status and upload/manual filters exclude demo, other owners and unfinished imports. No owner/workspace parameters, tokens, content hashes or record texts are returned. There is no service-role adapter or new migration. An optional batchId filters the same authorized collection and permits restoring an older selection beyond the first page. Foreign/deleted IDs produce an empty collection without confirming existence.

Strict queries reject unknown/duplicate parameters, invalid UUID, page outside 1–1,000,000 or pageSize outside 1–100. Defaults: page=1, pageSize=25. Ordering: created_at descending, id descending to break ties. Offset pagination can shift when new imports arrive; refresh page 1 after writes. Counts are exact within the selected authorized collection, including the optional ID filter. Out-of-range pages are empty with unchanged totals. Creation time is ingestion metadata, never a complaint date.

Example for a hypothetical authored private import (illustrates shape, not a claimed live import):

```json
{"data":{"items":[{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1","filename":"authored.csv","source":"upload","recordCount":3,"uniqueTextCount":2,"rejectedCount":0,"createdAt":"2026-10-11T00:00:00Z"}]},"meta":{"contractVersion":"batches-1.0.0","page":1,"pageSize":25,"total":1,"totalPages":1}}
```

Empty authorized collection: items=[], total=0, totalPages=0. Errors retain `{error:{code,message}}`: 401 UNAUTHENTICATED for unsigned/expired/unconfigured Auth; 400 INVALID_QUERY for invalid input; 503 NOT_CONFIGURED for unavailable SELECT/schema; unexpected transport/invalid result produces sanitized 500 INTERNAL_ERROR. All responses are private/no-store. Writes flag is irrelevant to this read-only endpoint. Metadata is current database state, not a client-generated timestamp or fabricated row count.

UI uses discovery and pagination as the primary selector; manual UUID entry was removed. New writes trigger discovery and an owner-filtered lookup before selection. Browser storage holds only userId and selected batchId, never tokens or review content; restoration reauthorizes through the collection lookup. Public selection/sign-out clears stored private selection and URL scope. All six screens, evidence links and CSV requests receive the selected batchId. A keyed scope boundary unmounts page/drawer/report/modal state; pending responses cannot refill the new view. Focus/pageshow/storage changes recheck session; pagehide clears private rendered state while retaining the opaque selection for reauthorization. Server authorization remains independent of this UI.
