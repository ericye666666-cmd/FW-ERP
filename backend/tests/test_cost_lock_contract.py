import sys
import tempfile
import unittest
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.state import InMemoryState


class CostLockContractTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()

    def tearDown(self):
        settings.state_file = self.original_state_file
        self.temp_dir.cleanup()

    def _create_ready_bales_with_source_cost(
        self,
        customs_notice_no: str,
        total_source_cost_kes: float = 900,
        package_count: int = 1,
        unit_weight_kg: float = 9,
        category_name: str = "tops / lady tops",
    ):
        category_main, category_sub = [part.strip() for part in category_name.split("/", 1)]
        source_pool_token = f"CN-SRC-{customs_notice_no}-01"
        source_bale_token = f"{source_pool_token}-001"

        self.state.create_or_update_china_source_record(
            {
                "source_pool_token": source_pool_token,
                "container_type": "40HQ",
                "customs_notice_no": customs_notice_no,
                "lines": [
                    {
                        "source_bale_token": source_bale_token,
                        "supplier_name": "Youxun Demo",
                        "category_main": category_main,
                        "category_sub": category_sub,
                        "package_count": package_count,
                        "unit_weight_kg": unit_weight_kg,
                        "unit_cost_amount": round(total_source_cost_kes / package_count, 2),
                        "unit_cost_currency": "KES",
                    }
                ],
            },
            created_by="warehouse_clerk_1",
        )

        shipment = self.state.create_inbound_shipment(
            {
                "shipment_type": "sea",
                "customs_notice_no": customs_notice_no,
                "unload_date": "2026-04-27",
                "coc_goods_manifest": "cost lock contract",
                "note": "",
                "coc_documents": [],
            }
        )
        self.state.create_parcel_batch(
            {
                "intake_type": "sea_freight",
                "inbound_shipment_no": shipment["shipment_no"],
                "source_bale_token": source_bale_token,
                "supplier_name": "Youxun Demo",
                "cargo_type": "summer apparel",
                "category_main": category_main,
                "category_sub": category_sub,
                "package_count": package_count,
                "total_weight": round(package_count * unit_weight_kg, 2),
                "received_by": "warehouse_clerk_1",
                "note": "cost lock contract",
            }
        )
        self.state.confirm_inbound_shipment_intake(
            shipment["shipment_no"],
            {
                "declared_total_packages": package_count,
                "confirmed_by": "warehouse_supervisor_1",
                "note": "cost lock contract",
            },
        )
        bales = self.state.generate_bale_barcodes(shipment["shipment_no"], "warehouse_supervisor_1")
        return shipment, bales

    def _create_locked_sorting_context(self, customs_notice_no: str = "RAWCOSTLOCK240427"):
        shipment, bales = self._create_ready_bales_with_source_cost(customs_notice_no=customs_notice_no)
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "contract setup",
                "created_by": "warehouse_supervisor_1",
            }
        )
        result = self.state.submit_sorting_task_results(
            task["task_no"],
            {
                "created_by": "warehouse_supervisor_1",
                "result_items": [
                    {
                        "category_name": "tops / lady tops",
                        "grade": "P",
                        "actual_weight_kg": 9,
                        "qty": 3,
                        "confirm_to_inventory": True,
                    }
                ],
                "note": "contract submit",
                "mark_task_completed": True,
                "cost_status_override": "pending_allocation",
                "estimated_unit_cost_kes": 999,
                "cost_model_code": "fake_frontend_lock",
                "source_bale_tokens": ["CLIENT-WRONG-001"],
                "source_pool_tokens": ["CLIENT-WRONG"],
            },
        )
        return shipment, task, result

    def test_sorting_confirmation_is_backend_cost_lock_checkpoint(self):
        _, bales = self._create_ready_bales_with_source_cost(customs_notice_no="RAWCOSTLOCKCHK240427")
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "checkpoint validation",
                "created_by": "warehouse_supervisor_1",
            }
        )
        self.assertIsNone(task.get("cost_locked_at"))

        result = self.state.submit_sorting_task_results(
            task["task_no"],
            {
                "created_by": "warehouse_supervisor_1",
                "result_items": [
                    {
                        "category_name": "tops / lady tops",
                        "grade": "P",
                        "actual_weight_kg": 9,
                        "qty": 3,
                        "confirm_to_inventory": True,
                    }
                ],
                "note": "checkpoint submit",
                "mark_task_completed": True,
            },
        )

        self.assertEqual(result["cost_status"], "cost_locked")
        self.assertIsNotNone(result["cost_locked_at"])
        stored_task = self.state.sorting_tasks[task["task_no"]]
        self.assertEqual(stored_task["cost_status"], "cost_locked")
        self.assertIsNotNone(stored_task["cost_locked_at"])

    def test_sorting_confirmation_with_actual_kg_does_not_require_default_category_cost(self):
        _, bales = self._create_ready_bales_with_source_cost(customs_notice_no="RAWCOSTNODEFAULT240427")
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "no default cost required when actual source allocation exists",
                "created_by": "warehouse_supervisor_1",
            }
        )

        result = self.state.submit_sorting_task_results(
            task["task_no"],
            {
                "created_by": "warehouse_supervisor_1",
                "result_items": [
                    {
                        "category_name": "tops / lady tops",
                        "grade": "P",
                        "actual_weight_kg": 9,
                        "qty": 3,
                        "rack_code": "A-TS-P-MANUAL",
                        "default_cost_kes": None,
                        "confirm_to_inventory": True,
                    }
                ],
                "note": "no default cost",
                "mark_task_completed": True,
            },
        )

        self.assertEqual(result["cost_status"], "cost_locked")
        self.assertEqual(result["cost_model_code"], "sorting_actual_weight_v3")
        self.assertEqual(result["result_items"][0]["rack_code"], "A-TS-P-MANUAL")

    def test_cost_lock_is_backend_authoritative_not_frontend_only_display_state(self):
        _, _, result = self._create_locked_sorting_context(customs_notice_no="RAWAUTH240427")

        self.assertEqual(result["cost_status"], "cost_locked")
        self.assertEqual(result["cost_model_code"], "sorting_actual_weight_v3")
        self.assertEqual(result["unit_cost_kes"], 300.0)
        self.assertIsNotNone(result["cost_locked_at"])

    def test_post_lock_store_price_rack_print_actions_do_not_mutate_locked_cost_fields(self):
        _, task, result = self._create_locked_sorting_context(customs_notice_no="RAWPOSTLOCK240427")
        token = self.state.list_item_barcode_tokens(task_no=task["task_no"])[0]
        before = {
            "cost_status": token["cost_status"],
            "unit_cost_kes": token["unit_cost_kes"],
            "cost_model_code": token["cost_model_code"],
            "cost_locked_at": token["cost_locked_at"],
        }

        bale = self.state.list_store_dispatch_bales()[0]
        self.state.accept_store_dispatch_bale(
            bale["bale_no"],
            {
                "accepted_by": "store_manager_1",
                "store_code": "UTAWALA",
                "note": "accept for contract test",
            },
        )
        self.state.assign_store_dispatch_bale(
            bale["bale_no"],
            {
                "assigned_by": "store_manager_1",
                "employee_name": "Austin",
                "note": "assign for contract test",
            },
        )

        self.state.update_item_barcode_token_store_edit(
            token["token_no"],
            {
                "updated_by": "Austin",
                "store_code": "UTAWALA",
                "selling_price_kes": 459,
                "store_rack_code": "LT-TP",
                "note": "store metadata edit",
            },
        )
        print_jobs = self.state.queue_item_barcode_token_print_jobs(
            {
                "requested_by": "Austin",
                "token_nos": [token["token_no"]],
                "copies": 1,
                "printer_name": "Deli DL-720C",
                "template_code": "apparel_40x30",
            }
        )
        self.state.mark_print_job_printed(print_jobs[0]["id"], "Austin")

        after = self.state.item_barcode_tokens[token["token_no"]]
        self.assertEqual(after["cost_status"], before["cost_status"])
        self.assertEqual(after["unit_cost_kes"], before["unit_cost_kes"])
        self.assertEqual(after["cost_model_code"], before["cost_model_code"])
        self.assertEqual(after["cost_locked_at"], before["cost_locked_at"])
        self.assertEqual(after["cost_status"], result["cost_status"])

    def test_store_roles_can_manage_sale_metadata_but_not_warehouse_cost_fields(self):
        _, task, _ = self._create_locked_sorting_context(customs_notice_no="RAWROLE240427")
        bale = self.state.list_store_dispatch_bales()[0]
        self.state.accept_store_dispatch_bale(
            bale["bale_no"],
            {
                "accepted_by": "store_manager_1",
                "store_code": "UTAWALA",
                "note": "accept for role contract",
            },
        )
        self.state.assign_store_dispatch_bale(
            bale["bale_no"],
            {
                "assigned_by": "store_manager_1",
                "employee_name": "Austin",
                "note": "assign for role contract",
            },
        )

        token = self.state.list_item_barcode_tokens(task_no=task["task_no"])[0]
        before_cost = (token["cost_status"], token["unit_cost_kes"], token["cost_locked_at"])

        edited = self.state.update_item_barcode_token_store_edit(
            token["token_no"],
            {
                "updated_by": "Austin",
                "store_code": "UTAWALA",
                "selling_price_kes": 499,
                "store_rack_code": "LT-TP",
                "cost_status": "pending_source_link",
                "unit_cost_kes": 1,
                "cost_locked_at": None,
                "note": "sale metadata edit only",
            },
        )

        self.assertEqual(edited["selling_price_kes"], 499.0)
        self.assertEqual(edited["store_rack_code"], "LT-TP")
        self.assertEqual(
            (edited["cost_status"], edited["unit_cost_kes"], edited["cost_locked_at"]),
            before_cost,
        )

    @pytest.mark.xfail(
        reason="No explicit backend cost unlock flow with approval+audit contract is implemented yet.",
        strict=True,
    )
    def test_future_cost_unlock_requires_explicit_approval_and_audit_contract(self):
        unlock_flow = getattr(self.state, "unlock_sorting_task_cost")
        self.assertIsNotNone(unlock_flow)

    def test_reporting_surfaces_locked_cost_fields_not_browser_side_assumptions(self):
        _, task, result = self._create_locked_sorting_context(customs_notice_no="RAWREPORT240427")
        self.assertEqual(result["cost_status"], "cost_locked")

        stock_rows = self.state.list_sorting_stock()
        token_rows = self.state.list_item_barcode_tokens(task_no=task["task_no"])
        stock_layers_for_task = [
            layer
            for row in stock_rows
            for layer in row.get("cost_layers", [])
            if str(layer.get("task_no") or "").strip().upper() == task["task_no"]
        ]

        self.assertTrue(stock_layers_for_task)
        self.assertTrue(token_rows)
        self.assertTrue(all(layer["unit_cost_kes"] is not None for layer in stock_layers_for_task))
        self.assertTrue(all(layer["total_cost_kes"] is not None for layer in stock_layers_for_task))
        self.assertTrue(all(row["cost_status"] == "cost_locked" for row in token_rows))
        self.assertTrue(all(row["cost_locked_at"] is not None for row in token_rows))
        self.assertTrue(all(row["unit_cost_kes"] is not None for row in token_rows))
