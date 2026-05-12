import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes as routes_module
from app.core.config import settings
from app.core.seed_data import STORE_RACK_TEMPLATE
from app.core.state import InMemoryState
from app.schemas.store_racks import StoreItemStockInConfirmRequest


def _store_item(
    *,
    store_code="UTAWALA",
    store_item_id="STOREITEM-301-001",
    machine_code="5260511003011",
    category_short="CARGO PANT",
    status="active",
    sale_status="ready_for_sale",
    entity_type="STORE_ITEM",
    stock_in_confirmed=None,
    stock_in_confirmed_at="",
    stock_in_confirmed_by="",
    current_location_code="",
):
    row = {
        "store_item_id": store_item_id,
        "item_id": store_item_id,
        "display_code": store_item_id,
        "machine_code": machine_code,
        "barcode_value": machine_code,
        "entity_type": entity_type,
        "store_code": store_code,
        "category_short": category_short,
        "category_name": category_short,
        "category_sub": category_short,
        "grade": "P",
        "pricing_type": "P",
        "sale_price_kes": 410,
        "current_location_code": current_location_code,
        "store_rack_code": current_location_code,
        "rack_code": current_location_code,
        "source_sdp_display_code": "SDP261290018",
        "parent_sdo_display_code": "SDO261290001",
        "print_status": "printed",
        "printed_by": "Austin",
        "status": status,
        "sale_status": sale_status,
        "created_at": "2026-05-11T08:00:00+03:00",
        "updated_at": "2026-05-11T08:00:00+03:00",
    }
    if stock_in_confirmed is not None:
        row["stock_in_confirmed"] = stock_in_confirmed
    if stock_in_confirmed_at:
        row["stock_in_confirmed_at"] = stock_in_confirmed_at
    if stock_in_confirmed_by:
        row["stock_in_confirmed_by"] = stock_in_confirmed_by
    return row


