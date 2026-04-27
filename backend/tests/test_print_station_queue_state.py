import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.state import InMemoryState


class PrintStationQueueStateTest(unittest.TestCase):
    def test_bale_label_print_station_job_lifecycle(self):
        with TemporaryDirectory() as temp_dir:
            previous_state_file = settings.state_file
            try:
                settings.state_file = Path(temp_dir) / "runtime_state.json"
                state = InMemoryState()
                created = state.create_bale_label_print_station_job(
                    {
                        "code": "RB260427000001",
                        "supplier": "Youxun Demo",
                        "category": "dress",
                        "subcategory": "short dress",
                        "batch": "BL-001",
                        "ship_reference": "SHIP-2026-04-27",
                        "total_number": 5,
                        "sequence_number": 2,
                        "requested_by": "warehouse_clerk_1",
                    }
                )
                self.assertEqual(created["status"], "pending")
                self.assertEqual(created["label_type"], "BALE_LABEL")
                self.assertEqual(created["code"], "RB260427000001")

                pending = state.list_pending_print_station_jobs(station_id="WS-01")
                self.assertEqual(len(pending), 1)
                self.assertEqual(pending[0]["id"], created["id"])

                claimed = state.claim_print_station_job(created["id"], station_id="WS-01")
                self.assertEqual(claimed["status"], "claimed")
                self.assertEqual(claimed["station_id"], "WS-01")
                self.assertIsNotNone(claimed["claimed_at"])

                completed = state.complete_print_station_job(created["id"], station_id="WS-01")
                self.assertEqual(completed["status"], "printed")
                self.assertEqual(completed["station_id"], "WS-01")
                self.assertIsNotNone(completed["printed_at"])
            finally:
                settings.state_file = previous_state_file

    def test_bale_label_print_station_job_can_fail_with_error_message(self):
        with TemporaryDirectory() as temp_dir:
            previous_state_file = settings.state_file
            try:
                settings.state_file = Path(temp_dir) / "runtime_state.json"
                state = InMemoryState()
                created = state.create_bale_label_print_station_job(
                    {
                        "code": "RB260427000099",
                        "requested_by": "warehouse_clerk_1",
                    }
                )
                failed = state.fail_print_station_job(
                    created["id"],
                    station_id="WS-ERR",
                    error_message="printer offline",
                )
                self.assertEqual(failed["status"], "failed")
                self.assertEqual(failed["station_id"], "WS-ERR")
                self.assertEqual(failed["error_message"], "printer offline")
            finally:
                settings.state_file = previous_state_file


if __name__ == "__main__":
    unittest.main()
