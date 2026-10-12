"""Offline review bundles. Source/proposals stay in ignored artifacts, never provider calls."""
from __future__ import annotations
import argparse
import csv
import io
import json
import re
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from operations import canonical, sha, SDK_VERSION, SOURCE_SHA256, read
from pipeline import PROMPT, normalize, ROOT

PROFILE = "phase6b-v1"
SENTIMENTS = {"positive", "negative", "neutral", "mixed", "unknown"}
SEVERITIES = {"low", "medium", "high", "critical", "unknown"}
GOLD_FIELDS = ["normalized_hash", "review", "gold_sentiment", "gold_issue_types", "gold_severity", "gold_negation", "gold_mixed", "gold_aspects",
               "review_status", "reviewer", "reviewed_at", "independence_attestation", "notes"]


def approved_time(value):
    try:
        if datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is None:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise ValueError("Human approval needs an ISO timestamp with timezone") from None


def csv_bytes(rows, fields):
    handle = io.StringIO(newline="")
    writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return handle.getvalue().encode("utf-8")


def pii_flags(text):
    # Advisory detector only. Named entities and other PII need human inspection.
    checks = {"email": r"\b[^\s@]+@[^\s@]+\.[^\s@]+\b", "url": r"https?://\S+",
              "long_numeric_identifier": r"(?:\d[ -]?){7,}", "handle": r"(?<!\w)@\w+"}
    return [name for name, pattern in checks.items() if re.search(pattern, text)]


def novelty(reviews, reference):
    result = []
    originals = [(sha(text.encode()), text) for text in sorted({normalize(text) for text in reference})]
    for review in reviews:
        text = normalize(review)
        words = re.findall(r"\w+", text)
        grams = {tuple(words[i:i+6]) for i in range(max(0, len(words)-5))}
        scores = []
        shared = False
        for key, original in originals:
            tokens = re.findall(r"\w+", original)
            shared |= bool(grams & {tuple(tokens[i:i+6]) for i in range(max(0, len(tokens)-5))})
            scores.append((SequenceMatcher(None, text, original, autojunk=False).ratio(), key))
        score, nearest = max(scores, default=(0.0, None))
        exact = sha(text.encode()) in {key for key, _ in originals}
        result.append({"normalizedHash": sha(text.encode()), "exactDuplicate": exact,
                       "maxSequenceSimilarity": round(score, 6), "nearestOfficialHash": nearest,
                       "sharedSixWordPhrase": shared, "needsNoveltyReview": exact or score >= 0.65 or shared})
    return result


def proposal_checks(rows, proposals):
    if len(proposals) != len(rows):
        raise ValueError("Exactly one proposal per source row is required")
    for row, proposal in zip(rows, proposals):
        if proposal["normalizedHash"] != row["normalized_hash"] or proposal["sentiment"] not in SENTIMENTS or proposal["severity"] not in SEVERITIES:
            raise ValueError("Proposal source/label mismatch")
        if not isinstance(proposal["issueTypes"], list) or any(not isinstance(t, str) or not t for t in proposal["issueTypes"]):
            raise ValueError("Invalid proposed issue types")
        if proposal["confidence"] is not None or proposal["reviewStatus"] != "unreviewed" or proposal["origin"] != "assistant_proposed":
            raise ValueError("Proposals must remain unreviewed and uncalibrated")
        if not proposal["evidence"] or any(not quote or quote not in row["review"] for quote in proposal["evidence"]):
            raise ValueError("Proposed evidence must be verbatim")
        if not isinstance(proposal["mixed"], bool) or not isinstance(proposal["negation"], str) or not isinstance(proposal["notes"], str):
            raise ValueError("Missing proposed mixed/negation/review notes")


