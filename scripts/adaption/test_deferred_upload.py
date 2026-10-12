"""Explicit provider/storage doubles; no SDK import, source data or network IO."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import operations

class DeferredUploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        (self.folder / 'pilot.csv').write_bytes(b'review,normalized_hash\ntest-only,test-hash\n')
        (self.folder / 'manifest.json').write_text('{}')
        self.manifest = {'profile': 'phase6b-v1', 'sourceKind': 'synthetic_original', 'pilotRows': 25,
                         'pilotSha256': operations.sha((self.folder / 'pilot.csv').read_bytes()),
                         'configSha256': 'test-config', 'sourceSha256': 'test-source'}
        self.client = Mock()
        self.client.datasets.create.return_value = SimpleNamespace(dataset_id='test-dataset', status='pending',
            upload_instructions=SimpleNamespace(method='PUT', url='https://test.s3.amazonaws.com/test?signature=test-only'))
        self.client.datasets.upload.complete_by_id.return_value = SimpleNamespace(dataset_id='test-dataset', status='awaiting_preprocessing')
        self.client_patch = patch.object(operations, 'make_client', return_value=self.client)
        self.factory = self.client_patch.start()
        self.load_patch = patch.object(operations, 'load_pilot', return_value=(self.manifest, {}))
        self.load_patch.start()
        self.transfer_patch = patch('review.transfer_gate')
        self.transfer = self.transfer_patch.start()
        self.storage_patch = patch.object(operations, 'put_source', return_value={'httpStatus': 200})
        self.storage = self.storage_patch.start()

    def tearDown(self):
        for patcher in (self.storage_patch, self.transfer_patch, self.load_patch, self.client_patch):
            patcher.stop()
        self.temp.cleanup()

    def upload(self):
        return operations.upload(self.folder, True, self.manifest['pilotSha256'], defer_adaption=True)

    def test_deferred_upload_records_stages_without_signed_url_or_launch(self):
        result = self.upload()
        self.assertTrue(result['deferAdaption'])
        self.client.datasets.create.assert_called_once_with(source={'file_format': 'csv',
            'name': 'InsightFlow synthetic_original reviewed 25-pattern pilot', 'processing_mode': 'adapt'}, defer_adaption=True)
        self.client.datasets.upload_file.assert_not_called()
        self.client.datasets.adapt.assert_not_called()
        self.client.datasets.upload.complete_by_id.assert_called_once_with('test-dataset',
            file_size_bytes=(self.folder / 'pilot.csv').stat().st_size, sha256=self.manifest['pilotSha256'])
        for path in self.folder.glob('*.json'):
            self.assertNotIn('signature=', path.read_text())
        with self.assertRaisesRegex(ValueError, 'already attempted'):
            self.upload()
        self.assertEqual(self.client.datasets.create.call_count, 1)

    def test_timeout_after_create_preserves_id_and_blocks_duplicate_submission(self):
        self.storage.side_effect = TimeoutError('test-only signed URL detail')
        with self.assertRaisesRegex(RuntimeError, 'reconcile'):
            self.upload()
        self.assertEqual(operations.read(self.folder / 'upload-create.json')['datasetId'], 'test-dataset')
        self.assertEqual(operations.read(self.folder / 'upload-bytes.attempt.json')['status'], 'unknown_requires_reconciliation')
        self.client.datasets.upload.complete_by_id.assert_not_called()
        with self.assertRaisesRegex(ValueError, 'already attempted'):
            self.upload()
        self.assertEqual(self.client.datasets.create.call_count, 1)

    def test_missing_upload_instructions_retains_created_dataset_id(self):
        self.client.datasets.create.return_value.upload_instructions = None
        with self.assertRaisesRegex(RuntimeError, 'reconcile'):
            self.upload()
        self.assertEqual(operations.read(self.folder / 'upload-create.json')['datasetId'], 'test-dataset')
        self.storage.assert_not_called()
        self.client.datasets.upload.complete_by_id.assert_not_called()

    def test_defer_flag_cannot_be_silently_omitted(self):
        with self.assertRaisesRegex(ValueError, 'defer-adaption'):
            operations.upload(self.folder, True, self.manifest['pilotSha256'])
        self.factory.assert_not_called()

    def test_existing_stage_attempt_and_official_source_fail_before_client(self):
        operations.reserve(self.folder, 'upload-create', 'test')
        with self.assertRaisesRegex(ValueError, 'already attempted'):
            self.upload()
        self.factory.assert_not_called()
        self.manifest['sourceKind'] = 'official_csv'
        with self.assertRaisesRegex(ValueError, 'synthetic'):
            self.upload()
        self.factory.assert_not_called()

    def test_transfer_failure_and_changed_bytes_cannot_reach_storage(self):
        self.transfer.side_effect = ValueError('Transfer not approved')
        with self.assertRaisesRegex(ValueError, 'Transfer'):
            self.upload()
        self.factory.assert_not_called()
        self.transfer.side_effect = None
        (self.folder / 'pilot.csv').write_bytes(b'changed-test-only')
        with self.assertRaisesRegex(RuntimeError, 'reconcile'):
            self.upload()
        self.client.datasets.create.assert_not_called()
        self.storage.assert_not_called()

    def test_untrusted_storage_destination_fails_without_transport(self):
        for url in ('http://test.s3.amazonaws.com/key', 'https://evil.example/key',
                    'https://test.s3.amazonaws.com.evil.example/key', 'https://user:pass@test.s3.amazonaws.com/key'):
            with self.assertRaisesRegex(ValueError, 'storage'):
                self.storage_patch.stop()
                try:
                    operations.put_source(url, b'test-only')
                finally:
                    self.storage_patch.start()
