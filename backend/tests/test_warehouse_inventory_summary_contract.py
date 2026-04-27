import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.state import InMemoryState


def _warehouse_summary_endpoint_exists() -> bool:
    routes_source = (Path(__file__).resolve().parents[1] / "app" / "api" / "routes.py").read_text()
    return bool(re.search(r'@router\.get\("/warehouse/(inventory-summary|summary|inventory/summary)"', routes_source))


class WarehouseInventorySummaryContractTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()

    def tearDown(self):
        settings.state_file = self.original_state_file
        self.temp_dir.cleanup()

    def _create_ready_bales(self, customs_notice_no: str, package_count: int = 3):
        shipment = self.state.create_inbound_shipment(
            {
                "shipment_type": "sea",
                "customs_notice_no": customs_notice_no,
                "unload_date": "2026-04-21",
                "coc_goods_manifest": "warehouse inventory summary contract",
                "note": "",
                "coc_documents": [],
            }
        )
        self.state.create_parcel_batch(
            {
                "intake_type": "sea_freight",
                "inbound_shipment_no": shipment["shipment_no"],
                "supplier_name": "Youxun Demo",
                "cargo_type": "summer apparel",
                "category_main": "dress",
                "category_sub": "2 pieces",
                "package_count": package_count,
                "total_weight": package_count * 40,
                "received_by": "warehouse_clerk_1",
                "note": "for summary contract",
            }
        )
        self.state.confirm_inbound_shipment_intake(
            shipment["shipment_no"],
            {
                "declared_total_packages": package_count,
                "confirmed_by": "warehouse_supervisor_1",
                "note": "summary contract ready",
            },
        )
        bales = self.state.generate_bale_barcodes(shipment["shipment_no"], "warehouse_supervisor_1")
        return shipment, bales

    def _create_confirmed_sorting_stock(self, customs_notice_no: str = "INV-SUM-SORT", qty: int = 10):
        _, bales = self._create_ready_bales(customs_notice_no=customs_notice_no, package_count=1)
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "summary contract sorting",
                "created_by": "warehouse_supervisor_1",
            }
        )
        result = self.state.submit_sorting_task_results(
            task["task_no"],
            {
                "created_by": "warehouse_supervisor_1",
                "result_items": [
                    {
                        "category_name": "dress / 2 pieces",
                        "grade": "P",
                        "qty": qty,
                        "rack_code": "A-TS-LT-P-01",
                        "confirm_to_inventory": True,
                        "default_cost_kes": 120,
                        "estimated_unit_cost_kes": 12.0,
                    }
                ],
                "note": "summary contract results",
                "mark_task_completed": True,
            },
        )
        return task, result

    def test_raw_bale_summary_rows_are_backend_authoritative(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="INV-SUM-RAW", package_count=3)
        self.state.route_raw_bale_to_sorting(
            bales[0]["bale_barcode"],
            {
                "updated_by": "warehouse_supervisor_1",
                "note": "route to sorting",
            },
        )
        self.state.route_raw_bale_to_bale_sales_pool(
            bales[1]["bale_barcode"],
            {
                "updated_by": "warehouse_supervisor_1",
                "note": "route to sale pool",
            },
        )

        raw_rows = self.state.list_raw_bales(shipment_no=shipment["shipment_no"])
        counts_by_status = {}
        for row in raw_rows:
            counts_by_status[row["status"]] = counts_by_status.get(row["status"], 0) + 1

        self.assertEqual(len(raw_rows), 3)
        self.assertEqual(counts_by_status.get("ready_for_sorting"), 2)
        self.assertEqual(counts_by_status.get("in_bale_sales_pool"), 1)

    def test_sorting_task_management_summary_uses_backend_task_status_rows(self):
        _, bales = self._create_ready_bales(customs_notice_no="INV-SUM-TASK", package_count=2)
        open_task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "open summary row",
                "created_by": "warehouse_supervisor_1",
            }
        )
        completed_task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[1]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_2"],
                "note": "completed summary row",
                "created_by": "warehouse_supervisor_1",
            }
        )
        self.state.submit_sorting_task_results(
            completed_task["task_no"],
            {
                "created_by": "warehouse_supervisor_1",
                "result_items": [
                    {
                        "category_name": "dress / 2 pieces",
                        "grade": "P",
                        "qty": 5,
                        "rack_code": "A-TS-LT-P-01",
                        "confirm_to_inventory": True,
                        "default_cost_kes": 100,
                        "estimated_unit_cost_kes": 10.0,
                    }
                ],
                "note": "close task",
                "mark_task_completed": True,
            },
        )

        task_rows = self.state.list_sorting_tasks()
        counts_by_status = {}
        for row in task_rows:
            counts_by_status[row["status"]] = counts_by_status.get(row["status"], 0) + 1

        self.assertEqual(len(task_rows), 2)
        self.assertEqual(counts_by_status.get(open_task["status"]), 1)
        self.assertEqual(counts_by_status.get("confirmed"), 1)

    def test_sorted_stock_summary_rows_come_from_backend_sorted_stock(self):
        self._create_confirmed_sorting_stock(customs_notice_no="INV-SUM-STOCK", qty=12)

        stock_rows = self.state.list_sorting_stock()
        total_qty_on_hand = sum(int(row.get("qty_on_hand", 0) or 0) for row in stock_rows)

        self.assertEqual(len(stock_rows), 1)
        self.assertEqual(total_qty_on_hand, 12)
        self.assertIn("unit_cost_kes", stock_rows[0])

    def test_waiting_store_and_waiting_sale_bales_are_distinguishable(self):
        self._create_confirmed_sorting_stock(customs_notice_no="INV-SUM-WAIT-P", qty=200)
        self._create_confirmed_sorting_stock(customs_notice_no="INV-SUM-WAIT-S", qty=40)
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "dress",
                "category_sub": "2 pieces",
                "standard_weight_kg": 2,
            },
            updated_by="warehouse_supervisor_1",
        )
        store_task = self.state.create_store_prep_bale_task(
            {
                "task_type": "store_dispatch",
                "category_sub": "2 pieces",
                "pieces_per_bale": 100,
                "bale_count": 1,
                "assigned_employee": "warehouse_clerk_1",
                "note": "waiting store",
                "created_by": "warehouse_supervisor_1",
            }
        )
        sale_task = self.state.create_store_prep_bale_task(
            {
                "task_type": "sale",
                "category_sub": "2 pieces",
                "target_weight_kg": 20,
                "ratio_label": "A",
                "grade_ratios": [{"grade": "P", "ratio_pct": 100}],
                "assigned_employee": "warehouse_clerk_2",
                "note": "waiting sale",
                "created_by": "warehouse_supervisor_1",
            }
        )
        self.state.complete_store_prep_bale_task(
            store_task["task_no"],
            {"updated_by": "warehouse_supervisor_1", "note": "done store prep"},
        )
        self.state.complete_store_prep_bale_task(
            sale_task["task_no"],
            {"updated_by": "warehouse_supervisor_1", "actual_weight_kg": 20, "note": "done sale prep"},
        )

        waiting_store = self.state.list_store_prep_bales(status="waiting_store_dispatch")
        waiting_sale = self.state.list_store_prep_bales(status="waiting_bale_sale")

        self.assertEqual(len(waiting_store), 1)
        self.assertEqual(waiting_store[0]["task_type"], "store_dispatch")
        self.assertEqual(len(waiting_sale), 1)
        self.assertEqual(waiting_sale[0]["task_type"], "sale")

    def test_b2b_bale_sales_inventory_is_separate_from_store_pos_inventory(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="INV-SUM-B2B", package_count=1)
        self.state.route_raw_bale_to_bale_sales_pool(
            bales[0]["bale_barcode"],
            {
                "updated_by": "warehouse_supervisor_1",
                "note": "inventory for B2B",
            },
        )

        candidates = self.state.list_bale_sales_candidates(shipment_no=shipment["shipment_no"])
        store_dispatch_bales = self.state.list_store_dispatch_bales()

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["source_type"], "raw_direct_sale")
        self.assertEqual(len(store_dispatch_bales), 0)

    def test_boss_operating_dashboard_contract_requires_backend_warehouse_summary_endpoint(self):
        self.assertTrue(_warehouse_summary_endpoint_exists())

        self._create_confirmed_sorting_stock(customs_notice_no="INV-SUM-API-P", qty=200)
        self._create_confirmed_sorting_stock(customs_notice_no="INV-SUM-API-S", qty=40)
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "dress",
                "category_sub": "2 pieces",
                "standard_weight_kg": 2,
            },
            updated_by="warehouse_supervisor_1",
        )
        waiting_store_task = self.state.create_store_prep_bale_task(
            {
                "task_type": "store_dispatch",
                "category_sub": "2 pieces",
                "pieces_per_bale": 100,
                "bale_count": 1,
                "assigned_employee": "warehouse_clerk_1",
                "note": "waiting store for summary endpoint",
                "created_by": "warehouse_supervisor_1",
            }
        )
        waiting_sale_task = self.state.create_store_prep_bale_task(
            {
                "task_type": "sale",
                "category_sub": "2 pieces",
                "target_weight_kg": 20,
                "ratio_label": "A",
                "grade_ratios": [{"grade": "P", "ratio_pct": 100}],
                "assigned_employee": "warehouse_clerk_2",
                "note": "waiting sale for summary endpoint",
                "created_by": "warehouse_supervisor_1",
            }
        )
        self.state.complete_store_prep_bale_task(
            waiting_store_task["task_no"],
            {"updated_by": "warehouse_supervisor_1", "note": "store prep done"},
        )
        self.state.complete_store_prep_bale_task(
            waiting_sale_task["task_no"],
            {"updated_by": "warehouse_supervisor_1", "actual_weight_kg": 20, "note": "sale prep done"},
        )
        _, bales = self._create_ready_bales(customs_notice_no="INV-SUM-API-B2B", package_count=1)
        self.state.route_raw_bale_to_bale_sales_pool(
            bales[0]["bale_barcode"],
            {"updated_by": "warehouse_supervisor_1", "note": "b2b summary endpoint"},
        )

        payload = self.state.get_warehouse_inventory_summary()
        self.assertIn("raw_bale_status_counts", payload)
        self.assertIn("sorting_task_status_counts", payload)
        self.assertEqual(payload["waiting_store"]["bale_count"], 1)
        self.assertEqual(payload["waiting_store"]["qty"], 100)
        self.assertEqual(payload["waiting_sale"]["bale_count"], 1)
        self.assertEqual(payload["waiting_sale"]["qty"], 10)
        self.assertEqual(payload["b2b_bale_sales_candidates"]["total"], 1)
