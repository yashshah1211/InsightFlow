"""Separately authorized provider operations. Importing this module performs no network IO."""
from __future__ import annotations
import csv
import hashlib
import json
import math
import os
import re
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

SDK_VERSION = "0.14.0"
SOURCE_SHA256 = "82b09450e0e5144c4a21cb33a9556dab6afd7618228496e7f4c321f687250c41"

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def sha(data):
    return hashlib.sha256(data).hexdigest()

def now():
    return datetime.now(timezone.utc).isoformat()

def read(path):
    return json.loads(path.read_text(encoding="utf-8"))

def write(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(canonical(value) + "\n", encoding="utf-8")
    temporary.replace(path)

def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,200}", value):
        raise ValueError("Invalid provider identifier")
    return value

def gate(allow_network, approval, expected):
    if not allow_network:
        raise ValueError("Provider operation disabled without explicit --allow-network authorization")
    if not approval or approval != expected:
        raise ValueError("Explicit approval must match the reviewed artifact/config/quote SHA-256")

def load_pilot(folder):
    manifest, config = read(folder / "manifest.json"), read(folder / "config.json")
    if manifest.get("profile") == "phase6b-v1":
        from review import validate_bundle
        validate_bundle(folder)
        return manifest, config
    if manifest.get("profile") is not None:
        raise ValueError("Unknown pilot profile")
    if manifest["sourceSha256"] != SOURCE_SHA256 or manifest["sdkVersion"] != SDK_VERSION:
        raise ValueError("Unexpected source or SDK version")
    if sha((folder / "pilot.csv").read_bytes()) != manifest["pilotSha256"] or sha(canonical(config).encode()) != manifest["configSha256"]:
        raise ValueError("Pilot/config changed; prepare and review again")
    with (folder / "pilot.csv").open(encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    hashes = manifest["pilotHashes"]
    source = {p["normalized_hash"]: p for p in manifest["patterns"]}
    if not 20 <= len(rows) <= 30 or len(rows) != manifest["pilotRows"] or len(set(hashes)) != len(rows):
        raise ValueError("Invalid bounded pilot size or duplicate IDs")
    if [r["normalized_hash"] for r in rows] != hashes:
        raise ValueError("Pilot correspondence differs")
    for row in rows:
        original = source.get(row["normalized_hash"])
        if not original or row["review"] != original["review"] or sha(" ".join(row["review"].split()).casefold().encode()) != row["normalized_hash"]:
            raise ValueError("Pilot lost verbatim source provenance")
    expected_mapping = {"prompt": "prompt", "context": ["review", "original_category", "normalized_hash", "occurrence_count"]}
    if config["column_mapping"] != expected_mapping or config["job_specification"] != {"max_rows": len(rows)} or config["language_expansion"] is not None:
        raise ValueError("Unexpected mapping, row limit or expansion")
    if config["recipe_specification"] != {"recipes": {"deduplication": False, "prompt_rephrase": False, "reasoning_traces": False}} or config["training_type"] != "instruction_dataset":
        raise ValueError("Unreviewed recipe or training task")
    return manifest, config

def make_client(dataset_id=None, approved_body=None):
    from importlib.metadata import version
    if version("adaption") != SDK_VERSION:
        raise ValueError("Install the inspected pinned SDK version")
    if not os.environ.get("ADAPTION_API_KEY"):
        raise ValueError("ADAPTION_API_KEY must be set privately")
    for name in ("adaption", "httpx", "httpcore"):
        logging.getLogger(name).disabled = True
    from adaption import Adaption
    if approved_body is not None:
        import httpx
        dataset_id = identifier(dataset_id)
        expected = json.loads(canonical(approved_body))
        class OneRequest(httpx.HTTPTransport):
            submitted = False
            def handle_request(self, request):
                prefix = "/api/v1/datasets/" + dataset_id
                if request.url.scheme != "https" or request.url.host != "api.prod.adaptionlabs.ai":
                    raise ValueError("Unexpected provider destination")
                if request.method == "GET" and request.url.path in (prefix, prefix + "/status"):
                    return super().handle_request(request)
                if (request.method != "POST" or request.url.path != prefix + "/adapt" or
                        self.submitted or json.loads(request.content) != expected):
                    raise ValueError("Provider request differs from the one approved operation")
                self.submitted = True
                return super().handle_request(request)
        http = httpx.Client(transport=OneRequest(retries=0), timeout=60, follow_redirects=False)
        return Adaption(max_retries=0, timeout=60, http_client=http)
    return Adaption(max_retries=0, timeout=60)

def reserve(folder, operation, binding):
    path = folder / (operation + ".attempt.json")
    try:
        with path.open("x", encoding="utf-8") as handle:
            handle.write(canonical({"operation": operation, "status": "submission_reserved", "binding": binding, "reservedAt": now()}) + "\n")
    except FileExistsError:
        raise ValueError("Operation already attempted; reconcile provider state manually before any repeat") from None
    return path

def not_attempted(folder, operation):
    if (folder / (operation + ".attempt.json")).exists():
        raise ValueError("Operation already attempted; reconcile provider state manually before any repeat")

def invoke(folder, operation, binding, function):
    path = reserve(folder, operation, binding)
    try:
        result = function()
        write(folder / (operation + ".json"), result)
        write(path, {"operation": operation, "status": "recorded", "binding": binding, "recordedAt": now()})
        return result
    except Exception:
        # Timeout does not prove the provider rejected the request. Do not retry automatically.
        write(path, {"operation": operation, "status": "unknown_requires_reconciliation", "binding": binding, "observedAt": now()})
        raise RuntimeError("Provider operation incomplete; inspect account state and reconcile the attempt. No automatic retry; provider details suppressed") from None

def put_source(url, data):
    # The signed storage URL is a credential: retain it only in memory, send no
    # provider Authorization header, follow no redirects and never log errors.
    from urllib.parse import urlsplit
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.username or parsed.password or
            parsed.port not in (None, 443) or not parsed.hostname or
            not parsed.hostname.endswith(".amazonaws.com")):
        raise ValueError("Unexpected provider storage destination; do not upload")
    import httpx
    with httpx.Client(timeout=60, follow_redirects=False, transport=httpx.HTTPTransport(retries=0)) as transport:
        response = transport.put(url, content=data)
        response.raise_for_status()
        if response.status_code not in (200, 201, 204):
            raise ValueError("Unexpected storage upload status")
        return {"httpStatus": response.status_code, "bytes": len(data), "pilotSha256": sha(data), "observedAt": now()}

