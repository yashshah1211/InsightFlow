"""Authored test fixtures only; provider client creation is always mocked."""
import json
import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import review
import operations
from local_secrets import load_key


class SecretTests(unittest.TestCase):
    def test_loads_only_key_and_preserves_environment(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / ".env.local"
            path.write_text('ADAPTION_API_KEY="unit-test-placeholder"\nUNRELATED_SECRET=ignored\n', encoding="utf-8")
            values = {}
            self.assertEqual(load_key(path, values), "local_secret_file")
            self.assertEqual(values, {"ADAPTION_API_KEY": "unit-test-placeholder"})
            values["ADAPTION_API_KEY"] = "existing-test-placeholder"
            self.assertEqual(load_key(path, values), "process_environment")
            self.assertEqual(values["ADAPTION_API_KEY"], "existing-test-placeholder")

    def test_rejects_duplicates_and_expression_syntax_without_exposing_values(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / ".env.local"
            for text in ('ADAPTION_API_KEY=private-test-value\nADAPTION_API_KEY=another-value', 'ADAPTION_API_KEY=$(private-test-value)'):
                path.write_text(text, encoding="utf-8")
                with self.assertRaises(ValueError) as caught:
                    load_key(path, {})
                self.assertNotIn("private-test-value", str(caught.exception))


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        parent = self.root / "parent"
        parent.mkdir()
        (parent / "pilot.csv").write_bytes(b"test-only-parent\n")
        (parent / "manifest.json").write_text(json.dumps({"pilotSha256": operations.sha((parent / "pilot.csv").read_bytes())}), encoding="utf-8")
        official = self.root / "official.csv"
        official.write_bytes(b"review,category\nDistinct unrelated reference,Product Feedback\n")
        texts = [f"Authored fixture {i}: the blue hinge folds flat beside a painted dial." for i in range(25)]
        proposals = [{"normalizedHash": operations.sha(review.normalize(t).encode()), "sentiment": "neutral", "severity": "unknown",
                      "issueTypes": [], "negation": "None", "mixed": False, "notes": "Test only", "evidence": [t],
                      "origin": "assistant_proposed", "reviewStatus": "unreviewed", "confidence": None} for t in texts]
        self.input = self.root / "input.json"
        self.input.write_text(json.dumps({"sourceKind": "synthetic_original", "reviews": texts, "proposals": proposals}), encoding="utf-8")
        self.folder = self.root / "bundle"
        with patch.object(review, "SOURCE_SHA256", operations.sha(official.read_bytes())):
            self.result = review.prepare(self.input, self.folder, parent, official)

    def test_gold_is_separate_blank_and_no_metrics_are_invented(self):
        self.assertEqual(self.result["verifiedGoldRows"], 0)
        self.assertIsNone(self.result["accuracy"])
        self.assertEqual(self.result["networkCalls"], 0)
        self.assertNotIn("Proposed sentiment", (self.folder / "gold-source-only.md").read_text())
        self.assertIn("Proposed sentiment", (self.folder / "review-sheet.md").read_text())
        self.assertEqual(operations.load_pilot(self.folder)[0]["sourceKind"], "synthetic_original")

    def test_upload_cannot_bypass_unapproved_gold_or_create_client(self):
        manifest = operations.read(self.folder / "manifest.json")
        with patch.object(operations, "make_client") as client:
            with self.assertRaisesRegex(ValueError, "independent human"):
                operations.upload(self.folder, True, manifest["pilotSha256"])
            client.assert_not_called()
        self.assertFalse((self.folder / "upload.attempt.json").exists())

    def test_transfer_record_requires_permission_and_exact_manifest_binding_after_gold(self):
        path = self.folder / "human-review.csv"
        with path.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        for row in rows:
            row.update(gold_sentiment="neutral", gold_severity="unknown", gold_issue_types="[]", review_status="verified",
                       gold_negation="None", gold_mixed="false", gold_aspects="[]",
                       reviewer="test-only reviewer", reviewed_at="2026-10-11T00:00:00Z", independence_attestation="Test-only attestation")
        path.write_bytes(review.csv_bytes(rows, review.GOLD_FIELDS))
        self.assertEqual(review.validate_bundle(self.folder)["verifiedGoldRows"], 25)
        with self.assertRaisesRegex(ValueError, "permission"):
            review.transfer_gate(self.folder)
        approval_path = self.folder / "transfer-approval.json"
        approval = operations.read(approval_path)
        approval.update(status="approved", reviewer="test-only reviewer", reviewedAt="2026-10-11T00:00:00Z",
                        permissionEvidence="Test-only permission", piiReviewed=True, exactInputApproved=True)
        operations.write(approval_path, approval)
        review.transfer_gate(self.folder)
        approval["manifestSha256"] = "0" * 64
        operations.write(approval_path, approval)
        with self.assertRaisesRegex(ValueError, "exact manifest"):
            review.transfer_gate(self.folder)

    def test_changed_source_and_payload_are_rejected(self):
        (self.folder / "source.csv").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "Source checksum"):
            operations.load_pilot(self.folder)
        (self.folder / "pilot.csv").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "checksum"):
            review.validate_bundle(self.folder)

    def test_proposals_cannot_be_relabelled_as_approved_ground_truth(self):
        proposals = operations.read(self.folder / "proposals.json")
        proposals[0]["reviewStatus"] = "verified"
        (self.folder / "proposals.json").write_text(json.dumps(proposals), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "unreviewed"):
            review.validate_bundle(self.folder)

    def test_novelty_and_pii_screening_flags(self):
        self.assertTrue(review.novelty(["The dial is broken"], ["the dial is broken"])[0]["needsNoveltyReview"])
        self.assertTrue(review.novelty(["The small green box was delivered empty yesterday"], ["The small green box was delivered empty last week"])[0]["needsNoveltyReview"])
        self.assertEqual(review.pii_flags("Reach me at person@example.invalid"), ["email"])
        self.assertEqual(review.pii_flags("Generic anonymous feedback"), [])
