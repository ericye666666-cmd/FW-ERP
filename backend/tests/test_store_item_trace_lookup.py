import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes as routes_module
from app.core.config import settings
from app.core.seed_data import STORE_RACK_TEMPLATE
from app.core.state import InMemoryState


def _store_item(
    *,
    store_code="UTAWALA",
    store_item_id="STOREITEM-TRACE-001",
    machine_code="5260511003081",
    category_short="CARGO PANT",
    current_location_code="PT-CR",
    entity_type="STORE_ITEM",
    status="active",
    sale_status="ready_for_sale",
    stock_in_confirmed=None,
):
    row = {
        "store_item_id": store_item_id,
        "item_id": store_item_id,
        "display_code": store_item_id,
        "machine_code": machine_code,
        "barcode_value": machine_code,
        "entity_type": entity_type,
        "store_code": store_code,
        "category_name": category_short,
        "category_short": category_short,
        "category_sub": category_short,
        "grade": "P",
        "pricing_type": "P",
        "sale_price_kes": 410,
        "current_location_code": current_location_code,
        "store_rack_code": current_location_code,
        "rack_code": current_location_code,
        "source_sdp_display_code": "SDP261290018",
        "parent_sdo_display_code": "SDO261290001",
        "printed_by": "Austin",
        "printed_at": "2026-05-11T08:00:00+03:00",
        "stock_in_confirmed_by": "store_clerk_1",
        "stock_in_confirmed_at": "2026-05-11T08:20:00+03:00",
        "status": status,
        "sale_status": sale_status,
        "created_at": "2026-05-11T08:00:00+03:00",
        "updated_at": "2026-05-11T08:20:00+03:00",
    }
    if stock_in_confirmed is not None:
        row["stock_in_confirmed"] = stock_in_confirmed
    return row


class StoreItemTraceLookupTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()
        self.original_routes_state = routes_module.state
        routes_module.state = self.state
        self.state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")
        self.state.initialize_store_racks("KINNO", STORE_RACK_TEMPLATE, initialized_by="area_supervisor_1")
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
        self.state.upsert_store_location(
            "UTAWALA",
            {
                "location_code": "PT-INACTIVE",
                "location_name": "停用货架",
                "location_type": "SHELF",
                "category_name": "CARGO PANT",
                "active": False,
                "updated_by": "store_manager_1",
            },
        )
        self.token = self.state.authenticate_user("store_manager_1", "demo1234")["access_token"]

    def tearDown(self):
        routes_module.state = self.original_routes_state
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
            pos_allowed=True,
            allowed_contexts=["pos", "store_item_label", "inventory_lookup"],
        )

    def _trace(self, machine_code, store_code="UTAWALA"):
        return routes_module.get_store_item_trace(
            store_code,
            machine_code,
            authorization=f"Bearer {self.token}",
        )

    def test_trace_in_stock_shelf_and_backroom(self):
        self._add_item(_store_item(stock_in_confirmed=True, current_location_code="PT-CR"))
        self._add_item(_store_item(
            store_item_id="STOREITEM-TRACE-BACKROOM",
            machine_code="5260511003082",
            stock_in_confirmed=True,
            current_location_code="UT-BACKROOM",
        ))

        shelf_trace = self._trace("5260511003081")
        backroom_trace = self._trace("5260511003082")

        self.assertEqual(shelf_trace["trace_status"], "in_stock")
        self.assertEqual(shelf_trace["status_label"], "在库")
        self.assertEqual(shelf_trace["current_location_name"], "CARGO PANT 主货架")
        self.assertEqual(shelf_trace["location_type"], "SHELF")
        self.assertEqual(shelf_trace["source_sdp_display_code"], "SDP261290018")
        self.assertEqual(shelf_trace["parent_sdo_display_code"], "SDO261290001")
        self.assertEqual(backroom_trace["trace_status"], "in_stock")
        self.assertEqual(backroom_trace["current_location_code"], "UT-BACKROOM")
        self.assertEqual(backroom_trace["location_type"], "BACKROOM")

    def test_trace_pending_stock_in_false_or_missing(self):
        self._add_item(_store_item(stock_in_confirmed=False, current_location_code="PT-CR"))
        self._add_item(_store_item(
            store_item_id="STOREITEM-TRACE-PENDING-LEGACY",
            machine_code="5260511003083",
            current_location_code="PT-CR",
        ))

        self.assertEqual(self._trace("5260511003081")["trace_status"], "pending_stock_in")
        self.assertEqual(self._trace("5260511003083")["trace_status"], "pending_stock_in")

    def test_trace_unassigned_location_for_empty_inactive_or_missing_location(self):
        self._add_item(_store_item(stock_in_confirmed=True, current_location_code=""))
        self._add_item(_store_item(
            store_item_id="STOREITEM-TRACE-INACTIVE",
            machine_code="5260511003084",
            stock_in_confirmed=True,
            current_location_code="PT-INACTIVE",
        ))
        self._add_item(_store_item(
            store_item_id="STOREITEM-TRACE-MISSING-LOCATION",
            machine_code="5260511003085",
            stock_in_confirmed=True,
            current_location_code="PT-NO-SUCH",
        ))

        self.assertEqual(self._trace("5260511003081")["trace_status"], "unassigned_location")
        self.assertEqual(self._trace("5260511003084")["trace_status"], "unassigned_location")
        self.assertEqual(self._trace("5260511003085")["trace_status"], "unassigned_location")

    def test_trace_sold_store_item_includes_sale_fields(self):
        self._add_item(dict(
            _store_item(stock_in_confirmed=True, current_location_code="PT-CR", status="sold", sale_status="sold"),
            sold=True,
            sold_at="2026-05-11T09:10:00+03:00",
            sold_by="cashier_1",
            sale_no="SALE-UT-260511-0001",
            sale_id="SALE-UT-260511-0001",
        ))

        trace = self._trace("5260511003081")

        self.assertEqual(trace["trace_status"], "sold")
        self.assertEqual(trace["status_label"], "已售")
        self.assertTrue(trace["sold"])
        self.assertEqual(trace["sale_no"], "SALE-UT-260511-0001")
        self.assertEqual(trace["sold_by"], "cashier_1")

    def test_trace_rejects_other_store_and_non_store_item_codes(self):
        self._add_item(_store_item(store_code="KINNO", stock_in_confirmed=True))

        other_store = self._trace("5260511003081")
        self.assertEqual(other_store["trace_status"], "invalid")
        self.assertIn("其他门店", other_store["message"])

        for entity_type, machine_code in [
            ("RAW_BALE", "1260511003081"),
            ("SDB", "2260511003081"),
            ("SDP", "3260511003081"),
            ("LPK", "4260511003081"),
            ("SDO", "6260511003081"),
        ]:
            self._add_item(_store_item(
                store_item_id=f"{entity_type}-TRACE",
                machine_code=machine_code,
                entity_type=entity_type,
            ))
            with self.subTest(entity_type=entity_type):
                trace = self._trace(machine_code)
                self.assertEqual(trace["trace_status"], "invalid")
                self.assertEqual(trace["status_label"], "不是门店商品码")

    def test_trace_unknown_code(self):
        trace = self._trace("5260511999999")

        self.assertEqual(trace["trace_status"], "unknown")
        self.assertEqual(trace["status_label"], "未找到")