def prepare(input_path: Path, output: Path, parent: Path, official_source: Path):
    if output.exists():
        raise ValueError("Review bundle already exists; never overwrite human work or attempts")
    supplied, legacy = read(input_path), read(parent / "manifest.json")
    original = official_source.read_bytes()
    if sha(original) != SOURCE_SHA256 or sha((parent / "pilot.csv").read_bytes()) != legacy["pilotSha256"]:
        raise ValueError("Original official source/parent pilot binding changed")
    reference = list(csv.DictReader(io.StringIO(original.decode("utf-8-sig"))))
    kind = supplied["sourceKind"]
    reviews = supplied["reviews"]
    if kind not in {"official_csv", "synthetic_original"} or len(reviews) != 25 or any(not isinstance(t, str) or not t.strip() or len(t) > 4000 for t in reviews):
        raise ValueError("Require exactly 25 bounded original reviews and explicit source kind")
    rows = [{"review": text, "normalized_hash": sha(normalize(text).encode())} for text in reviews]
    if len({row["normalized_hash"] for row in rows}) != 25:
        raise ValueError("Duplicate pilot source patterns")
    scan = novelty(reviews, [r["review"] for r in reference]) if kind == "synthetic_original" else None
    if scan and any(r["needsNoveltyReview"] for r in scan):
        raise ValueError("Synthetic novelty screening flagged a potential duplicate/paraphrase; revise offline")
    if kind == "official_csv":
        with (parent / "pilot.csv").open(encoding="utf-8", newline="") as handle:
            old_rows = list(csv.DictReader(handle))
        if rows != [{k: r[k] for k in ("review", "normalized_hash")} for r in old_rows]:
            raise ValueError("Official pilot must preserve the original 25 reviews and order")
    proposal_checks(rows, supplied["proposals"])
    schema = read(ROOT / "scripts/adaption/annotation.schema.json")
    config = {"column_mapping": {"universal_prompt": PROMPT + " Schema: " + canonical(schema), "context": ["review", "normalized_hash"]},
              "job_specification": {"max_rows": 25}, "recipe_specification": {"recipes": {"deduplication": False, "prompt_rephrase": False, "reasoning_traces": False}},
              "training_type": "instruction_dataset", "language_expansion": None,
              "brand_controls": {"length": "concise", "hallucination_mitigation": False, "blueprint": PROMPT}}
    payload = csv_bytes(rows, ["review", "normalized_hash"])
    source = original if kind == "official_csv" else csv_bytes([{"review": t} for t in reviews], ["review"])
    manifest = {"profile": PROFILE, "sourceKind": kind, "sourceSha256": sha(source), "sourceRows": 7000 if kind == "official_csv" else 25,
                "distinctPatterns": 320 if kind == "official_csv" else 25, "sdkVersion": SDK_VERSION,
                "pilotRows": 25, "pilotSha256": sha(payload), "configSha256": sha(canonical(config).encode()),
                "parentPilotSha256": legacy["pilotSha256"] if kind == "official_csv" else None,
                "pilotHashes": [r["normalized_hash"] for r in rows],
                "patterns": rows, "status": "prepared_offline", "datasetId": None, "runId": None,
                "estimatedCredits": None, "actualCredits": None,
                "transferPermission": "unconfirmed_official_permission" if kind == "official_csv" else "original_authored_synthetic_pending_user_review",
                "uploadFields": ["review", "normalized_hash"], "networkCalls": 0}
    output.mkdir(parents=True)
    (output / "pilot.csv").write_bytes(payload)
    # Full official source is already local. Synthetic source has its own byte-level provenance.
    if kind == "synthetic_original":
        (output / "source.csv").write_bytes(source)
    for name, value in [("config.json", config), ("manifest.json", manifest), ("proposals.json", supplied["proposals"]),
                        ("novelty.json", scan), ("pii-screen.json", [{"normalizedHash": r["normalized_hash"], "flags": pii_flags(r["review"])} for r in rows]),
                        ("transfer-approval.json", {"manifestSha256": sha((canonical(manifest)+"\n").encode()), "pilotSha256": sha(payload),
                           "configSha256": manifest["configSha256"], "sourceKind": kind, "status": "unapproved", "reviewer": "", "reviewedAt": None,
                           "permissionEvidence": "", "piiReviewed": False, "exactInputApproved": False})]:
        (output / name).write_text(canonical(value)+"\n", encoding="utf-8", newline="\n")
    gold = [{"normalized_hash": r["normalized_hash"], "review": r["review"], "review_status": "unreviewed"} for r in rows]
    (output / "human-review.csv").write_bytes(csv_bytes(gold, GOLD_FIELDS))
    blind = [f"# {kind}: independent gold review (25 patterns)", "",
             "Write labels from the original text before viewing proposals/provider completions. Do not copy suggestions into gold.",
             "Gold is not approved until a human supplies every label, reviewer, UTC time and independence attestation in human-review.csv.",
             "Use issue-type identifiers consistently; [] means no issue. unknown is valid. No complaint dates exist.",
             "Also record gold_negation, gold_mixed (true/false/unknown) and gold_aspects (JSON array of topic/sentiment/evidenceQuote). Use exact quotes.", ""]
    sheet = [f"# {kind}: proposed annotation review (25 patterns)", "",
             "ASSISTANT PROPOSALS ONLY — unreviewed; confidence=null. These are not human gold or provider results.",
             "To avoid anchoring, use gold-source-only.md first. Human changes go in the separate human-review.csv.",
             "Severity is a triage proposal based on stated impact, never repetition. Reported fraud is an allegation, not established fact.",
             "No automatic PII detector guarantees absence; manually inspect every review. Resolve notes/taxonomy before approving.", ""]
    for index, (row, p) in enumerate(zip(rows, supplied["proposals"]), 1):
        block = [f"## {index}. {row['normalized_hash']}", "", "> " + row["review"].replace("\n", "\n> "), ""]
        blind.extend(block + ["Gold sentiment / issue types / severity / notes: __________________", ""])
        sheet.extend(block + [f"Proposed sentiment: **{p['sentiment']}**; severity: **{p['severity']}**; issues: `{canonical(p['issueTypes'])}`.",
          f"Negation: {p['negation']}. Mixed aspects: {p['mixed']}.",
          "Exact evidence: " + canonical(p["evidence"]), "Human decisions: " + p["notes"],
          "PII screen flags: " + canonical(pii_flags(row["review"])) + " (manual review pending).", ""])
    (output / "gold-source-only.md").write_text("\n".join(blind), encoding="utf-8")
    (output / "review-sheet.md").write_text("\n".join(sheet), encoding="utf-8")
    return validate_bundle(output)


