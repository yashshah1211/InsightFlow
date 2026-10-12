"""All provider responses here are explicit test doubles; no SDK import or provider IO."""
import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import operations
import pipeline

@unittest.skipUnless((pipeline.ROOT / "data/raw/customer_feedback.csv").exists(), "Original CSV not supplied")
class OperationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        with contextlib.redirect_stdout(io.StringIO()):
            pipeline.prepare(pipeline.ROOT / "data/raw/customer_feedback.csv", self.folder, 25)
        self.manifest, self.config = operations.load_pilot(self.folder)
        self.client = Mock()
        self.client.datasets.get_status.return_value = SimpleNamespace(dataset_id="test-dataset", status="awaiting_input", row_count=25)
        self.client.datasets.get.return_value = SimpleNamespace(dataset_id="test-dataset", status="awaiting_input", row_count=25, run_id=None)
        self.client.datasets.upload_file.return_value = SimpleNamespace(dataset_id="test-dataset", status="pending")
        self.client.datasets.adapt.return_value = SimpleNamespace(run_id=None, estimate=True, estimated_credits_consumed=12)
        self.mock_client = patch.object(operations, "make_client", return_value=self.client)
        self.factory = self.mock_client.start()

    def tearDown(self):
        self.mock_client.stop()
        self.temp.cleanup()

    def upload(self):
        return operations.upload(self.folder, True, self.manifest["pilotSha256"])

    def quote(self):
        self.upload()
        return operations.estimate(self.folder, "test-dataset", True, self.manifest["configSha256"])

    def execute(self):
        self.quote()
        self.client.datasets.adapt.return_value = SimpleNamespace(run_id="test-run", estimate=False)
        approval = operations.sha((self.folder / "estimate.json").read_bytes())
        return operations.execute(self.folder, True, approval, 12)

    def test_all_provider_commands_default_to_no_network(self):
        for command in [lambda: operations.upload(self.folder), lambda: operations.estimate(self.folder, "test-dataset"),
                        lambda: operations.execute(self.folder), lambda: operations.download(self.folder)]:
            with self.assertRaisesRegex(ValueError, "allow-network"):
                command()
        self.factory.assert_not_called()

    def test_transfer_approval_and_exact_source_binding(self):
        with self.assertRaisesRegex(ValueError, "approval"):
            operations.upload(self.folder, True, "wrong")
        self.factory.assert_not_called()
        result = self.upload()
        self.assertEqual(result["datasetId"], "test-dataset")
        self.assertIsNone(result["runId"])
        self.client.datasets.adapt.assert_not_called()
        with self.assertRaisesRegex(ValueError, "already attempted"):
            self.upload()
        self.assertEqual(self.client.datasets.upload_file.call_count, 1)

    def test_modified_pilot_fails_before_client_creation(self):
        with (self.folder / "pilot.csv").open("a") as handle:
            handle.write("changed")
        with self.assertRaisesRegex(ValueError, "changed"):
            self.upload()
        self.factory.assert_not_called()

    def test_quote_is_estimate_only_and_bound_to_uploaded_dataset(self):
        quote = self.quote()
        self.assertIsNone(quote["runId"])
        self.assertEqual(quote["estimatedCredits"], 12)
        self.client.datasets.adapt.assert_called_once_with("test-dataset", estimate=True, **self.config)
        with self.assertRaisesRegex(ValueError, "bound"):
            operations.estimate(self.folder, "other-dataset", True, self.manifest["configSha256"])

    def test_prior_estimate_readiness_probe_prevents_duplicate_quote(self):
        self.upload()
        operations.reserve(self.folder, 'estimate-readiness', 'test-only')
        self.factory.reset_mock()
        with self.assertRaisesRegex(ValueError, 'already attempted'):
            operations.estimate(self.folder, 'test-dataset', True, self.manifest['configSha256'])
        self.factory.assert_not_called()
        self.client.datasets.adapt.assert_not_called()

    def previous_probe(self):
        self.upload()
        operations.write(self.folder / 'estimate-readiness.json', {'datasetId': 'test-dataset', 'runId': None,
            'estimate': True, 'configuration': self.config, 'configSha256': self.manifest['configSha256'],
            'pilotSha256': self.manifest['pilotSha256']})
        operations.reserve(self.folder, 'estimate-readiness', 'test-only')
        return operations.sha((self.folder / 'estimate-readiness.json').read_bytes())

    def test_authorized_probe_confirmation_preserves_prior_evidence_and_blocks_repeats(self):
        previous = self.previous_probe()
        prior_bytes = (self.folder / 'estimate-readiness.json').read_bytes()
        result = operations.estimate(self.folder, 'test-dataset', True, self.manifest['configSha256'], previous, 12)
        self.assertEqual(result['confirmedFromQuoteSha256'], previous)
        self.assertEqual((self.folder / 'estimate-readiness.json').read_bytes(), prior_bytes)
        self.assertEqual(operations.read(self.folder / 'estimate.json')['estimatedCredits'], 12)
        with self.assertRaisesRegex(ValueError, 'overwrite'):
            operations.estimate(self.folder, 'test-dataset', True, self.manifest['configSha256'], previous, 12)
        self.client.datasets.adapt.assert_called_once_with('test-dataset', estimate=True, **self.config)

    def test_confirmed_quote_above_cap_is_recorded_without_executable_quote(self):
        previous = self.previous_probe()
        with self.assertRaisesRegex(ValueError, 'exceeds authorization'):
            operations.estimate(self.folder, 'test-dataset', True, self.manifest['configSha256'], previous, 1)
        self.assertFalse((self.folder / 'estimate.json').exists())
        self.assertEqual(operations.read(self.folder / 'estimate-confirmed.json')['estimatedCredits'], 12)
        with self.assertRaisesRegex(ValueError, 'already attempted'):
            operations.estimate(self.folder, 'test-dataset', True, self.manifest['configSha256'], previous, 12)

    def test_confirmed_quote_rejects_existing_run_before_any_submission(self):
        previous = self.previous_probe()
        self.client.datasets.get.return_value.run_id = 'already-submitted-test-run'
        with self.assertRaisesRegex(ValueError, 'metadata'):
            operations.estimate(self.folder, 'test-dataset', True, self.manifest['configSha256'], previous, 12)
        self.client.datasets.adapt.assert_not_called()
        self.assertFalse((self.folder / 'estimate-confirmed.attempt.json').exists())

    def test_single_idempotent_execution_keeps_reviewed_config_and_attempt_binding(self):
        self.quote()
        prior_config = (self.folder / 'config.json').read_bytes()
        self.client.datasets.adapt.return_value = SimpleNamespace(run_id='test-run', estimate=False)
        approval = operations.sha((self.folder / 'estimate.json').read_bytes())
        result = operations.execute(self.folder, True, approval, 12, 'test-one-run-key')
        request_config = operations.read(self.folder / 'config.json')
        request_config['job_specification']['idempotency_key'] = 'test-one-run-key'
        self.client.datasets.adapt.assert_called_with('test-dataset', estimate=False, **request_config)
        self.assertEqual((self.folder / 'config.json').read_bytes(), prior_config)
        self.assertEqual(result['idempotencyKey'], 'test-one-run-key')
        self.assertEqual(operations.read(self.folder / 'execute.attempt.json')['binding']['idempotencyKey'], 'test-one-run-key')
        with self.assertRaisesRegex(ValueError, 'already attempted'):
            operations.execute(self.folder, True, approval, 12, 'a-different-key-cannot-retry')

    def test_upload_not_ready_or_wrong_count_cannot_start_adaptation(self):
        self.upload()
        self.client.datasets.get_status.return_value.row_count = 24
        with self.assertRaisesRegex(ValueError, "awaiting_input"):
            operations.estimate(self.folder, "test-dataset", True, self.manifest["configSha256"])
        self.client.datasets.adapt.assert_not_called()

    def test_quote_returning_run_marks_uncertain_attempt_and_is_not_retried(self):
        self.upload()
        self.client.datasets.adapt.return_value.run_id = "unexpected-test-run"
        with self.assertRaisesRegex(RuntimeError, "reconcile"):
            operations.estimate(self.folder, "test-dataset", True, self.manifest["configSha256"])
        self.assertEqual(operations.read(self.folder / "estimate.attempt.json")["status"], "unknown_requires_reconciliation")
        with self.assertRaisesRegex(ValueError, "already attempted"):
            operations.estimate(self.folder, "test-dataset", True, self.manifest["configSha256"])
        self.assertEqual(self.client.datasets.adapt.call_count, 1)

    def test_paid_submission_uses_approved_quote_once_and_actual_usage_remains_unknown(self):
        result = self.execute()
        self.assertEqual(result["runId"], "test-run")
        self.assertIsNone(result["actualCredits"])
        self.client.datasets.adapt.assert_called_with("test-dataset", estimate=False, **self.config)
        with self.assertRaisesRegex(ValueError, "already attempted"):
            operations.execute(self.folder, True, result["quoteSha256"], 12)
        self.assertEqual(self.client.datasets.adapt.call_count, 2)  # quote + one execution

    def test_credit_caps_and_stale_quotes_block_spend(self):
        self.quote()
        approval = operations.sha((self.folder / "estimate.json").read_bytes())
        for cap in [None, -1, 11, float("nan"), float("inf")]:
            with self.assertRaisesRegex(ValueError, "max-credits"):
                operations.execute(self.folder, True, approval, cap)
        quote = operations.read(self.folder / "estimate.json")
        quote["quotedAt"] = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        operations.write(self.folder / "estimate.json", quote)
        with self.assertRaisesRegex(ValueError, "stale"):
            operations.execute(self.folder, True, operations.sha((self.folder / "estimate.json").read_bytes()), 12)
        self.assertEqual(self.client.datasets.adapt.call_count, 1)

    def test_timeout_keeps_reservation_to_prevent_duplicate_spend(self):
        self.quote()
        approval = operations.sha((self.folder / "estimate.json").read_bytes())
        self.client.datasets.adapt.side_effect = TimeoutError("sensitive test-only provider detail")
        with self.assertRaisesRegex(RuntimeError, "reconcile"):
            operations.execute(self.folder, True, approval, 12)
        with self.assertRaisesRegex(ValueError, "already attempted"):
            operations.execute(self.folder, True, approval, 12)
        self.assertEqual(self.client.datasets.adapt.call_count, 2)

    def test_download_rejects_partial_or_foreign_runs_and_preserves_original_bytes(self):
        self.execute()
        self.client.datasets.get.return_value = SimpleNamespace(dataset_id="test-dataset", run_id="test-run")
        self.client.datasets.get_status.return_value.status = "failed"
        with self.assertRaisesRegex(ValueError, "successful"):
            operations.download(self.folder, True, "test-run")
        self.client.datasets.download.assert_not_called()
        self.client.datasets.get_status.return_value.status = "succeeded"
        self.client.datasets.get.return_value.run_id = "different-run"
        with self.assertRaisesRegex(ValueError, "correspondence"):
            operations.download(self.folder, True, "test-run")
        self.client.datasets.get.return_value.run_id = "test-run"
        data = b'{"test_only":true}\n'
        self.client.datasets.download.return_value.read.return_value = data
        result = operations.download(self.folder, True, "test-run")
        self.assertEqual((self.folder / "provider-output.jsonl").read_bytes(), data)
        self.assertEqual(result["artifactSha256"], operations.sha(data))
        self.assertEqual(result["mappingStatus"], "inspection_required")

    def test_preparation_cannot_erase_gold_or_submission_history(self):
        human = self.folder / "human-review.csv"
        human.write_text(human.read_text().replace("unreviewed", "verified", 1), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "gold"):
            pipeline.prepare(pipeline.ROOT / "data/raw/customer_feedback.csv", self.folder, 25)
        self.upload()
        with self.assertRaisesRegex(ValueError, "audit trail"):
            pipeline.prepare(pipeline.ROOT / "data/raw/customer_feedback.csv", self.folder, 25)
