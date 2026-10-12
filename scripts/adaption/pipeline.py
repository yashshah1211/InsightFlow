"""Offline pilot preparation and separately authorized, manifest-bound provider commands."""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
import operations
from local_secrets import load_key

SOURCE_SHA256 = "82b09450e0e5144c4a21cb33a9556dab6afd7618228496e7f4c321f687250c41"
CATEGORIES = ["Product Feedback", "Customer Service", "Fraud and Scam", "Operational Issues"]
ROOT = Path(__file__).resolve().parents[2]
PROMPT = (
    "Analyze only the supplied review. Return one JSON annotation matching the supplied schema. "
    "Do not infer dates, customer identities, frequency-based severity, or calibrated confidence. "
    "Preserve negation: 'not a victim of fraud' and 'no fraudulent activity detected' are denials, "
    "not affirmative accusations. Keep positive and negative aspects separate; mixed feedback "
    "must not become a simplistic single label. Use exact verbatim substrings as evidence quotes. "
    "Use unknown for unsupported conclusions; confidence must be null. "
    "Provider provenance will be set by the validated importer, not by invented run claims."
)

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

def digest(value):
    return hashlib.sha256(value).hexdigest()

def normalize(value):
    return " ".join(value.split()).casefold()

def prepare(source: Path, output: Path, size: int):
    if any(output.glob("*.attempt.json")):
        raise ValueError("Provider attempts exist; preserve this pilot and its audit trail")
    if (output / "human-review.csv").exists():
        with (output / "human-review.csv").open(encoding="utf-8", newline="") as handle:
            if any(r.get("review_status") != "unreviewed" or any(r.get(k) for k in ["gold_sentiment", "gold_issue_types", "gold_severity", "notes"]) for r in csv.DictReader(handle)):
                raise ValueError("Human review exists; preparation must not overwrite independent gold labels")
    if not 20 <= size <= 30:
        raise ValueError("Pilot size must be 20-30")
    raw = source.read_bytes()
    if len(raw) > 5 * 1024 * 1024 or digest(raw) != SOURCE_SHA256:
        raise ValueError("Expected original official CSV checksum and bounded size")
    rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
    groups = {}
    for number, row in enumerate(rows, 2):
        if set(row) != {"review", "category"} or row["category"] not in CATEGORIES or not row["review"].strip():
            raise ValueError("Invalid official CSV row")
        text = normalize(row["review"])
        key = digest(text.encode("utf-8"))
        group = groups.setdefault(key, {"normalized_hash": key, "normalized_text": text, "review": row["review"],
            "occurrence_count": 0, "category_counts": {c: 0 for c in CATEGORIES}, "row_numbers": []})
        group["occurrence_count"] += 1
        group["category_counts"][row["category"]] += 1
        if len(group["row_numbers"]) < 3:
            group["row_numbers"].append(number)
    if len(rows) != 7000 or len(groups) != 320 or sum(p["occurrence_count"] for p in sorted(groups.values(), key=lambda p: -p["occurrence_count"])[:20]) != 5025:
        raise ValueError("Official record/pattern/top-20 invariants differ")
    if Counter(r["category"] for r in rows) != dict(zip(CATEGORIES, [1738, 1707, 1755, 1800])):
        raise ValueError("Official category counts differ")
    if [sum(p["category_counts"][c] > 0 for p in groups.values()) for c in CATEGORIES] != [183, 66, 35, 36]:
        raise ValueError("Official category pattern counts differ")
    ordered = sorted(groups.values(), key=lambda p: p["normalized_hash"])
    selected = []
    def take(candidates, count):
        for p in candidates:
            if p not in selected:
                selected.append(p)
                count -= 1
                if count == 0:
                    break
    take([p for p in ordered if re.search(r"\b(not|no|never|without)\b", p["normalized_text"])], 5)
    take([p for p in ordered if re.search(r"\b(but|however|although)\b", p["normalized_text"])], 5)
    for category in CATEGORIES:
        take([p for p in ordered if p["category_counts"][category]], 4)
    take(ordered, max(1, size - len(selected)))
    selected = selected[:size]
    schema = json.loads((ROOT / "scripts/adaption/annotation.schema.json").read_text(encoding="utf-8"))
    output.mkdir(parents=True, exist_ok=True)
    with (output / "pilot.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["prompt", "review", "original_category", "normalized_hash", "occurrence_count"])
        writer.writeheader()
        for p in selected:
            writer.writerow({"prompt": PROMPT + " Source pattern ID: " + p["normalized_hash"] + " Schema: " + canonical(schema),
                "review": p["review"], "original_category": canonical(p["category_counts"]), "normalized_hash": p["normalized_hash"], "occurrence_count": p["occurrence_count"]})
    with (output / "human-review.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["normalized_hash","review","occurrence_count","source_rows","gold_sentiment","gold_issue_types","gold_severity","review_status","notes"])
        writer.writeheader()
        for p in selected:
            writer.writerow({"normalized_hash":p["normalized_hash"],"review":p["review"],"occurrence_count":p["occurrence_count"],
                "source_rows":canonical(p["row_numbers"]),"review_status":"unreviewed"})
    config = {"column_mapping":{"prompt":"prompt","context":["review","original_category","normalized_hash","occurrence_count"]},
        "job_specification":{"max_rows":len(selected)},
        "recipe_specification":{"recipes":{"deduplication":False,"prompt_rephrase":False,"reasoning_traces":False}},
        "training_type":"instruction_dataset","language_expansion":None,
        "brand_controls":{"length":"concise","hallucination_mitigation":False,"blueprint":PROMPT}}
    config_hash = digest(canonical(config).encode("utf-8"))
    (output / "config.json").write_text(canonical(config)+"\n",encoding="utf-8")
    manifest = {"sourceSha256":SOURCE_SHA256,"sourceRows":len(rows),"distinctPatterns":len(groups),
        "task":"candidate instruction training data; generated completions require independent human review, not online inference",
        "preparedAt":datetime.now(timezone.utc).isoformat(),"sdkVersion":"0.14.0","configSha256":config_hash,
        "pilotSha256":digest((output/"pilot.csv").read_bytes()),"pilotRows":len(selected),
        "datasetId":None,"runId":None,"estimatedCredits":None,"actualCredits":None,
        "status":"prepared_offline","patterns":ordered,"pilotHashes":[p["normalized_hash"] for p in selected]}
    (output / "manifest.json").write_text(canonical(manifest)+"\n",encoding="utf-8")
    print(json.dumps({"status":"prepared_offline","sourceRows":7000,"distinctPatterns":320,"pilotRows":len(selected),"configSha256":config_hash,"networkCalls":0,"output":str(output)},indent=2))

def estimate(folder: Path, dataset_id: str, allow_network: bool, approve_estimate=None):
    return operations.estimate(folder, dataset_id, allow_network, approve_estimate)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    subs=parser.add_subparsers(dest="command",required=True)
    prep=subs.add_parser("prepare"); prep.add_argument("--source",type=Path,default=ROOT/"data/raw/customer_feedback.csv"); prep.add_argument("--output",type=Path,default=ROOT/"artifacts/adaption"); prep.add_argument("--size",type=int,default=25)
    for command in ["upload", "estimate", "execute", "download"]:
        provider=subs.add_parser(command)
        provider.add_argument("--folder",type=Path,default=ROOT/"artifacts/adaption")
        provider.add_argument("--allow-network",action="store_true")
        provider.add_argument("--secrets-file", type=Path, help="Explicit ignored local .env.local; only ADAPTION_API_KEY is loaded")
        if command=="upload": provider.add_argument("--approve-transfer")
        elif command=="estimate":
            provider.add_argument("--dataset-id",required=True); provider.add_argument("--approve-estimate")
        elif command=="execute":
            provider.add_argument("--approve-spend"); provider.add_argument("--max-credits",type=float)
        else: provider.add_argument("--approve-run")
    validate=subs.add_parser("validate"); validate.add_argument("--input",type=Path,required=True); validate.add_argument("--manifest",type=Path,default=ROOT/"artifacts/adaption/manifest.json"); validate.add_argument("--provenance",type=Path,required=True); validate.add_argument("--human-review",type=Path,default=ROOT/"artifacts/adaption/human-review.csv")
    args=parser.parse_args()
    if args.command in {"upload", "estimate", "execute", "download"} and args.secrets_file:
        if not args.allow_network:
            raise ValueError("Secret loading for provider commands requires --allow-network; no operation is authorized by flags alone")
        load_key(args.secrets_file)
    if args.command=="prepare":
        prepare(args.source,args.output,args.size)
    elif args.command=="estimate":
        print(json.dumps(estimate(args.folder,args.dataset_id,args.allow_network,args.approve_estimate),indent=2))
    elif args.command=="upload":
        print(json.dumps(operations.upload(args.folder,args.allow_network,args.approve_transfer),indent=2))
    elif args.command=="execute":
        print(json.dumps(operations.execute(args.folder,args.allow_network,args.approve_spend,args.max_credits),indent=2))
    elif args.command=="download":
        print(json.dumps(operations.download(args.folder,args.allow_network,args.approve_run),indent=2))
    else:
        subprocess.run(["node","--import","tsx","scripts/validate-adaption.ts",str(args.input),str(args.manifest),str(args.provenance),str(args.human_review)],cwd=ROOT,check=True)

if __name__=="__main__":
    try:
        main()
    except (ValueError,RuntimeError,FileNotFoundError,subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
    except Exception:
        raise SystemExit("Provider preflight or SDK unavailable; no automatic retry. Inspect local attempt records and account state privately") from None
