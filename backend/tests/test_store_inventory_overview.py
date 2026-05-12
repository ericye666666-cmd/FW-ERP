import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes as routes_module
from app.core.config import settings
from app.core.seed_data import STORE_RACK_TEMPLATE
from app.core.state import InMemoryState, NAIROBI_TZ


def _store_item(
    *,
    store_code="UTAWALA",
    store_item_id="STOREITEM-001",
    machine_code="5260511000011",
    category_short="CARGO PANT",
    location_code="PT-CR",
    status="active",
    created_at="2026-05-11T08:00:00+03:00",
    stock_in_confirmed=None,
):
    row = {
        "store_item_id": store_item_id,
        "item_id": store_item_id,
        "display_code": store_item_id,
        "machine_code": machine_code,
        "barcode_value": machine_code,
        "entity_type": "STORE_ITEM",
        "store_code": store_code,
        "category_short": category_short,
        "category_name": category_short,
        "category_sub": category_short,
        "grade": "P",
        "pricing_type": "P",
        "sale_price_kes": 410,
        "current_location_code": location_code,
        "store_rack_code": location_code,
        "rack_code": location_code,
        "source_sdp_display_code": "SDP261290018",
        "parent_sdo_display_code": "SDO261290001",
        "print_status": "printed",
        "printed_by": "Austin",
        "stock_in_confirmed_by": "Austin",
        "status": status,
        "sale_status": "ready_for_sale",
        "created_at": created_at,
        "updated_at": created_at,
    }
    if stock_in_confirmed is not None:
        row["stock_in_confirmed"] = stock_in_confirmed
    return row


class StoreInventoryOverviewStateTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()
        self.state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")
        self.state.upsert_store_location(
            "UTAWALA",
            {
                "location_code": "PT-CR",
                "location_name": "CARGO PANT 主货架",
                "location_type": "SHELF",
                "category_name": "CARGO PANT",
                "active": True,
                "updated_by": "store_manager_1",
            },
        )

    def tearDown(self):
        settings.state_file = self.original_state_file
        self.temp_dir.cleanup()

    def _add_item(self, row):
        token_id = row["display_code"]
        self.state.store_items[row["store_item_id"]] = dict(row, token_id=token_id, token_no=token_id)
        self.state.item_barcode_tokens[token_id] = dict(
            row,
            token_id=token_id,
            token_no=token_id,
            entity_id=row["store_item_id"],
            store_item_id=row["store_item_id"],
            status=row.get("status", "active"),
            pos_allowed=True,
            allowed_contexts=["pos", "store_item_label", "inventory_lookup"],
        )

    def test_inventory_overview_counts_category_location_backroom_and_unassigned_items(self):
        today = datetime.now(NAIROBI_TZ).replace(hour=8, minute=0, second=0, microsecond=0).isoformat()
        self._add_item(_store_item(store_item_id="STOREITEM-SHELF", machine_code="5260511000011", location_code="PT-CR", created_at=today, stock_in_confirmed=True))
        self._add_item(_store_item(store_item_id="STOREITEM-BACK", machine_code="5260511000029", location_code="UT-BACKROOM", created_at=today, stock_in_confirmed=True))
        self._add_item(_store_item(store_item_id="STOREITEM-UNASSIGNED", machine_code="5260511000037", location_code="", created_at=today, stock_in_confirmed=True))
        self._add_item(_store_item(store_item_id="STOREITEM-SOLD", machine_code="5260511000045", location_code="PT-CR", status="sold"))
        self._add_item(_store_item(store_code="KINNO", store_item_id="STOREITEM-KINNO", machine_code="5260511000052", location_code="PT-CR"))
        self._add_item(_store_item(store_item_id="STOREITEM-PENDING", machine_code="5260511000060", location_code="PT-CR", stock_in_confirmed=False))
        self._add_item(_store_item(store_item_id="STOREITEM-PENDING-PRINT", machine_code="5260511000086", location_code="PT-CR", status="pending_print", stock_in_confirmed=False))
        self._add_item(_store_item(store_item_id="STOREITEM-LEGACY", machine_code="5260511000078", location_code="PT-CR"))

        overview = self.state.get_store_inventory_overview("UTAWALA")

        self.assertEqual(overview["store_code"], "UTAWALA")
        self.assertEqual(overview["total_items"], 3)
        self.assertEqual(overview["shelf_items"], 1)
        self.assertEqual(overview["backroom_items"], 1)
        self.assertEqual(overview["unassigned_location_items"], 1)
        self.assertEqual(overview["today_new_items"], 3)
        self.assertEqual(overview["unconfirmed_items"], 3)
        self.assertEqual(overview["stock_in_confirmed_filter"], "required_true")

        category = next(row for row in overview["by_category"] if row["category_name"] == "CARGO PANT")
        self.assertEqual(category["total_items"], 3)
        self.assertEqual(category["shelf_items"], 1)
        self.assertEqual(category["backroom_items"], 1)
        self.assertEqual(category["unassigned_location_items"], 1)

        location_counts = {row["location_code"]: row["item_count"] for row in overview["by_location"]}
        self.assertEqual(location_counts["PT-CR"], 1)
        self.assertEqual(location_counts["UT-BACKROOM"], 1)
        self.assertEqual(location_counts["UNASSIGNED"], 1)

    def test_inventory_overview_sold_today_summary_excludes_active_inventory(self):
        today = datetime.now(NAIROBI_TZ).replace(hour=11, minute=20, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)
        self._add_item(_store_item(store_item_id="STOREITEM-ACTIVE", machine_code="5260511000011", location_code="PT-CR", stock_in_confirmed=True))
        self._add_item(dict(
            _store_item(store_item_id="STOREITEM-SOLD-TODAY", machine_code="5260511000045", location_code="PT-CR", status="sold", stock_in_confirmed=True),
            sold=True,
            sold_at=today.isoformat(),
            final_price=390,
        ))
        self._add_item(dict(
            _store_item(store_item_id="STOREITEM-SOLD-BACK", machine_code="5260511000052", location_code="UT-BACKROOM", category_short="LADY TOP", status="sold", stock_in_confirmed=True),
            sold=True,
            sold_at=today.isoformat(),
            final_price=520,
        ))
        self._add_item(dict(
            _store_item(store_item_id="STOREITEM-SOLD-YESTERDAY", machine_code="5260511000060", location_code="PT-CR", status="sold", stock_in_confirmed=True),
            sold=True,
            sold_at=yesterday.isoformat(),
            final_price=410,
        ))
        self._add_item(dict(
            _store_item(store_code="KINNO", store_item_id="STOREITEM-SOLD-KINNO", machine_code="5260511000078", location_code="PT-CR", status="sold", stock_in_confirmed=True),
            sold=True,
            sold_at=today.isoformat(),
            final_price=410,
        ))

        overview = self.state.get_store_inventory_overview("UTAWALA")

        self.assertEqual(overview["total_items"], 1)
        self.assertEqual(overview["shelf_items"], 1)
        self.assertEqual(overview["sold_today_items"], 2)
        self.assertEqual(overview["sold_today_amount"], 910)
        self.assertEqual(
            {row["category_name"]: (row["sold_items"], row["sold_amount"]) for row in overview["sold_by_category"]},
            {"CARGO PANT": (1, 390), "LADY TOP": (1, 520)},
        )
        self.assertEqual(
            {row["location_code"]: (row["sold_items"], row["sold_amount"]) for row in overview["sold_by_location"]},
            {"PT-CR": (1, 390), "UT-BACKROOM": (1, 520)},
        )

    def test_inventory_overview_detail_filters_by_category_and_location(self):
        self._add_item(_store_item(store_item_id="STOREITEM-SHELF", machine_code="5260511000011", location_code="PT-CR", stock_in_confirmed=True))
        self._add_item(_store_item(store_item_id="STOREITEM-BACK", machine_code="5260511000029", location_code="UT-BACKROOM", stock_in_confirmed=True))
        self._add_item(_store_item(store_item_id="STOREITEM-LEGACY", machine_code="5260511000078", location_code="PT-CR"))

        category_items = self.state.list_store_inventory_category_items("UTAWALA", "CARGO PANT")
        location_items = self.state.list_store_inventory_location_items("UTAWALA", "PT-CR")

        self.assertEqual(len(category_items), 2)
        self.assertEqual([row["machine_code"] for row in location_items], ["5260511000011"])
        self.assertEqual(location_items[0]["current_location_code"], "PT-CR")
        self.assertEqual(location_items[0]["source_sdp_display_code"], "SDP261290018")


class StoreInventoryOverviewRoutesTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()
        self.original_routes_state = routes_module.state
        routes_module.state = self.state
        self.token = self.state.authenticate_user("store_manager_1", "demo1234")["access_token"]

    def tearDown(self):
        routes_module.state = self.original_routes_state
        settings.state_file = self.original_state_file
        self.temp_dir.cleanup()

    def test_inventory_overview_routes_require_auth_and_return_rows(self):
        self.state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")
        row = _store_item(location_code="UT-BACKROOM", stock_in_confirmed=True)
        self.state.store_items[row["store_item_id"]] = row

        overview = routes_module.get_store_inventory_overview("UTAWALA", authorization=f"Bearer {self.token}")
        self.assertEqual(overview["backroom_items"], 1)

        items = routes_module.get_store_inventory_location_items(
            "UTAWALA",
            "UT-BACKROOM",
            authorization=f"Bearer {self.token}",
        )
        self.assertEqual(items[0]["machine_code"], row["machine_code"])