def validate_bundle(folder: Path):
    manifest, config = read(folder / "manifest.json"), read(folder / "config.json")
    if manifest.get("profile") != PROFILE or manifest["sdkVersion"] != SDK_VERSION or manifest["sourceKind"] not in {"official_csv", "synthetic_original"}:
        raise ValueError("Unknown pilot profile/source/SDK")
    if sha((folder / "pilot.csv").read_bytes()) != manifest["pilotSha256"] or sha(canonical(config).encode()) != manifest["configSha256"]:
        raise ValueError("Pilot/config checksum changed")
    with (folder / "pilot.csv").open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != ["review", "normalized_hash"]:
            raise ValueError("Unexpected upload fields")
        rows = list(reader)
    if len(rows) != 25 or manifest["pilotRows"] != 25 or rows != manifest["patterns"] or [r["normalized_hash"] for r in rows] != manifest["pilotHashes"] or len(set(manifest["pilotHashes"])) != 25:
        raise ValueError("Pilot source correspondence changed")
    if any(sha(normalize(r["review"]).encode()) != r["normalized_hash"] for r in rows):
        raise ValueError("Invalid normalized source hash")
    source_path = ROOT / "data/raw/customer_feedback.csv" if manifest["sourceKind"] == "official_csv" else folder / "source.csv"
    source = source_path.read_bytes()
    if sha(source) != manifest["sourceSha256"] or (manifest["sourceKind"] == "official_csv" and manifest["sourceSha256"] != SOURCE_SHA256):
        raise ValueError("Source checksum changed")
    source_rows = list(csv.DictReader(io.StringIO(source.decode("utf-8-sig"))))
    if manifest["sourceRows"] != len(source_rows) or any(r["review"] not in {s["review"] for s in source_rows} for r in rows):
        raise ValueError("Source text/row count mismatch")
    if manifest["sourceKind"] == "synthetic_original" and [s["review"] for s in source_rows] != [r["review"] for r in rows]:
        raise ValueError("Synthetic source correspondence mismatch")
    schema = read(ROOT / "scripts/adaption/annotation.schema.json")
    if config != {"column_mapping": {"universal_prompt": PROMPT + " Schema: " + canonical(schema), "context": ["review", "normalized_hash"]},
                  "job_specification": {"max_rows": 25}, "recipe_specification": {"recipes": {"deduplication": False, "prompt_rephrase": False, "reasoning_traces": False}},
                  "training_type": "instruction_dataset", "language_expansion": None,
                  "brand_controls": {"length": "concise", "hallucination_mitigation": False, "blueprint": PROMPT}}:
        raise ValueError("Unreviewed adaptation config")
    proposal_checks(rows, read(folder / "proposals.json"))
    with (folder / "human-review.csv").open(encoding="utf-8", newline="") as handle:
        gold = list(csv.DictReader(handle))
    if len(gold) != 25 or [(g["normalized_hash"], g["review"]) for g in gold] != [(r["normalized_hash"], r["review"]) for r in rows]:
        raise ValueError("Gold source correspondence changed")
    verified = 0
    for g in gold:
        if g["review_status"] == "verified":
            if g["gold_sentiment"] not in SENTIMENTS or g["gold_severity"] not in SEVERITIES or not all(g[k].strip() for k in ("reviewer", "reviewed_at", "independence_attestation")):
                raise ValueError("Gold lacks human approval/independence")
            approved_time(g["reviewed_at"])
            if not g.get("gold_negation", "").strip() or g.get("gold_mixed") not in {"true", "false", "unknown"}:
                raise ValueError("Gold lacks negation/mixed review")
            aspects = json.loads(g.get("gold_aspects", ""))
            if not isinstance(aspects, list) or any(not isinstance(a, dict) or set(a) != {"topic", "sentiment", "evidenceQuote"} or
                    not a["topic"] or a["sentiment"] not in SENTIMENTS or not a["evidenceQuote"] or a["evidenceQuote"] not in g["review"] for a in aspects):
                raise ValueError("Gold aspect evidence must be verbatim")
            topics = json.loads(g["gold_issue_types"])
            if not isinstance(topics, list) or any(not isinstance(t, str) or not t for t in topics):
                raise ValueError("Invalid gold topic list")
            verified += 1
        elif g["review_status"] not in {"unreviewed", "rejected"}:
            raise ValueError("Invalid human review state")
    return {"status": "offline_validated", "sourceKind": manifest["sourceKind"], "pilotRows": 25,
            "pilotSha256": manifest["pilotSha256"], "configSha256": manifest["configSha256"], "sourceSha256": manifest["sourceSha256"],
            "verifiedGoldRows": verified, "accuracy": None, "networkCalls": 0,
            "piiFlaggedRows": sum(bool(pii_flags(r["review"])) for r in rows)}