class StoreItemStockInConfirmationTest(unittest.TestCase):
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
        self.token = self.state.authenticate_user("store_clerk_1", "demo1234")["access_token"]

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
            status=row.get("status", "active"),
            pos_allowed=True,
            allowed_contexts=["pos", "store_item_label", "inventory_lookup"],
        )

    def _confirm(self, machine_code="5260511003011", location_code="PT-CR", confirmed_by="Austin"):
        payload = StoreItemStockInConfirmRequest(location_code=location_code, confirmed_by=confirmed_by)
        return routes_module.confirm_store_item_stock_in(
            "UTAWALA",
            machine_code,
            payload,
            authorization=f"Bearer {self.token}",
        )

    def test_confirm_valid_store_item_to_shelf_updates_item_and_token(self):
        self._add_item(_store_item())

        result = self._confirm()

        self.assertEqual(result.status, "confirmed")
        self.assertEqual(result.current_location_code, "PT-CR")
        self.assertTrue(result.stock_in_confirmed)
        self.assertEqual(result.stock_in_confirmed_by, "store_clerk_1")
        item = self.state.store_items["STOREITEM-301-001"]
        token = self.state.item_barcode_tokens["STOREITEM-301-001"]
        self.assertEqual(item["current_location_code"], "PT-CR")
        self.assertTrue(item["stock_in_confirmed"])
        self.assertEqual(token["current_location_code"], "PT-CR")
        self.assertTrue(token["stock_in_confirmed"])

    def test_confirm_valid_store_item_to_backroom(self):
        self._add_item(_store_item())

        result = self._confirm(location_code="UT-BACKROOM")

        self.assertEqual(result.status, "confirmed")
        self.assertEqual(result.current_location_code, "UT-BACKROOM")

    def test_reject_missing_inactive_and_other_store_locations(self):
        self._add_item(_store_item())

        with self.assertRaises(HTTPException) as missing:
            self._confirm(location_code="NO-SUCH-RACK")
        self.assertEqual(missing.exception.status_code, 404)

        with self.assertRaises(HTTPException) as inactive:
            self._confirm(location_code="PT-INACTIVE")
        self.assertEqual(inactive.exception.status_code, 409)

        with self.assertRaises(HTTPException) as other_store:
            self._confirm(location_code="KN-BACKROOM")
        self.assertEqual(other_store.exception.status_code, 404)

    def test_reject_non_store_item_machine_codes(self):
        self._add_item(_store_item(entity_type="SDP", machine_code="3260511003011"))

        with self.assertRaises(HTTPException) as ctx:
            self._confirm(machine_code="3260511003011")

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("STORE_ITEM", str(ctx.exception.detail))

    def test_reject_sold_void_cancelled_or_deleted_items(self):
        blocked_cases = [
            ("sold", "active", "5260511004011"),
            ("void", "ready_for_sale", "5260511004012"),
            ("cancelled", "ready_for_sale", "5260511004013"),
            ("deleted", "ready_for_sale", "5260511004014"),
        ]
        for status, sale_status, machine_code in blocked_cases:
            self._add_item(
                _store_item(
                    store_item_id=f"STOREITEM-{machine_code}",
                    machine_code=machine_code,
                    status=status,
                    sale_status=sale_status,
                )
            )
            with self.subTest(status=status, sale_status=sale_status):
                with self.assertRaises(HTTPException) as ctx:
                    self._confirm(machine_code=machine_code)
                self.assertEqual(ctx.exception.status_code, 409)

    def test_repeated_confirmation_same_location_is_idempotent_without_changing_audit(self):
        confirmed_at = "2026-05-11T08:30:00+03:00"
        self._add_item(
            _store_item(
                stock_in_confirmed=True,
                stock_in_confirmed_at=confirmed_at,
                stock_in_confirmed_by="store_clerk_1",
                current_location_code="PT-CR",
            )
        )

        already = self._confirm(location_code="PT-CR")
        overview = self.state.get_store_inventory_overview("UTAWALA")

        self.assertEqual(already.status, "already_confirmed")
        self.assertEqual(already.current_location_code, "PT-CR")
        self.assertEqual(already.stock_in_confirmed_at, confirmed_at)
        self.assertEqual(already.stock_in_confirmed_by, "store_clerk_1")
        self.assertEqual(overview["total_items"], 1)
        self.assertEqual(overview["backroom_items"], 0)
        self.assertEqual(overview["shelf_items"], 1)

    def test_repeated_confirmation_different_location_returns_conflict(self):
        self._add_item(_store_item(stock_in_confirmed=True, current_location_code="PT-CR"))

        with self.assertRaises(HTTPException) as ctx:
            self._confirm(location_code="UT-BACKROOM")

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("already confirmed", str(ctx.exception.detail).lower())
        item = self.state.store_items["STOREITEM-301-001"]
        token = self.state.item_barcode_tokens["STOREITEM-301-001"]
        self.assertEqual(item["current_location_code"], "PT-CR")
        self.assertEqual(token["current_location_code"], "PT-CR")
        overview = self.state.get_store_inventory_overview("UTAWALA")
        self.assertEqual(overview["total_items"], 1)
        self.assertEqual(overview["shelf_items"], 1)
        self.assertEqual(overview["backroom_items"], 0)

    def test_sold_confirmed_store_item_cannot_be_confirmed_back_into_stock(self):
        self._add_item(
            _store_item(
                stock_in_confirmed=True,
                current_location_code="PT-CR",
                status="sold",
                sale_status="sold",
            )
        )

        with self.assertRaises(HTTPException) as ctx:
            self._confirm(location_code="PT-CR")

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("sold", str(ctx.exception.detail).lower())

    def test_confirmed_store_item_enters_inventory_and_leaves_unconfirmed_count(self):
        self._add_item(_store_item(stock_in_confirmed=False))
        self._add_item(_store_item(store_item_id="STOREITEM-LEGACY", machine_code="5260511003029"))
        before = self.state.get_store_inventory_overview("UTAWALA")

        result = self._confirm()
        after = self.state.get_store_inventory_overview("UTAWALA")

        self.assertEqual(before["total_items"], 0)
        self.assertEqual(before["unconfirmed_items"], 2)
        self.assertEqual(result.status, "confirmed")
        self.assertEqual(after["total_items"], 1)
        self.assertEqual(after["shelf_items"], 1)
        self.assertEqual(after["unconfirmed_items"], 1)
