"""Separately authorized provider operations. Importing this module performs no network IO."""
from __future__ import annotations
import csv
import hashlib
import json
import math
import os
import re
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

def make_client():
    from importlib.metadata import version
    if version("adaption") != SDK_VERSION:
        raise ValueError("Install the inspected pinned SDK version")
    if not os.environ.get("ADAPTION_API_KEY"):
        raise ValueError("ADAPTION_API_KEY must be set privately")
    from adaption import Adaption
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

def upload(folder, allow_network=False, approve_transfer=None):
    if not allow_network:
        gate(False, None, "")
    manifest, _ = load_pilot(folder)
    gate(allow_network, approve_transfer, manifest["pilotSha256"])
    if manifest.get("profile") == "phase6b-v1":
        from review import transfer_gate
        transfer_gate(folder)
    not_attempted(folder, "upload")
    client = make_client()
    def submit():
        # Official SDK upload helper: preprocessing only; explicit adapt is separate.
        response = client.datasets.upload_file(folder / "pilot.csv", name="InsightFlow " + manifest.get("sourceKind", "official_csv") + " reviewed 25-pattern pilot", processing_mode="adapt")
        return {"datasetId": identifier(response.dataset_id), "status": response.status, "pilotSha256": manifest["pilotSha256"],
            "configSha256": manifest["configSha256"], "sourceSha256": manifest["sourceSha256"], "sourceKind": manifest.get("sourceKind", "official_csv"), "uploadedAt": now(), "runId": None, "actualCredits": None}
    return invoke(folder, "upload", manifest["pilotSha256"], submit)

def uploaded(folder, dataset_id, manifest):
    record = read(folder / "upload.json")
    if identifier(dataset_id) != record["datasetId"] or record["pilotSha256"] != manifest["pilotSha256"] or record["configSha256"] != manifest["configSha256"]:
        raise ValueError("Dataset ID is not bound to this reviewed upload")

def ready(client, dataset_id, rows):
    status = client.datasets.get_status(dataset_id)
    if status.dataset_id != dataset_id or status.status != "awaiting_input" or status.row_count != rows:
        raise ValueError("Require awaiting_input with exactly the reviewed pilot row count; no adaptation may already be active")

def estimate(folder, dataset_id, allow_network=False, approve_estimate=None):
    if not allow_network:
        gate(False, None, "")
    manifest, config = load_pilot(folder)
    gate(allow_network, approve_estimate, manifest["configSha256"])
    uploaded(folder, dataset_id, manifest)
    not_attempted(folder, "estimate")
    if (folder / "execute.attempt.json").exists():
        raise ValueError("Execution already attempted; a new quote must not overwrite its provenance")
    client = make_client()
    ready(client, dataset_id, manifest["pilotRows"])
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
    return invoke(folder, "estimate", manifest["configSha256"], submit)

def execute(folder, allow_network=False, approve_spend=None, max_credits=None):
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
    dataset_id = identifier(quote["datasetId"])
    uploaded(folder, dataset_id, manifest)
    not_attempted(folder, "execute")
    client = make_client()
    ready(client, dataset_id, manifest["pilotRows"])
    def submit():
        result = client.datasets.adapt(dataset_id, estimate=False, **config)
        if result.estimate is not False:
            raise RuntimeError("Provider response did not represent execution")
        return {"datasetId": dataset_id, "runId": identifier(result.run_id), "status": "submitted", "submittedAt": now(),
            "configSha256": manifest["configSha256"], "pilotSha256": manifest["pilotSha256"], "sourceSha256": manifest["sourceSha256"], "sourceKind": manifest.get("sourceKind", "official_csv"),
            "quoteSha256": approve_spend, "estimatedCredits": credits, "approvedCredits": max_credits, "actualCredits": None,
            "usageReason": "Inspected adapt/status schemas do not report actual billed usage; quote is not actual cost"}
    return invoke(folder, "execute", approve_spend, submit)

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