def deferred_upload(folder, client, manifest):
    if manifest.get("profile") != "phase6b-v1" or manifest.get("sourceKind") != "synthetic_original":
        raise ValueError("Deferred workflow is restricted to the reviewed original synthetic pilot")
    payload = (folder / "pilot.csv").read_bytes()
    if sha(payload) != manifest["pilotSha256"]:
        raise ValueError("Upload payload changed")
    creation = None
    binding = {"pilotSha256": manifest["pilotSha256"], "manifestSha256": sha((folder / "manifest.json").read_bytes()),
               "configSha256": manifest["configSha256"], "deferAdaption": True}
    def create():
        nonlocal creation
        creation = client.datasets.create(source={"file_format": "csv", "name": "InsightFlow synthetic_original reviewed 25-pattern pilot",
                                                  "processing_mode": "adapt"}, defer_adaption=True)
        result = {"datasetId": identifier(creation.dataset_id), "status": creation.status, "observedAt": now(), **binding}
        return result  # Never serialize upload_instructions or its signed URL.
    created = invoke(folder, "upload-create", binding, create)
    dataset_id = created["datasetId"]
    if creation.upload_instructions is None or creation.upload_instructions.method != "PUT":
        raise ValueError("Expected provider PUT instructions; created ID is preserved for reconciliation")
    uploaded_bytes = invoke(folder, "upload-bytes", {**binding, "datasetId": dataset_id},
                            lambda: put_source(creation.upload_instructions.url, payload))
    def complete():
        response = client.datasets.upload.complete_by_id(dataset_id, file_size_bytes=len(payload), sha256=manifest["pilotSha256"])
        if response.dataset_id != dataset_id:
            raise ValueError("Provider completion ID changed")
        return {"datasetId": dataset_id, "status": response.status, "observedAt": now(),
                "submittedBytes": len(payload), "submittedSha256": manifest["pilotSha256"]}
    completed = invoke(folder, "upload-complete", {**binding, "datasetId": dataset_id}, complete)
    return {"datasetId": dataset_id, "status": completed["status"], "pilotSha256": manifest["pilotSha256"],
            "configSha256": manifest["configSha256"], "sourceSha256": manifest["sourceSha256"], "sourceKind": manifest["sourceKind"],
            "uploadedAt": completed["observedAt"], "createdObservedAt": created["observedAt"], "deferAdaption": True,
            "uploadedRows": manifest["pilotRows"], "payloadFields": ["review", "normalized_hash"],
            "storageHttpStatus": uploaded_bytes["httpStatus"], "uploadBytes": len(payload), "runId": None,
            "actualCredits": None, "preprocessingStatus": "Requires provider status verification; no Forge or start-adaption requested"}