def transfer_gate(folder: Path):
    summary = validate_bundle(folder)
    manifest, approval = read(folder / "manifest.json"), read(folder / "transfer-approval.json")
    if summary["verifiedGoldRows"] != 25:
        raise ValueError("All 25 independent human gold reviews must be approved first")
    if approval.get("manifestSha256") != sha((folder / "manifest.json").read_bytes()) or approval.get("pilotSha256") != manifest["pilotSha256"] or approval.get("configSha256") != manifest["configSha256"] or approval.get("sourceKind") != manifest["sourceKind"]:
        raise ValueError("Transfer approval does not bind this exact manifest/input/config")
    if approval.get("status") != "approved" or approval.get("piiReviewed") is not True or approval.get("exactInputApproved") is not True or not all(approval.get(k) for k in ("permissionEvidence", "reviewer", "reviewedAt")):
        raise ValueError("Explicit human transfer permission/input/PII approval is missing")
    approved_time(approval["reviewedAt"])
    # A local approval record supplements, never replaces, explicit user authorization.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--input", type=Path, required=True)
    prep.add_argument("--output", type=Path, required=True)
    prep.add_argument("--parent", type=Path, default=ROOT / "artifacts/adaption")
    prep.add_argument("--official-source", type=Path, default=ROOT / "data/raw/customer_feedback.csv")
    check = sub.add_parser("check")
    check.add_argument("--folder", type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.input, args.output, args.parent, args.official_source) if args.command == "prepare" else validate_bundle(args.folder)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError):
        raise SystemExit("Offline review validation failed; inspect local files privately (values suppressed)") from None
