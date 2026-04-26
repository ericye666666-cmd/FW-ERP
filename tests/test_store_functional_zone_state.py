import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, "/Users/ericye/Desktop/AI自动化/retail_ops_system/backend")

from app.core.config import settings
from app.core.state import InMemoryState


class StoreFunctionalZoneStateTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()

    def tearDown(self):
        settings.state_file = self.original_state_file
        self.temp_dir.cleanup()

    def _create_ready_bales(self, customs_notice_no="STORE240423", package_count=1, unit_weight=40):
        shipment = self.state.create_inbound_shipment(
            {
                "shipment_type": "sea",
                "customs_notice_no": customs_notice_no,
                "unload_date": "2026-04-23",
                "coc_goods_manifest": "store functional zone test",
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
                "category_main": "tops",
                "category_sub": "lady tops",
                "package_count": package_count,
                "total_weight": unit_weight,
                "received_by": "warehouse_clerk_1",
                "note": "store chain test",
            }
        )
        self.state.confirm_inbound_shipment_intake(
            shipment["shipment_no"],
            {
                "declared_total_packages": package_count,
                "confirmed_by": "warehouse_supervisor_1",
                "note": "confirmed for store chain test",
            },
        )
        return shipment, self.state.generate_bale_barcodes(shipment["shipment_no"], "warehouse_supervisor_1")

    def _create_assigned_store_bale(self, sorting_qty=2):
        _, bales = self._create_ready_bales()
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "store chain",
                "created_by": "warehouse_supervisor_1",
            }
        )
        self.state.submit_sorting_task_results(
            task["task_no"],
            {
                "created_by": "warehouse_supervisor_1",
                "result_items": [
                    {
                        "category_name": "tops / lady tops",
                        "grade": "P",
                        "qty": sorting_qty,
                        "rack_code": "A-TS-LT-P-01",
                        "confirm_to_inventory": True,
                        "default_cost_kes": 185,
                        "estimated_unit_cost_kes": 12.5,
                    }
                ],
                "note": "ready for store",
                "mark_task_completed": True,
                "cost_status_override": "cost_locked",
                "estimated_unit_cost_kes": 12.5,
                "cost_model_code": "sorting_piece_weight_v2",
                "source_bale_tokens": [],
                "source_pool_tokens": [],
            },
        )
        bale = self.state.list_store_dispatch_bales()[0]
        self.state.accept_store_dispatch_bale(
            bale["bale_no"],
            {
                "accepted_by": "store_manager_1",
                "store_code": "UTAWALA",
                "note": "门店已签收",
            },
        )
        bale = self.state.assign_store_dispatch_bale(
            bale["bale_no"],
            {
                "assigned_by": "store_manager_1",
                "employee_name": "Austin",
                "note": "一个 bale 只分配给一个店员处理",
            },
        )
        token = self.state.get_store_dispatch_bale_tokens(bale["bale_no"])[0]
        return bale, token

    def _prepare_shelved_store_tokens(self, sorting_qty=2):
        bale, _ = self._create_assigned_store_bale(sorting_qty=sorting_qty)
        tokens = self.state.get_store_dispatch_bale_tokens(bale["bale_no"])
        rack_rows = self.state.list_store_racks("UTAWALA")
        rack_codes = [row["rack_code"] for row in rack_rows] or ["LT-TP"]
        for index, token in enumerate(tokens, start=1):
            rack_code = rack_codes[(index - 1) % len(rack_codes)]
            self.state.update_item_barcode_token_store_edit(
                token["token_no"],
                {
                    "updated_by": "Austin",
                    "store_code": "UTAWALA",
                    "selling_price_kes": 299 + index,
                    "store_rack_code": rack_code,
                    "note": "prepare shelved token for retail identity tests",
                },
            )

        jobs = self.state.queue_item_barcode_token_print_jobs(
            {
                "requested_by": "Austin",
                "token_nos": [token["token_no"] for token in tokens],
                "copies": 1,
                "printer_name": "Deli DL-720C",
                "template_code": "apparel_40x30",
            }
        )
        for job in jobs:
            self.state.mark_print_job_printed(job["id"], "Austin")

        session = self.state.start_store_token_receiving_session(
            {
                "started_by": "Austin",
                "store_code": "UTAWALA",
                "bale_no": bale["bale_no"],
                "note": "prepare shelved token session",
            }
        )
        for index, token in enumerate(tokens, start=1):
            rack_code = rack_codes[(index - 1) % len(rack_codes)]
            self.state.add_store_token_receiving_batch(
                session["session_no"],
                {
                    "recorded_by": "Austin",
                    "token_no": token["token_no"],
                    "rack_code": rack_code,
                    "note": "prepare shelved token placement",
                },
            )
        self.state.finalize_store_token_receiving_session(
            session["session_no"],
            {
                "finalized_by": "Austin",
                "note": "prepare shelved token finalize",
            },
        )
        return bale, [self.state.item_barcode_tokens[token["token_no"]] for token in tokens]

    def test_seed_users_include_austin_and_swahili_store_clerks(self):
        users_by_username = {row["username"]: row for row in self.state.list_users()}

        self.assertEqual(users_by_username["Austin"]["role_code"], "store_clerk")
        self.assertEqual(users_by_username["Austin"]["store_code"], "UTAWALA")
        self.assertEqual(users_by_username["Swahili"]["role_code"], "store_clerk")
        self.assertEqual(users_by_username["Swahili"]["store_code"], "UTAWALA")

    def test_store_clerk_can_edit_print_and_shelve_the_assigned_bale(self):
        bale, token = self._create_assigned_store_bale()
        self.assertTrue(self.state.list_store_racks("UTAWALA"))

        edited = self.state.update_item_barcode_token_store_edit(
            token["token_no"],
            {
                "updated_by": "Austin",
                "store_code": "UTAWALA",
                "selling_price_kes": 299,
                "store_rack_code": "LT-TP",
                "note": "店员确认售价和货架位",
            },
        )
        self.assertEqual(edited["edited_by"], "Austin")

        jobs = self.state.queue_item_barcode_token_print_jobs(
            {
                "requested_by": "Austin",
                "token_nos": [token["token_no"]],
                "copies": 1,
                "printer_name": "Deli DL-720C",
                "template_code": "apparel_40x30",
            }
        )
        self.assertEqual(len(jobs), 1)

        printed_job = self.state.mark_print_job_printed(jobs[0]["id"], "Austin")
        self.assertEqual(printed_job["status"], "printed")
        printed_token = self.state.item_barcode_tokens[token["token_no"]]
        self.assertEqual(printed_token["identity_no"], token["token_no"])
        self.assertRegex(printed_token["final_item_barcode"]["barcode_value"], r"^IT\d{6}[A-Z]{6}$")
        self.assertNotEqual(printed_token["final_item_barcode"]["barcode_value"], token["token_no"])
        self.assertEqual(printed_token["final_item_barcode"]["identity_id"], token["token_no"])

        session = self.state.start_store_token_receiving_session(
            {
                "started_by": "Austin",
                "store_code": "UTAWALA",
                "bale_no": bale["bale_no"],
                "note": "店员开始上架",
            }
        )
        self.assertEqual(session["status"], "open")

        session = self.state.add_store_token_receiving_batch(
            session["session_no"],
            {
                "recorded_by": "Austin",
                "token_no": token["token_no"],
                "rack_code": "LT-TP",
                "note": "店员上架完成",
            },
        )
        self.assertEqual(session["analysis_summary"]["placed_count"], 1)

        session = self.state.finalize_store_token_receiving_session(
            session["session_no"],
            {
                "finalized_by": "Austin",
                "note": "本 bale 已完成上架",
            },
        )
        self.assertTrue(str(session["status"]).startswith("finalized"))
        shelved_token = self.state.item_barcode_tokens[token["token_no"]]
        self.assertEqual(shelved_token["status"], "shelved_in_store")
        self.assertEqual(shelved_token["store_rack_code"], "LT-TP")

    def test_store_clerk_cannot_touch_another_clerks_bale(self):
        bale, token = self._create_assigned_store_bale()

        with self.assertRaises(HTTPException):
            self.state.update_item_barcode_token_store_edit(
                token["token_no"],
                {
                    "updated_by": "Swahili",
                    "store_code": "UTAWALA",
                    "selling_price_kes": 299,
                    "store_rack_code": "LT-TP",
                    "note": "another clerk should not edit Austin shelving work",
                },
            )

        with self.assertRaises(HTTPException):
            self.state.start_store_token_receiving_session(
                {
                    "started_by": "Swahili",
                    "store_code": "UTAWALA",
                    "bale_no": bale["bale_no"],
                    "note": "another clerk should not start Austin shelving work",
                }
            )

    def test_store_acceptance_rejects_barcode_when_dispatch_store_does_not_match(self):
        bale, _ = self._create_assigned_store_bale()

        with self.assertRaises(HTTPException):
            self.state.accept_store_dispatch_bale(
                bale["bale_no"],
                {
                    "accepted_by": "store_manager_1",
                    "store_code": "KINNO",
                    "note": "wrong store should be rejected",
                },
            )

    def test_retail_actions_write_identity_id_explicitly_and_identity_ledger_reads_them_directly(self):
        _, tokens = self._prepare_shelved_store_tokens(sorting_qty=2)
        sold_token = tokens[0]
        returned_token = tokens[1]

        shift = self.state.open_cashier_shift(
            {
                "opened_by": "store_manager_1",
                "store_code": "UTAWALA",
                "opening_float_cash": 0,
                "note": "identity test shift",
            }
        )

        sale = self.state.create_sale_transaction(
            {
                "order_no": "SALE-ID-001",
                "store_code": "UTAWALA",
                "cashier_name": "store_manager_1",
                "shift_no": shift["shift_no"],
                "sold_at": "2026-04-23T10:00:00+00:00",
                "items": [
                    {
                        "barcode": sold_token["token_no"],
                        "qty": 1,
                        "selling_price": sold_token["selling_price_kes"],
                    }
                ],
                "payments": [{"method": "cash", "amount": sold_token["selling_price_kes"]}],
            }
        )
        self.assertEqual(sale["items"][0]["identity_id"], sold_token["identity_no"])

        refund = self.state.create_sale_refund_request(
            sale["order_no"],
            {
                "requested_by": "store_manager_1",
                "reason": "customer changed mind",
                "shift_no": shift["shift_no"],
                "items": [{"barcode": sold_token["token_no"], "qty": 1}],
            },
        )
        self.assertEqual(refund["items"][0]["identity_id"], sold_token["identity_no"])

        refund = self.state.review_sale_refund_request(
            refund["refund_no"],
            {
                "reviewed_by": "store_manager_1",
                "approved": True,
                "note": "identity refund approved",
            },
        )
        self.assertEqual(refund["items"][0]["identity_id"], sold_token["identity_no"])

        return_order = self.state.create_return_order(
            {
                "from_store_code": "UTAWALA",
                "to_warehouse_code": "WH1",
                "reason": "cycle_end_return",
                "created_by": "store_manager_1",
                "items": [{"barcode": returned_token["token_no"], "requested_qty": 1}],
            }
        )
        self.assertEqual(return_order["items"][0]["identity_id"], returned_token["identity_no"])

        self.state.dispatch_return_order(
            return_order["return_no"],
            {
                "dispatched_by": "store_manager_1",
                "note": "dispatch return with identity",
            },
        )
        return_order = self.state.get_return_order(return_order["return_no"])
        self.assertEqual(return_order["items"][0]["identity_id"], returned_token["identity_no"])

        self.state.receive_return_order(
            return_order["return_no"],
            {
                "received_by": "warehouse_clerk_1",
                "ret_rack_code": "WH-RET-01-01-01",
                "note": "receive return with identity",
            },
        )
        return_order = self.state.get_return_order(return_order["return_no"])
        self.assertEqual(return_order["items"][0]["identity_id"], returned_token["identity_no"])

        sold_ledger = self.state.get_item_identity_ledger(sold_token["identity_no"])
        self.assertEqual(sold_ledger["sales_history"][0]["identity_id"], sold_token["identity_no"])
        self.assertEqual(sold_ledger["refund_history"][0]["identity_id"], sold_token["identity_no"])

        returned_ledger = self.state.get_item_identity_ledger(returned_token["identity_no"])
        self.assertEqual(returned_ledger["return_history"][0]["identity_id"], returned_token["identity_no"])

    def test_store_manager_can_generate_recent_14_day_sales_by_identity(self):
        _, tokens = self._prepare_shelved_store_tokens(sorting_qty=4)

        result = self.state.generate_recent_store_sales(
            {
                "generated_by": "store_manager_1",
                "store_code": "UTAWALA",
                "days": 14,
                "max_items": 3,
                "note": "generate simulated recent sales",
            }
        )

        self.assertEqual(result["days"], 14)
        self.assertEqual(result["generated_count"], 3)
        self.assertEqual(len(result["sales"]), 3)
        for row in result["sales"]:
            self.assertTrue(row["identity_id"])
            self.assertLessEqual(row["days_ago"], 13)
            self.assertEqual(row["store_code"], "UTAWALA")
            self.assertGreater(row["selling_price"], 0)

        sold_identity_ids = {row["identity_id"] for row in result["sales"]}
        self.assertEqual(len(sold_identity_ids), 3)
        for token in tokens:
            stock_key = f"UTAWALA||{token['token_no']}"
            qty_on_hand = int(self.state.store_stock.get(stock_key, {}).get("qty_on_hand", 0) or 0)
            if token["identity_no"] in sold_identity_ids:
                self.assertEqual(qty_on_hand, 0)

        ledger = self.state.get_item_identity_ledger(result["sales"][0]["identity_id"])
        self.assertEqual(ledger["sales_history"][0]["identity_id"], result["sales"][0]["identity_id"])