def upload(folder, allow_network=False, approve_transfer=None, defer_adaption=False):
    if not allow_network:
        gate(False, None, "")
    manifest, _ = load_pilot(folder)
    gate(allow_network, approve_transfer, manifest["pilotSha256"])
    if manifest.get("profile") == "phase6b-v1":
        from review import transfer_gate
        transfer_gate(folder)
        if manifest.get("sourceKind") == "synthetic_original" and not defer_adaption:
            raise ValueError("Reviewed synthetic upload requires explicit --defer-adaption; never silently drop it")
    not_attempted(folder, "upload")
    if defer_adaption:
        if manifest.get("profile") != "phase6b-v1" or manifest.get("sourceKind") != "synthetic_original":
            raise ValueError("Deferred workflow requires reviewed original synthetic pilot")
        for operation in ("upload-create", "upload-bytes", "upload-complete"):
            not_attempted(folder, operation)
    client = make_client()
    def submit():
        if defer_adaption:
            return deferred_upload(folder, client, manifest)
        # Official SDK upload helper: preprocessing only; explicit adapt is separate.
        response = client.datasets.upload_file(folder / "pilot.csv", name="InsightFlow " + manifest.get("sourceKind", "official_csv") + " reviewed 25-pattern pilot", processing_mode="adapt")
        return {"datasetId": identifier(response.dataset_id), "status": response.status, "pilotSha256": manifest["pilotSha256"],
            "configSha256": manifest["configSha256"], "sourceSha256": manifest["sourceSha256"], "sourceKind": manifest.get("sourceKind", "official_csv"), "uploadedAt": now(), "runId": None, "actualCredits": None}
    return invoke(folder, "upload", manifest["pilotSha256"], submit)

def uploaded(folder, dataset_id, manifest):
    record = read(folder / "upload.json")
    if identifier(dataset_id) != record["datasetId"] or record["pilotSha256"] != manifest["pilotSha256"] or record["configSha256"] != manifest["configSha256"]:
        raise ValueError("Dataset ID is not bound to this reviewed upload")

def ready(client, dataset_id, rows, verify_metadata=False):
    status = client.datasets.get_status(dataset_id)
    if status.dataset_id != dataset_id or status.status != "awaiting_input" or status.row_count != rows:
        raise ValueError("Require awaiting_input with exactly the reviewed pilot row count; no adaptation may already be active")
    if verify_metadata:
        dataset = client.datasets.get(dataset_id)
        if (dataset.dataset_id != dataset_id or dataset.run_id is not None or
                dataset.status != "awaiting_input" or dataset.row_count != rows):
            raise ValueError("Dataset metadata must confirm exact identity/count and no active or completed run")

