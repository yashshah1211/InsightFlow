# Official dataset proof and deployment

Original [competition CSV](https://drive.google.com/file/d/1P3YOc8nJxLAkBVf9jx9uYRerniTipPAQ/view) was downloaded via connected Drive with legitimate access, unchanged: 660,099 bytes.

SHA-256: 82b09450e0e5144c4a21cb33a9556dab6afd7618228496e7f4c321f687250c41.

Measured: 7,000 raw rows; 320 distinct normalized texts; 6,680 repeated rows; top 20 texts cover 5,025 rows; zero rejected rows. Category raw/unique counts: Product Feedback 1,738/183; Customer Service 1,707/66; Fraud and Scam 1,755/35; Operational Issues 1,800/36. No customer IDs or complaint dates are supplied.

npm run data:inspect validates those invariants. npm run data:prepare validates the original checksum and creates data/processed/official.json. The artifact retains original raw rows and stable IDs, normalized hashes, explicitly heuristic annotations, generatedAt and source URL/checksum. Source importedAt uses the documented file's modification timestamp, not an invented complaint date. Derived issue creation dates use artifact generation time. Heuristic-v2 preserves actual source mixed samples using separate positive/problem aspects; broad reported problems do not invent an actionable issue topic or severity. This is not human validation or Adaption output.

The server revalidates shape, source/checksum, raw text hashes, evidence and official counts when loading the artifact. INSIGHTFLOW_DATA_MODE=official selects it; fixture selects authored fixtures; absent mode selects official only if its artifact exists. Explicit official mode fails closed when the artifact is absent. database selects an authenticated private Supabase snapshot and needs configuration.

Frozen v1.0.0 mode has only fixture|database. Persisted official snapshots use meta.mode=database with provenance.source=official_csv and label explicitly identifying a generated read-only artifact, not Supabase. This preserves schema compatibility; Antigravity should use provenance.source to distinguish official from private data. An explicitly supplied UUID batchId selects authenticated private storage; official-* IDs never enable writes.

Raw CSV, processed artifact and pilot artifacts remain Git-ignored pending license/submission review. Do not force-add them. The artifact is approximately 5.7 MB and is generated locally from the actual source. It must be included in the deployment filesystem; committing the code alone cannot distribute the ignored data.

For a deployment built from an approved local checkout:

1. Place the unchanged CSV at data/raw/customer_feedback.csv.
2. Run npm ci, npm run data:inspect, npm run data:prepare.
3. Select INSIGHTFLOW_DATA_MODE=official and run npm run build.
4. Next outputFileTracingIncludes carries the artifact into server tracing, with output=standalone. Vercel CLI deployment can use .vercelignore, which excludes raw CSV/secrets/private pilot files while allowing the processed artifact. Run CLI deployment only with explicit user authorization.
5. For Git-based deployment, provide the source/artifact through a reviewed private build input or approve artifact redistribution after license review. Set official mode explicitly so missing data fails deployment/readback rather than silently showing fixtures. No database or Adaption key is required for this read-only full-data slice.

No live deployment was performed. A packaged build and local HTTP/browser checks are the evidence of readiness.

npm start launches the traced standalone server, copying only generated static assets and existing public assets into its package as required by [Next standalone documentation](https://nextjs.org/docs/app/api-reference/config/next-config-js/output). Optional --port/--hostname flags remain supported. The official JSON is verified in the standalone package, so serving it does not depend on the development checkout's raw CSV.
