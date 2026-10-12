import importlib.util
import csv
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

spec=importlib.util.spec_from_file_location("pipeline",Path(__file__).with_name("pipeline.py"))
pipeline=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)

class OfflinePipelineTests(unittest.TestCase):
    def test_no_network_without_opt_in(self):
        with self.assertRaisesRegex(ValueError,"allow-network"):
            pipeline.estimate(Path("unused"),"dataset-test",False)

    def test_paid_command_is_disabled(self):
        with patch("sys.argv",["pipeline.py","execute"]):
            with self.assertRaisesRegex(ValueError,"disabled"):
                pipeline.main()

    def test_normalization_keeps_negations(self):
        self.assertEqual(pipeline.normalize("  STRASSE\n "),pipeline.normalize("Straße"))
        self.assertNotEqual(pipeline.normalize("not a victim of fraud"),pipeline.normalize("a victim of fraud"))

    @unittest.skipUnless((pipeline.ROOT/"data/raw/customer_feedback.csv").exists(),"Original CSV not supplied")
    def test_original_pilot_reproducibility_and_blank_human_labels(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)
            pipeline.prepare(pipeline.ROOT/"data/raw/customer_feedback.csv",path,25)
            first=(path/"pilot.csv").read_bytes()
            manifest=json.loads((path/"manifest.json").read_text(encoding="utf-8"))
            pipeline.prepare(pipeline.ROOT/"data/raw/customer_feedback.csv",path,25)
            self.assertEqual(first,(path/"pilot.csv").read_bytes())
            self.assertEqual(manifest["distinctPatterns"],320)
            self.assertEqual(manifest["pilotRows"],25)
            self.assertIsNone(manifest["runId"])
            self.assertIsNone(manifest["actualCredits"])
            with (path/"pilot.csv").open(encoding="utf-8",newline="") as handle:
                pilot=list(csv.DictReader(handle))
            self.assertEqual(len(pilot),25)
            self.assertEqual(set(pilot[0]),{"prompt","review","original_category","normalized_hash","occurrence_count"})
            self.assertEqual(len({row["normalized_hash"] for row in pilot}),25)
            source={p["normalized_hash"]:p for p in manifest["patterns"]}
            for row in pilot:
                original=source[row["normalized_hash"]]
                self.assertEqual(row["review"],original["review"])
                self.assertEqual(int(row["occurrence_count"]),original["occurrence_count"])
                self.assertEqual(json.loads(row["original_category"]),original["category_counts"])
                self.assertIn("confidence must be null",row["prompt"])
            self.assertTrue(any("not a victim of fraud" in row["review"].casefold() for row in pilot))
            with (path/"human-review.csv").open(encoding="utf-8",newline="") as handle:
                human=list(csv.DictReader(handle))
            self.assertEqual(len(human),25)
            self.assertTrue(all(row["review_status"]=="unreviewed" and not row["gold_sentiment"] and not row["gold_issue_types"] and not row["gold_severity"] for row in human))

if __name__=="__main__":
    unittest.main()