def estimate(folder, dataset_id, allow_network=False, approve_estimate=None, refresh_from=None, max_credits=None):
    if not allow_network:
        gate(False, None, "")
    manifest, config = load_pilot(folder)
    gate(allow_network, approve_estimate, manifest["configSha256"])
    uploaded(folder, dataset_id, manifest)
    not_attempted(folder, "estimate")
    operation = "estimate"
    if refresh_from is None:
        not_attempted(folder, "estimate-readiness")
    else:
        previous_path = folder / "estimate-readiness.json"
        gate(allow_network, refresh_from, sha(previous_path.read_bytes()))
        previous = read(previous_path)
        if (previous["datasetId"] != dataset_id or previous["runId"] is not None or previous["estimate"] is not True or
                previous["configuration"] != config or previous["configSha256"] != manifest["configSha256"] or
                previous["pilotSha256"] != manifest["pilotSha256"]):
            raise ValueError("Confirmed quote must reconcile the exact previous estimate-only probe")
        if (folder / "estimate.json").exists():
            raise ValueError("Do not overwrite an existing executable quote")
        if not isinstance(max_credits, (int, float)) or not math.isfinite(max_credits) or max_credits < 0:
            raise ValueError("Confirmed quote requires a finite authorized credit ceiling")
        operation = "estimate-confirmed"
        not_attempted(folder, operation)
    if (folder / "execute.attempt.json").exists():
        raise ValueError("Execution already attempted; a new quote must not overwrite its provenance")
    client = make_client(dataset_id, {"estimate": True, **config}) if refresh_from else make_client()
    ready(client, dataset_id, manifest["pilotRows"], verify_metadata=bool(refresh_from))
    def submit():
        quote = client.datasets.adapt(dataset_id, estimate=True, **config)
        credits = quote.estimated_credits_consumed
        if quote.run_id is not None or quote.estimate is not True or not isinstance(credits, (int, float)) or not math.isfinite(credits) or credits < 0:
            raise RuntimeError("Provider did not return a valid estimate-only state")
        return {"datasetId": dataset_id, "runId": None, "estimatedCredits": credits, "configSha256": manifest["configSha256"],
            "pilotSha256": manifest["pilotSha256"], "quotedAt": now(), "status": "estimate_only",
            "estimatedMinutes": getattr(quote, "estimated_minutes", None), "creditMultiplier": getattr(quote, "credit_multiplier", None),
            "multimodalPricingApplied": getattr(quote, "multimodal_pricing_applied", None), "availableCredits": None,
            "balanceReason": "Inspected SDK adapt response has no account balance field", "configuration": config}
    result = invoke(folder, operation, {"configSha256": manifest["configSha256"], "previousQuoteSha256": refresh_from}, submit)
    if refresh_from:
        if result["estimatedCredits"] > max_credits:
            raise ValueError("Actual refreshed quote exceeds authorization; recorded, no execution permitted")
        result["confirmedFromQuoteSha256"] = refresh_from
        result["authorizedCreditCeiling"] = max_credits
        write(folder / "estimate.json", result)
    return result

