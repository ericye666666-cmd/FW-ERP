import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, "/Users/ericye/Desktop/AI自动化/retail_ops_system/backend")

from app.core.config import settings
from app.core.state import InMemoryState


class TransferFulfillmentChainTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()

    def tearDown(self):
        settings.state_file = self.original_state_file
        self.temp_dir.cleanup()

    def _seed_transfer_product(
        self,
        barcode: str = "OPS-FLOW-001",
        qty: int = 6,
        category_main: str = "tops",
        category_sub: str = "lady tops",
        product_name: str = "Ops Flow Tee",
    ) -> str:
        product = self.state.create_product(
            {
                "supplier_name": "Smoke Supplier",
                "category_main": category_main,
                "category_sub": category_sub,
                "product_name": product_name,
                "rack_code": "WH-A-01",
                "cost_price": 120.0,
                "launch_price": 280.0,
                "label_template_code": "apparel_40x30",
                "created_by": "warehouse_clerk_1",
            }
        )
        self.state.assign_barcode_to_product(
            product["id"],
            {
                "barcode": barcode,
                "assigned_by": "warehouse_clerk_1",
            },
        )
        self.state._add_warehouse_lot(
            warehouse_code="WH1",
            barcode=barcode,
            qty=qty,
            unit_cost=120.0,
            source_type="seed",
            source_no="SEED-TRANSFER",
            rack_code="WH-A-01",
            note="seed transfer stock",
        )
        return barcode

    def _seed_dispatch_tokens(self, barcode: str, qty: int = 4) -> None:
        for index in range(1, qty + 1):
            token_no = f"TK-OPS-{index:03d}"
            self.state.item_barcode_tokens[token_no] = {
                "token_no": token_no,
                "barcode": barcode,
                "product_name": "Ops Flow Tee",
                "shipment_no": "SHIP-OPS-001",
                "task_no": "TASK-OPS-001",
                "token_group_no": 1,
                "qty_index": index,
                "category_name": "tops / tees",
                "grade": "P",
                "status": "pending_store_print",
                "assigned_employee": "",
                "accepted_by": "",
                "store_dispatch_bale_no": "",
                "store_code": "",
                "transfer_no": "",
                "created_at": "2026-04-23T08:00:00Z",
                "updated_at": "2026-04-23T08:00:00Z",
            }

    def _append_sale(self, barcode: str, qty: int, sold_at: datetime, order_no: str) -> None:
        self.state.sales_transactions.append(
            {
                "id": len(self.state.sales_transactions) + 1,
                "order_no": order_no,
                "store_code": "UTAWALA",
                "cashier_name": "store_manager_1",
                "shift_no": "SHIFT-OPS-001",
                "sold_at": sold_at.isoformat(),
                "created_at": sold_at.isoformat(),
                "sale_status": "completed",
                "total_qty": qty,
                "total_amount": qty * 280.0,
                "items": [
                    {
                        "barcode": barcode,
                        "qty": qty,
                        "selling_price": 280.0,
                    }
                ],
                "payments": [{"method": "cash", "amount": qty * 280.0}],
            }
        )

    def test_store_manager_can_submit_transfer_order(self):
        barcode = self._seed_transfer_product()

        order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "approval_required": True,
                "items": [
                    {
                        "barcode": barcode,
                        "requested_qty": 4,
                    }
                ],
            }
        )

        self.assertEqual(order["status"], "submitted")
        self.assertEqual(order["approval_status"], "pending")
        self.assertEqual(order["store_receipt_status"], "not_started")
        self.assertEqual(order["delivery_batch_no"], "")
        self.assertEqual(order["shipment_session_no"], "")

    def test_store_manager_can_submit_transfer_order_by_category_demand(self):
        self._seed_transfer_product(barcode="OPS-FLOW-001", qty=2, product_name="Ops Flow Tee A")
        self._seed_transfer_product(barcode="OPS-FLOW-002", qty=4, product_name="Ops Flow Tee B")

        order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "approval_required": True,
                "items": [
                    {
                        "category_main": "tops",
                        "category_sub": "lady tops",
                        "requested_qty": 5,
                    }
                ],
            }
        )

        self.assertEqual(order["status"], "submitted")
        self.assertEqual(
            order["demand_lines"],
            [{"category_main": "tops", "category_sub": "lady tops", "grade": "", "requested_qty": 5}],
        )
        self.assertEqual(sum(item["requested_qty"] for item in order["items"]), 5)
        self.assertEqual({item["category_main"] for item in order["items"]}, {"tops"})
        self.assertEqual({item["category_sub"] for item in order["items"]}, {"lady tops"})
        self.assertEqual({item["barcode"] for item in order["items"]}, {"OPS-FLOW-001", "OPS-FLOW-002"})

    def test_manual_category_transfer_order_can_be_submitted_without_current_stock(self):
        order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "approval_required": True,
                "items": [
                    {
                        "category_main": "pants",
                        "category_sub": "cargo pant",
                        "requested_qty": 120,
                    }
                ],
            }
        )

        self.assertTrue(order["transfer_no"].startswith("TO-"))
        self.assertEqual(order["status"], "submitted")
        self.assertEqual(order["approval_status"], "pending")
        self.assertEqual(
            order["demand_lines"],
            [{"category_main": "pants", "category_sub": "cargo pant", "grade": "", "requested_qty": 120}],
        )
        self.assertEqual(order["items"], [])

    def test_manual_category_transfer_order_can_ship_after_auto_dispatch_bales(self):
        order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "warehouse_supervisor_1",
                "approval_required": True,
                "items": [
                    {
                        "category_main": "pants",
                        "category_sub": "cargo pant",
                        "requested_qty": 120,
                    }
                ],
            }
        )
        self.state.approve_transfer_order(
            order["transfer_no"],
            {"approved_by": "warehouse_supervisor_1", "approved": True, "note": "approve category demand"},
        )

        shipped = self.state.ship_transfer_order(
            order["transfer_no"],
            {
                "shipped_by": "warehouse_supervisor_1",
                "driver_name": "Driver A",
                "vehicle_no": "KDM-001A",
                "note": "ship manual category demand",
            },
        )

        self.assertEqual(shipped["status"], "shipped")
        self.assertEqual(shipped["to_store_code"], "UTAWALA")
        self.assertTrue(shipped["shipment_session_no"].startswith("SHIP-"))
        related_bales = [
            row for row in self.state.store_dispatch_bales.values()
            if row.get("transfer_no") == order["transfer_no"]
        ]
        self.assertEqual([row["item_count"] for row in related_bales], [100, 20])
        self.assertEqual({row["store_code"] for row in related_bales}, {"UTAWALA"})
        self.assertEqual({row["status"] for row in related_bales}, {"in_transit"})

    def test_transfer_create_persists_required_arrival_date_and_grade(self):
        self._seed_transfer_product(barcode="OPS-GRADE-001", qty=4, product_name="Ops Grade Tee A")
        self._seed_transfer_product(barcode="OPS-GRADE-002", qty=4, product_name="Ops Grade Tee B")

        created = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "required_arrival_date": "2026-05-02",
                "created_by": "store_manager_1",
                "approval_required": False,
                "items": [
                    {
                        "category_main": "tops",
                        "category_sub": "lady tops",
                        "grade": "P",
                        "requested_qty": 6,
                    }
                ],
            }
        )

        fetched = self.state.get_transfer_order(created["transfer_no"])
        self.assertEqual(fetched["required_arrival_date"], "2026-05-02")
        self.assertEqual(fetched["demand_lines"], [
            {"category_main": "tops", "category_sub": "lady tops", "grade": "P", "requested_qty": 6},
        ])
        self.assertTrue(all(item.get("grade") == "P" for item in fetched["items"]))
        self.assertEqual(sum(item["requested_qty"] for item in fetched["items"]), 6)

    def test_no_approval_transfer_can_create_dispatch_bundle_and_store_delivery_execution(self):
        barcode = self._seed_transfer_product(barcode="OPS-NO-APPROVAL-001", qty=3, product_name="Ops No Approval Tee")
        order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "required_arrival_date": "2026-05-03",
                "created_by": "store_manager_1",
                "approval_required": False,
                "items": [{"barcode": barcode, "requested_qty": 3, "grade": "S"}],
            }
        )
        self.assertEqual(order["approval_status"], "approved")
        self.assertEqual(order["status"], "approved")

        bundle = self.state.create_transfer_dispatch_bundle(
            order["transfer_no"],
            {
                "copies": 1,
                "printer_name": "Deli DL-720C",
                "label_copies_mode": "single",
                "grouping_mode": "by_category",
                "max_items_per_bale": 2,
                "requested_by": "warehouse_supervisor_1",
            },
        )
        self.assertGreaterEqual(bundle["generated_bale_count"], 1)

        execution = self.state.create_store_delivery_execution_order(
            order["transfer_no"],
            {
                "created_by": "warehouse_clerk_1",
                "mark_as_printed": False,
                "notes": "phase-a no approval path",
            },
        )
        self.assertEqual(execution["source_transfer_no"], order["transfer_no"])
        self.assertTrue(execution["execution_order_no"].startswith("SDO"))

    def test_can_create_picking_wave_with_one_request(self):
        barcode = self._seed_transfer_product(barcode="OPS-WAVE-001", qty=5)
        order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "approval_required": False,
                "items": [{"barcode": barcode, "requested_qty": 3}],
            }
        )
        wave = self.state.create_picking_wave(
            {
                "wave_name": "Wave A",
                "warehouse_code": "WH1",
                "planned_picking_date": "2026-05-02",
                "required_arrival_date": "2026-05-03",
                "selected_replenishment_request_nos": [order["transfer_no"]],
                "notes": "single request",
            }
        )
        self.assertEqual(wave["stores_included"], ["UTAWALA"])
        self.assertEqual(wave["total_requested_qty"], 3)

    def test_can_create_picking_wave_with_multiple_store_requests_and_same_date_multiple_waves(self):
        barcode = self._seed_transfer_product(barcode="OPS-WAVE-002", qty=12)
        first = self.state.create_transfer_order({"from_warehouse_code": "WH1", "to_store_code": "UTAWALA", "created_by": "store_manager_1", "approval_required": False, "items": [{"barcode": barcode, "requested_qty": 4}]})
        second = self.state.create_transfer_order({"from_warehouse_code": "WH1", "to_store_code": "PAIPLINE", "created_by": "warehouse_supervisor_1", "approval_required": False, "items": [{"barcode": barcode, "requested_qty": 2}]})
        wave_a = self.state.create_picking_wave({"wave_name": "Wave Fri A", "warehouse_code": "WH1", "planned_picking_date": "2026-05-03", "selected_replenishment_request_nos": [first["transfer_no"], second["transfer_no"]]})
        wave_b = self.state.create_picking_wave({"wave_name": "Wave Fri B", "warehouse_code": "WH1", "planned_picking_date": "2026-05-03", "selected_replenishment_request_nos": [first["transfer_no"]]})
        self.assertEqual(set(wave_a["stores_included"]), {"UTAWALA", "PAIPLINE"})
        self.assertEqual(wave_a["total_requested_qty"], 6)
        self.assertNotEqual(wave_a["wave_no"], wave_b["wave_no"])

    def test_cannot_create_picking_wave_with_empty_request_list(self):
        with self.assertRaisesRegex(HTTPException, "selected_replenishment_request_nos must not be empty"):
            self.state.create_picking_wave(
                {"wave_name": "invalid", "warehouse_code": "WH1", "planned_picking_date": "2026-05-03", "selected_replenishment_request_nos": []}
            )

    def test_picking_wave_requested_qty_uses_demand_lines_when_items_empty(self):
        order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "approval_required": False,
                "items": [
                    {
                        "category_main": "dress",
                        "category_sub": "long dress",
                        "grade": "P",
                        "requested_qty": 100,
                    }
                ],
            }
        )
        self.assertEqual(order["items"], [])
        self.assertEqual(sum(int(row.get("requested_qty") or 0) for row in order["demand_lines"]), 100)

        wave = self.state.create_picking_wave(
            {
                "wave_name": "Wave demand-only",
                "warehouse_code": "WH1",
                "planned_picking_date": "2026-05-03",
                "selected_replenishment_request_nos": [order["transfer_no"]],
            }
        )
        self.assertEqual(wave["total_requested_qty"], 100)
        self.assertEqual(wave["total_shortage_qty"], 100)

    def test_recommendation_uses_recent_sales_store_supply_and_creates_category_replenishment_order(self):
        barcode = self._seed_transfer_product(barcode="OPS-FLOW-REC-001", qty=12, product_name="Ops Flow Replenishment Tee")
        now = datetime.now(timezone.utc)
        self._append_sale(barcode, qty=4, sold_at=now - timedelta(days=3), order_no="SALE-OPS-001")
        self._append_sale(barcode, qty=4, sold_at=now - timedelta(days=9), order_no="SALE-OPS-002")
        self._append_sale(barcode, qty=10, sold_at=now - timedelta(days=20), order_no="SALE-OPS-OLD")

        self.state.store_stock["UTAWALA||OPS-FLOW-REC-001"] = {
            "store_code": "UTAWALA",
            "barcode": barcode,
            "product_name": "Ops Flow Replenishment Tee",
            "qty_on_hand": 2,
            "updated_at": now.isoformat(),
        }
        self.state.item_barcode_tokens["TK-OPS-PENDING-001"] = {
            "token_no": "TK-OPS-PENDING-001",
            "barcode": barcode,
            "product_name": "Ops Flow Replenishment Tee",
            "shipment_no": "SHIP-OPS-PENDING",
            "task_no": "TASK-OPS-PENDING",
            "token_group_no": 1,
            "qty_index": 1,
            "category_name": "tops / lady tops",
            "grade": "P",
            "status": "printed_in_store",
            "assigned_employee": "",
            "accepted_by": "store_manager_1",
            "store_dispatch_bale_no": "SDB-OPS-PENDING",
            "store_code": "UTAWALA",
            "transfer_no": "TO-OPS-PENDING",
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }

        self._seed_dispatch_tokens(barcode, qty=2)
        in_transit_order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "approval_required": True,
                "items": [{"barcode": barcode, "requested_qty": 2}],
            }
        )
        self.state.approve_transfer_order(
            in_transit_order["transfer_no"],
            {
                "approved_by": "warehouse_supervisor_1",
                "approved": True,
                "note": "ship the replenishment already on the way",
            },
        )
        self.state.create_transfer_dispatch_bundle(
            in_transit_order["transfer_no"],
            {
                "copies": 1,
                "printer_name": "Deli DL-720C",
                "label_copies_mode": "single",
                "grouping_mode": "by_category",
                "max_items_per_bale": 2,
                "requested_by": "warehouse_supervisor_1",
            },
        )
        self.state.ship_transfer_order(
            in_transit_order["transfer_no"],
            {
                "shipped_by": "warehouse_supervisor_1",
                "driver_name": "Driver Ops",
                "vehicle_no": "KDM-OPS",
                "note": "already on the road",
            },
        )

        recommendation = self.state.create_transfer_recommendation(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "preferred_categories": ["tops"],
                "max_suggestions": 5,
            }
        )

        self.assertEqual(recommendation["created_by"], "store_manager_1")
        self.assertEqual(len(recommendation["items"]), 1)
        item = recommendation["items"][0]
        self.assertEqual(item["category_main"], "tops")
        self.assertEqual(item["category_sub"], "lady tops")
        self.assertEqual(item["recent_14d_sales_qty"], 8)
        self.assertEqual(item["current_store_qty"], 2)
        self.assertEqual(item["pending_shelving_qty"], 1)
        self.assertEqual(item["in_transit_qty"], 2)
        self.assertEqual(item["effective_store_qty"], 5)
        self.assertEqual(item["warehouse_available_qty"], 10)
        self.assertEqual(item["requested_qty"], 3)
        self.assertEqual(item["suggested_qty"], 3)
        self.assertIn("recent_14d_sales", recommendation["analysis_summary"]["source_basis"])
        self.assertEqual(recommendation["analysis_summary"]["recent_sales_window_days"], 14)
        self.assertEqual(recommendation["analysis_summary"]["replenishment_mode"], "sales_sell_through")

        order = self.state.create_transfer_from_recommendation(
            recommendation["recommendation_no"],
            {
                "created_by": "store_manager_1",
                "approval_required": True,
            },
        )
        self.assertEqual(order["status"], "submitted")
        self.assertEqual(
            order["demand_lines"],
            [{"category_main": "tops", "category_sub": "lady tops", "grade": "", "requested_qty": 3}],
        )
        self.assertEqual(sum(item["requested_qty"] for item in order["items"]), 3)

    def test_recommendation_counts_dispatchable_token_pool_as_warehouse_supply(self):
        barcode = self._seed_transfer_product(
            barcode="OPS-FLOW-REC-POOL-001",
            qty=0,
            category_main="dress",
            category_sub="short dress",
            product_name="Ops Flow Pool Dress",
        )
        now = datetime.now(timezone.utc)
        self._append_sale(barcode, qty=4, sold_at=now - timedelta(days=2), order_no="SALE-OPS-POOL-001")
        self.state.store_stock["UTAWALA||OPS-FLOW-REC-POOL-001"] = {
            "store_code": "UTAWALA",
            "barcode": barcode,
            "product_name": "Ops Flow Pool Dress",
            "qty_on_hand": 1,
            "updated_at": now.isoformat(),
        }
        self._seed_dispatch_tokens(barcode, qty=3)

        recommendation = self.state.create_transfer_recommendation(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "max_suggestions": 10,
            }
        )

        item = next(
            row for row in recommendation["items"]
            if row["category_main"] == "dress" and row["category_sub"] == "short dress"
        )
        self.assertEqual(item["warehouse_available_qty"], 3)
        self.assertEqual(item["current_store_qty"], 1)
        self.assertEqual(item["recent_14d_sales_qty"], 4)
        self.assertEqual(item["requested_qty"], 3)

    def test_transfer_moves_through_operations_center_fulfillment_statuses(self):
        barcode = self._seed_transfer_product()
        self._seed_dispatch_tokens(barcode, qty=4)

        order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "approval_required": True,
                "items": [
                    {
                        "barcode": barcode,
                        "requested_qty": 4,
                    }
                ],
            }
        )
        self.assertEqual(order["status"], "submitted")

        approved = self.state.approve_transfer_order(
            order["transfer_no"],
            {
                "approved_by": "warehouse_supervisor_1",
                "approved": True,
                "note": "warehouse ready",
            },
        )
        self.assertEqual(approved["status"], "approved")

        bundle = self.state.create_transfer_dispatch_bundle(
            order["transfer_no"],
            {
                "copies": 1,
                "printer_name": "Deli DL-720C",
                "label_copies_mode": "single",
                "grouping_mode": "by_category",
                "max_items_per_bale": 2,
                "requested_by": "warehouse_supervisor_1",
            },
        )
        packed = self.state.get_transfer_order(order["transfer_no"])
        self.assertEqual(packed["status"], "packed")
        self.assertTrue(packed["delivery_batch_no"].startswith("DB-"))
        self.assertEqual({row["status"] for row in bundle["store_dispatch_bales"]}, {"labelled"})

        shipped = self.state.ship_transfer_order(
            order["transfer_no"],
            {
                "shipped_by": "warehouse_supervisor_1",
                "driver_name": "Driver A",
                "vehicle_no": "KDM-001A",
                "note": "left warehouse",
            },
        )
        self.assertEqual(shipped["status"], "shipped")
        self.assertEqual(shipped["store_receipt_status"], "pending_receipt")
        self.assertTrue(shipped["shipment_session_no"].startswith("SHIP-"))

        first_bale = bundle["store_dispatch_bales"][0]["bale_no"]
        second_bale = bundle["store_dispatch_bales"][1]["bale_no"]

        self.state.accept_store_dispatch_bale(
            first_bale,
            {
                "accepted_by": "store_manager_1",
                "store_code": "UTAWALA",
                "transfer_no": order["transfer_no"],
                "note": "first bale signed",
            },
        )
        partially_received = self.state.get_transfer_order(order["transfer_no"])
        self.assertEqual(partially_received["status"], "partially_received")
        self.assertEqual(partially_received["store_receipt_status"], "partial")

        self.state.accept_store_dispatch_bale(
            second_bale,
            {
                "accepted_by": "store_manager_1",
                "store_code": "UTAWALA",
                "transfer_no": order["transfer_no"],
                "note": "second bale signed",
            },
        )
        received = self.state.get_transfer_order(order["transfer_no"])
        self.assertEqual(received["status"], "received")
        self.assertEqual(received["store_receipt_status"], "received")

    def test_store_receipt_rejects_dispatch_bale_from_wrong_transfer_order(self):
        barcode = self._seed_transfer_product(barcode="OPS-FLOW-RECEIPT-001", qty=4)
        first_order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "approval_required": True,
                "items": [{"barcode": barcode, "requested_qty": 1}],
            }
        )
        second_order = self.state.create_transfer_order(
            {
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "created_by": "store_manager_1",
                "approval_required": True,
                "items": [{"barcode": barcode, "requested_qty": 1}],
            }
        )
        for order in (first_order, second_order):
            self.state.approve_transfer_order(
                order["transfer_no"],
                {"approved_by": "warehouse_supervisor_1", "approved": True, "note": "approve"},
            )
        bundle = self.state.create_transfer_dispatch_bundle(
            first_order["transfer_no"],
            {
                "copies": 1,
                "printer_name": "Deli DL-720C",
                "label_copies_mode": "single",
                "grouping_mode": "by_category",
                "max_items_per_bale": 1,
                "requested_by": "warehouse_supervisor_1",
            },
        )
        self.state.ship_transfer_order(
            first_order["transfer_no"],
            {
                "shipped_by": "warehouse_supervisor_1",
                "driver_name": "Driver A",
                "vehicle_no": "KDM-001A",
                "note": "left warehouse",
            },
        )

        with self.assertRaises(HTTPException) as context:
            self.state.accept_store_dispatch_bale(
                bundle["store_dispatch_bales"][0]["bale_no"],
                {
                    "accepted_by": "store_manager_1",
                    "store_code": "UTAWALA",
                    "transfer_no": second_order["transfer_no"],
                    "note": "wrong transfer",
                },
            )

        self.assertEqual(context.exception.status_code, 409)
        self.assertIn(first_order["transfer_no"], str(context.exception.detail))
