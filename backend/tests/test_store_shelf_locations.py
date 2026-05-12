import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.seed_data import STORE_RACK_TEMPLATE
from app.core.state import InMemoryState


class StoreShelfLocationStateTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()

    def tearDown(self):
        settings.state_file = self.original_state_file
        self.temp_dir.cleanup()

    def test_initialize_store_locations_creates_category_shelves_and_single_backroom(self):
        rows = self.state.initialize_store_racks(
            "UTAWALA",
            STORE_RACK_TEMPLATE,
            initialized_by="store_manager_1",
        )

        backrooms = [row for row in rows if row["location_type"] == "BACKROOM"]
        shelves = [row for row in rows if row["location_type"] == "SHELF"]

        self.assertEqual(len(backrooms), 1)
        self.assertEqual(backrooms[0]["location_code"], "UT-BACKROOM")
        self.assertEqual(backrooms[0]["location_name"], "后仓")
        self.assertEqual(backrooms[0]["category_name"], "")
        self.assertTrue(backrooms[0]["active"])
        self.assertGreaterEqual(len(shelves), len(STORE_RACK_TEMPLATE))
        self.assertTrue(any(row["category_name"] == "cargo pant" for row in shelves))
        self.assertTrue(any(row["location_name"] == "cargo pant货架" for row in shelves))
        self.assertTrue(all("item_count" in row for row in rows))
        self.assertTrue(all("layout_json" in row for row in rows))
        self.assertTrue(all(isinstance(row.get("layout_json"), dict) for row in rows))
        self.assertTrue(all("x" in row["layout_json"] for row in rows))
        self.assertTrue(all("y" in row["layout_json"] for row in rows))

    def test_upsert_store_location_edits_name_category_status_and_sort_order(self):
        self.state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")

        updated = self.state.upsert_store_location(
            "UTAWALA",
            {
                "location_code": "PT-CR",
                "location_name": "CARGO PANT 主货架",
                "location_type": "SHELF",
                "category_name": "CARGO PANT",
                "active": False,
                "sort_order": 7,
                "updated_by": "store_manager_1",
            },
        )

        self.assertEqual(updated["location_code"], "PT-CR")
        self.assertEqual(updated["rack_code"], "PT-CR")
        self.assertEqual(updated["location_name"], "CARGO PANT 主货架")
        self.assertEqual(updated["category_name"], "CARGO PANT")
        self.assertEqual(updated["category_hint"], "CARGO PANT")
        self.assertEqual(updated["status"], "inactive")
        self.assertFalse(updated["active"])
        self.assertEqual(updated["sort_order"], 7)

    def test_upsert_store_location_saves_floor_plan_layout(self):
        self.state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")

        updated = self.state.upsert_store_location(
            "UTAWALA",
            {
                "location_code": "PT-CR",
                "location_name": "CARGO PANT 主货架",
                "location_type": "SHELF",
                "category_name": "CARGO PANT",
                "layout_x": 320,
                "layout_y": 180,
                "layout_width": 180,
                "layout_height": 64,
                "layout_json": {
                    "x": 320,
                    "y": 180,
                    "width": 180,
                    "height": 64,
                    "rotation": 0,
                    "shape": "rect",
                    "color": "blue",
                    "zone": "floor",
                    "z_index": 3,
                },
                "updated_by": "store_manager_1",
            },
        )

        self.assertEqual(updated["layout_x"], 320)
        self.assertEqual(updated["layout_y"], 180)
        self.assertEqual(updated["layout_width"], 180)
        self.assertEqual(updated["layout_height"], 64)
        self.assertEqual(updated["layout_json"]["shape"], "rect")
        self.assertEqual(updated["layout_json"]["zone"], "floor")

        rows = self.state.list_store_racks("UTAWALA")
        saved = next(row for row in rows if row["location_code"] == "PT-CR")
        self.assertEqual(saved["layout_json"]["x"], 320)
        self.assertEqual(saved["layout_json"]["width"], 180)

    def test_backroom_is_single_default_location_per_store(self):
        self.state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")

        with self.assertRaises(HTTPException) as second_backroom:
            self.state.upsert_store_location(
                "UTAWALA",
                {
                    "location_code": "UT-BACKROOM-02",
                    "location_name": "后仓二",
                    "location_type": "BACKROOM",
                    "active": True,
                    "updated_by": "store_manager_1",
                },
            )
        self.assertEqual(second_backroom.exception.status_code, 400)
        self.assertIn("only one backroom", second_backroom.exception.detail)

        with self.assertRaises(HTTPException) as converted_shelf:
            self.state.upsert_store_location(
                "UTAWALA",
                {
                    "location_code": "PT-CR",
                    "location_name": "错误后仓",
                    "location_type": "BACKROOM",
                    "active": True,
                    "updated_by": "store_manager_1",
                },
            )
        self.assertEqual(converted_shelf.exception.status_code, 400)

        updated_default = self.state.upsert_store_location(
            "UTAWALA",
            {
                "location_code": "UT-BACKROOM",
                "location_name": "门店后仓",
                "location_type": "BACKROOM",
                "active": True,
                "sort_order": 99,
                "updated_by": "store_manager_1",
            },
        )
        self.assertEqual(updated_default["location_code"], "UT-BACKROOM")
        self.assertEqual(updated_default["location_type"], "BACKROOM")
        self.assertEqual(updated_default["location_name"], "门店后仓")

        rows = self.state.list_store_racks("UTAWALA")
        active_backrooms = [
            row for row in rows
            if row["location_type"] == "BACKROOM" and row["active"]
        ]
        self.assertEqual([row["location_code"] for row in active_backrooms], ["UT-BACKROOM"])