def execute(folder, allow_network=False, approve_spend=None, max_credits=None, idempotency_key=None):
    if not allow_network:
        raise ValueError("Paid execution disabled without explicit --allow-network and quote approval")
    manifest, config = load_pilot(folder)
    quote_path = folder / "estimate.json"
    gate(allow_network, approve_spend, sha(quote_path.read_bytes()))
    quote = read(quote_path)
    credits = quote["estimatedCredits"]
    if not isinstance(max_credits, (int, float)) or not math.isfinite(max_credits) or max_credits < 0 or not isinstance(credits, (int, float)) or not math.isfinite(credits) or credits < 0 or credits > max_credits:
        raise ValueError("A finite --max-credits must cover the reviewed quote")
    quoted = datetime.fromisoformat(quote["quotedAt"])
    age = datetime.now(timezone.utc) - quoted
    if age < timedelta(0) or age > timedelta(hours=24):
        raise ValueError("Quote is stale; obtain a separately authorized fresh quote")
    if quote["status"] != "estimate_only" or quote["runId"] is not None or quote["configSha256"] != manifest["configSha256"] or quote["pilotSha256"] != manifest["pilotSha256"]:
        raise ValueError("Quote/config/pilot mismatch")
    if quote.get("configuration") != config:
        raise ValueError("Quote configuration differs from the immutable reviewed configuration")
    dataset_id = identifier(quote["datasetId"])
    uploaded(folder, dataset_id, manifest)
    not_attempted(folder, "execute")
    request_config = json.loads(canonical(config))
    if idempotency_key is not None:
        request_config["job_specification"]["idempotency_key"] = identifier(idempotency_key)
    elif manifest.get("profile") == "phase6b-v1" and manifest.get("sourceKind") == "synthetic_original":
        raise ValueError("Reviewed synthetic execution requires an explicit stable idempotency key")
    client = make_client(dataset_id, {"estimate": False, **request_config}) if idempotency_key else make_client()
    ready(client, dataset_id, manifest["pilotRows"], verify_metadata=bool(idempotency_key))
    def submit():
        result = client.datasets.adapt(dataset_id, estimate=False, **request_config)
        if result.estimate is not False:
            raise RuntimeError("Provider response did not represent execution")
        return {"datasetId": dataset_id, "runId": identifier(result.run_id), "status": "submitted", "submittedAt": now(),
            "configSha256": manifest["configSha256"], "pilotSha256": manifest["pilotSha256"], "sourceSha256": manifest["sourceSha256"], "sourceKind": manifest.get("sourceKind", "official_csv"),
            "quoteSha256": approve_spend, "estimatedCredits": credits, "approvedCredits": max_credits, "actualCredits": None,
            "idempotencyKey": idempotency_key, "requestConfigSha256": sha(canonical(request_config).encode()),
            "manifestSha256": sha((folder / "manifest.json").read_bytes()),
            "providerReturnedEstimatedCredits": getattr(result, "estimated_credits_consumed", None),
            "usageReason": "Inspected adapt/status schemas do not report actual billed usage; quote is not actual cost"}
    return invoke(folder, "execute", {"quoteSha256": approve_spend, "datasetId": dataset_id,
        "idempotencyKey": idempotency_key, "manifestSha256": sha((folder / "manifest.json").read_bytes())}, submit)

def download(folder, allow_network=False, approve_run=None):
    if not allow_network:
        gate(False, None, "")
    manifest, _ = load_pilot(folder)
    run = read(folder / "execute.json")
    if approve_run != identifier(run["runId"]):
        raise ValueError("Download requires explicit --approve-run matching the recorded run ID")
    not_attempted(folder, "download")
    uploaded(folder, run["datasetId"], manifest)
    if run["configSha256"] != manifest["configSha256"] or run["pilotSha256"] != manifest["pilotSha256"]:
        raise ValueError("Run input provenance changed")
    client = make_client()
    status = client.datasets.get_status(run["datasetId"])
    dataset = client.datasets.get(run["datasetId"])
    snapshot = {"datasetId": run["datasetId"], "runId": run["runId"], "status": status.status, "rowCount": status.row_count, "observedAt": now(), "actualCredits": None}
    write(folder / "status.json", snapshot)
    if status.dataset_id != run["datasetId"] or status.status != "succeeded" or dataset.run_id != run["runId"] or dataset.dataset_id != run["datasetId"]:
        raise ValueError("Require successful output and provider-confirmed run correspondence; partial/changed runs need manual review")
    def submit():
        data = client.datasets.download(run["datasetId"], file_format="jsonl").read()
        if not isinstance(data, bytes) or not 0 < len(data) <= 10 * 1024 * 1024:
            raise ValueError("Unexpected or oversized provider export")
        # Do not guess completion/hash columns. Mapping is an offline, explicit next step.
        with (folder / "provider-output.jsonl").open("xb") as handle:
            handle.write(data)
        return {**snapshot, "artifactSha256": sha(data), "bytes": len(data), "format": "jsonl", "mappingStatus": "inspection_required"}
    return invoke(folder, "download", run["runId"], submit)
