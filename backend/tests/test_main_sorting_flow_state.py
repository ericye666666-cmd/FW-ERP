import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

sys.path.insert(0, "/Users/ericye/Desktop/AI自动化/retail_ops_system/backend")

from app.core.config import settings
from app.core.state import InMemoryState


class MainSortingFlowStateTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()

    def tearDown(self):
        settings.state_file = self.original_state_file
        self.temp_dir.cleanup()

    def _create_ready_bales(self, customs_notice_no="RAW240421", package_count=2, unit_weight=40):
        shipment = self.state.create_inbound_shipment(
            {
                "shipment_type": "sea",
                "customs_notice_no": customs_notice_no,
                "unload_date": "2026-04-21",
                "coc_goods_manifest": "raw bale inventory validation",
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
                "category_main": "SummerA+",
                "category_sub": "SummerA+",
                "package_count": package_count,
                "total_weight": unit_weight,
                "received_by": "warehouse_clerk_1",
                "note": "raw bale page test",
            }
        )
        self.state.confirm_inbound_shipment_intake(
            shipment["shipment_no"],
            {
                "declared_total_packages": package_count,
                "confirmed_by": "warehouse_supervisor_1",
                "note": "confirmed for raw bale test",
            },
        )
        bales = self.state.generate_bale_barcodes(shipment["shipment_no"], "warehouse_supervisor_1")
        return shipment, bales

    def _create_ready_bales_with_source_cost(
        self,
        customs_notice_no="RAW240421SRC",
        total_source_cost_kes=800,
        package_count=1,
        unit_weight_kg=40,
        category_name="dress / 2 pieces",
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
        self.state.update_china_source_cost(
            source_pool_token,
            {
                "cost_entries": {
                    "head_transport": {"amount": 1200, "currency": "CNY"},
                    "customs_clearance": {"amount": 80000, "currency": "KES"},
                    "tail_transport": {"amount": 12000, "currency": "KES"},
                }
            },
            updated_by="warehouse_supervisor_1",
        )

        shipment = self.state.create_inbound_shipment(
            {
                "shipment_type": "sea",
                "customs_notice_no": customs_notice_no,
                "unload_date": "2026-04-21",
                "coc_goods_manifest": "raw bale inventory validation",
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
                "note": "raw bale page test",
            }
        )
        self.state.confirm_inbound_shipment_intake(
            shipment["shipment_no"],
            {
                "declared_total_packages": package_count,
                "confirmed_by": "warehouse_supervisor_1",
                "note": "confirmed for raw bale test",
            },
        )
        bales = self.state.generate_bale_barcodes(shipment["shipment_no"], "warehouse_supervisor_1")
        return shipment, bales, source_pool_token, source_bale_token

    def _create_confirmed_sorting_inventory(
        self,
        customs_notice_no="SORT240423",
        category_name="dress / 2 pieces",
        grade="P",
        qty=10,
        estimated_unit_cost_kes=80,
    ):
        shipment, bales, _, _ = self._create_ready_bales_with_source_cost(
            customs_notice_no=customs_notice_no,
            total_source_cost_kes=estimated_unit_cost_kes * qty,
            package_count=1,
            unit_weight_kg=40,
            category_name=category_name,
        )
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "prepare sorting inventory",
                "created_by": "warehouse_supervisor_1",
            }
        )
        result = self.state.submit_sorting_task_results(
            task["task_no"],
            {
                "result_items": [
                    {
                        "category_name": category_name,
                        "grade": grade,
                        "actual_weight_kg": 40,
                        "qty": qty,
                        "confirm_to_inventory": True,
                    }
                ],
                "note": "confirmed into sorting stock",
                "created_by": "warehouse_supervisor_1",
            },
        )
        return shipment, task, result

    def test_china_source_roundtrip_and_parcel_batch_validation(self):
        record = self.state.create_or_update_china_source_record(
            {
                "source_pool_token": "CN-SRC-KRA240421-01",
                "container_type": "40HQ",
                "customs_notice_no": "KRA240421",
                "lines": [
                    {
                        "source_bale_token": "CN-SRC-KRA240421-01-001",
                        "supplier_name": "Youxun Demo",
                        "category_main": "tops",
                        "category_sub": "lady tops",
                        "package_count": 3,
                        "unit_weight_kg": 28,
                        "unit_cost_amount": 120,
                        "unit_cost_currency": "CNY",
                    }
                ],
            },
            created_by="warehouse_clerk_1",
        )

        self.assertEqual(record["customs_notice_no"], "KRA240421")
        self.assertEqual(record["total_bale_count"], 3)

        updated = self.state.update_china_source_cost(
            "CN-SRC-KRA240421-01",
            {
                "cost_entries": {
                    "head_transport": {
                        "currency": "CNY",
                        "amount": 300,
                        "payment_method": "bank",
                        "payer": "china_finance",
                        "payment_reference": "HEAD-001",
                        "documents": [],
                    },
                    "customs_clearance": {
                        "currency": "KES",
                        "amount": 12000,
                        "payment_method": "cash",
                        "payer": "kenya_finance",
                        "payment_reference": "KRA-001",
                        "documents": [],
                    },
                    "tail_transport": {
                        "currency": "KES",
                        "amount": 2500,
                        "payment_method": "bank",
                        "payer": "kenya_ops",
                        "payment_reference": "TAIL-001",
                        "documents": [],
                    },
                }
            },
            updated_by="warehouse_supervisor_1",
        )

        self.assertEqual(updated["cost_entries"]["customs_clearance"]["amount"], 12000)

    def test_inbound_shipment_datetime_local_keeps_time_but_shipment_no_uses_date_only(self):
        shipment = self.state.create_inbound_shipment(
            {
                "shipment_type": "sea",
                "customs_notice_no": "GOSUQ I N6862022",
                "unload_date": "2026-04-22T09:42",
                "coc_goods_manifest": "datetime local inbound",
                "note": "",
                "coc_documents": [],
            }
        )

        self.assertEqual(shipment["unload_date"], "2026-04-22 09:42")
        self.assertEqual(shipment["shipment_no"], "GOSUQ I N6862022-2026-04-22")

    def test_parcel_batch_requires_source_line_when_shipment_has_china_source(self):
        self.state.create_or_update_china_source_record(
            {
                "source_pool_token": "CN-SRC-KRA240421-01",
                "container_type": "40HQ",
                "customs_notice_no": "KRA240421",
                "lines": [
                    {
                        "source_bale_token": "CN-SRC-KRA240421-01-001",
                        "supplier_name": "Youxun Demo",
                        "category_main": "tops",
                        "category_sub": "lady tops",
                        "package_count": 3,
                        "unit_weight_kg": 28,
                        "unit_cost_amount": 120,
                        "unit_cost_currency": "CNY",
                    }
                ],
            },
            created_by="warehouse_clerk_1",
        )

        shipment = self.state.create_inbound_shipment(
            {
                "shipment_type": "sea",
                "customs_notice_no": "KRA240421",
                "unload_date": "2026-04-21",
                "coc_goods_manifest": "sorting flow validation",
                "note": "",
                "coc_documents": [],
            }
        )

        with self.assertRaises(HTTPException):
            self.state.create_parcel_batch(
                {
                    "intake_type": "sea_freight",
                    "inbound_shipment_no": shipment["shipment_no"],
                    "supplier_name": "Youxun Demo",
                    "cargo_type": "summer apparel",
                    "category_main": "tops",
                    "category_sub": "lady tops",
                    "package_count": 3,
                    "total_weight": 84,
                    "received_by": "warehouse_clerk_1",
                    "note": "missing source link",
                }
            )

        batch = self.state.create_parcel_batch(
            {
                "intake_type": "sea_freight",
                "inbound_shipment_no": shipment["shipment_no"],
                "source_bale_token": "CN-SRC-KRA240421-01-001",
                "supplier_name": "Youxun Demo",
                "cargo_type": "summer apparel",
                "category_main": "tops",
                "category_sub": "lady tops",
                "package_count": 3,
                "total_weight": 84,
                "received_by": "warehouse_clerk_1",
                "note": "valid source link",
            }
        )

        self.assertEqual(batch["source_bale_token"], "CN-SRC-KRA240421-01-001")

    def test_store_retail_seed_creates_in_store_identities_and_sales_simulation_can_run(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SEEDTOPS240423",
            category_name="tops / lady tops",
            grade="S",
            qty=6,
            estimated_unit_cost_kes=80,
        )
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SEEDDRESS240423",
            category_name="dress / short dress",
            grade="P",
            qty=6,
            estimated_unit_cost_kes=110,
        )
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SEEDPANTS240423",
            category_name="pants / jeans pant",
            grade="S",
            qty=6,
            estimated_unit_cost_kes=95,
        )

        seed = self.state.seed_store_retail_samples(
            {
                "store_code": "UTAWALA",
                "max_items": 9,
                "seeded_by": "store_manager_1",
                "note": "seed retail demo inventory",
            }
        )

        self.assertEqual(seed["store_code"], "UTAWALA")
        self.assertEqual(seed["generated_count"], 9)
        self.assertGreaterEqual(seed["remaining_available_token_count"], 0)
        self.assertEqual(seed["generated_count"] + seed["remaining_available_token_count"], 18)
        self.assertGreater(seed["current_qty_on_hand"], 0)
        self.assertTrue(all(row["identity_id"] for row in seed["items"]))
        self.assertGreaterEqual(len({(row["category_main"], row["category_sub"]) for row in seed["items"]}), 3)
        self.assertGreater(len({row["store_rack_code"] for row in seed["items"] if row["store_rack_code"]}), 1)
        self.assertGreater(len({row["selling_price"] for row in seed["items"]}), 1)

        sale_seed = self.state.generate_recent_store_sales(
            {
                "store_code": "UTAWALA",
                "max_items": 4,
                "generated_by": "store_manager_1",
                "note": "simulate after seed",
            }
        )

        self.assertEqual(sale_seed["generated_count"], 4)
        self.assertLess(sale_seed["remaining_qty_on_hand"], sale_seed["initial_qty_on_hand"])
        self.assertTrue(all(row["identity_id"] for row in sale_seed["sales"]))

    def test_apparel_piece_weight_upsert_and_delete(self):
        created = self.state.upsert_apparel_piece_weight(
            {
                "category_main": "tops",
                "category_sub": "lady tops",
                "standard_weight_kg": 0.24,
                "note": "sorting v2 default",
            },
            updated_by="warehouse_supervisor_1",
        )

        self.assertEqual(created["standard_weight_kg"], 0.24)
        self.assertEqual(len(self.state.list_apparel_piece_weights()), 1)

        updated = self.state.upsert_apparel_piece_weight(
            {
                "category_main": "tops",
                "category_sub": "lady tops",
                "standard_weight_kg": 0.26,
                "note": "updated",
            },
            updated_by="warehouse_supervisor_1",
        )

        self.assertEqual(updated["standard_weight_kg"], 0.26)
        self.assertEqual(len(self.state.list_apparel_piece_weights()), 1)

        self.state.delete_apparel_piece_weight(
            "tops",
            "lady tops",
            deleted_by="warehouse_supervisor_1",
        )

        self.assertEqual(self.state.list_apparel_piece_weights(), [])

    def test_apparel_default_cost_upsert_and_delete(self):
        seeded = self.state.list_apparel_default_costs()
        self.assertTrue(
            any(
                row["category_main"] == "tops"
                and row["category_sub"] == "lady tops"
                and row["grade"] == "P"
                for row in seeded
            )
        )

        created = self.state.upsert_apparel_default_cost(
            {
                "category_main": "tops",
                "category_sub": "demo tops",
                "grade": "p",
                "default_cost_kes": 185.25,
                "note": "demo seed",
            },
            updated_by="warehouse_supervisor_1",
        )

        self.assertEqual(created["grade"], "P")
        self.assertEqual(created["default_cost_kes"], 185.25)

        updated = self.state.upsert_apparel_default_cost(
            {
                "category_main": "tops",
                "category_sub": "demo tops",
                "grade": "P",
                "default_cost_kes": 190,
                "note": "updated",
            },
            updated_by="warehouse_supervisor_1",
        )

        self.assertEqual(updated["default_cost_kes"], 190)
        self.assertEqual(
            len(
                [
                    row
                    for row in self.state.list_apparel_default_costs()
                    if row["category_main"] == "tops"
                    and row["category_sub"] == "demo tops"
                    and row["grade"] == "P"
                ]
            ),
            1,
        )

        self.state.delete_apparel_default_cost(
            "tops",
            "demo tops",
            "P",
            deleted_by="warehouse_supervisor_1",
        )

        self.assertFalse(
            any(
                row["category_main"] == "tops"
                and row["category_sub"] == "demo tops"
                and row["grade"] == "P"
                for row in self.state.list_apparel_default_costs()
            )
        )

    def test_apparel_sorting_rack_upsert_and_delete(self):
        seeded = self.state.list_apparel_sorting_racks()
        self.assertTrue(
            any(
                row["category_main"] == "tops"
                and row["category_sub"] == "lady tops"
                and row["grade"] == "P"
                for row in seeded
            )
        )

        self.state.upsert_apparel_default_cost(
            {
                "category_main": "tops",
                "category_sub": "demo tops",
                "grade": "p",
                "default_cost_kes": 185.25,
                "note": "demo default cost",
            },
            updated_by="warehouse_supervisor_1",
        )

        created = self.state.upsert_apparel_sorting_rack(
            {
                "category_main": "tops",
                "category_sub": "demo tops",
                "grade": "p",
                "default_cost_kes": 185.25,
                "rack_code": "A-DEMO-P-01",
                "note": "demo rack",
            },
            updated_by="warehouse_supervisor_1",
        )

        self.assertEqual(created["grade"], "P")
        self.assertEqual(created["default_cost_kes"], 185.25)
        self.assertEqual(created["rack_code"], "A-DEMO-P-01")

        updated = self.state.upsert_apparel_sorting_rack(
            {
                "category_main": "tops",
                "category_sub": "demo tops",
                "grade": "P",
                "default_cost_kes": 185.25,
                "rack_code": "A-DEMO-P-02",
                "note": "updated",
            },
            updated_by="warehouse_supervisor_1",
        )

        self.assertEqual(updated["rack_code"], "A-DEMO-P-02")
        self.assertEqual(
            len(
                [
                    row
                    for row in self.state.list_apparel_sorting_racks()
                    if row["category_main"] == "tops"
                    and row["category_sub"] == "demo tops"
                    and row["grade"] == "P"
                    and float(row["default_cost_kes"]) == 185.25
                ]
            ),
            1,
        )

        self.state.delete_apparel_sorting_rack(
            "tops",
            "demo tops",
            "P",
            185.25,
            deleted_by="warehouse_supervisor_1",
        )

        self.assertFalse(
            any(
                row["category_main"] == "tops"
                and row["category_sub"] == "demo tops"
                and row["grade"] == "P"
                and float(row["default_cost_kes"]) == 185.25
                for row in self.state.list_apparel_sorting_racks()
            )
        )

    def test_seed_sorting_racks_backfill_current_default_cost_and_drop_stale_cost(self):
        self.state.upsert_apparel_default_cost(
            {
                "category_main": "pants",
                "category_sub": "jeans pant",
                "grade": "P",
                "default_cost_kes": 185,
                "note": "updated current cost",
            },
            updated_by="warehouse_supervisor_1",
        )

        stale_key = self.state._apparel_sorting_rack_key("pants", "jeans pant", "P", 210)
        self.state.apparel_sorting_racks[stale_key] = {
            "category_main": "pants",
            "category_sub": "jeans pant",
            "grade": "P",
            "default_cost_kes": 210,
            "rack_code": "A-PT-JE-P-01",
            "note": "stale rack",
            "updated_at": "2026-04-22T00:00:00+00:00",
            "updated_by": "system",
        }

        updated = self.state._ensure_seed_apparel_sorting_racks()

        self.assertTrue(updated)
        self.assertNotIn(stale_key, self.state.apparel_sorting_racks)
        refreshed_key = self.state._apparel_sorting_rack_key("pants", "jeans pant", "P", 185)
        self.assertIn(refreshed_key, self.state.apparel_sorting_racks)
        self.assertEqual(self.state.apparel_sorting_racks[refreshed_key]["rack_code"], "A-PT-JE-P-01")

    def test_raw_bales_have_main_flow_defaults_and_can_route_to_sorting(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="RAW240422")

        rows = self.state.list_raw_bales(shipment_no=shipment["shipment_no"])

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["destination_judgement"], "pending")
        self.assertEqual(rows[0]["current_location"], "warehouse_raw_bale_stock")
        self.assertEqual(rows[0]["weight_kg"], 40)
        self.assertEqual(rows[0]["occupied_by_task_no"], "")
        self.assertTrue(rows[0]["can_route_to_sorting"])

        routed = self.state.route_raw_bale_to_sorting(
            bales[0]["bale_barcode"],
            {"note": "send to sorting", "updated_by": "warehouse_supervisor_1"},
        )

        self.assertEqual(routed["destination_judgement"], "sorting")
        self.assertEqual(routed["status"], "ready_for_sorting")
        self.assertEqual(routed["current_location"], "warehouse_raw_bale_stock")

    def test_bale_in_sales_pool_cannot_enter_sorting_task(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="RAW240423")
        sales_pool_bale = self.state.route_raw_bale_to_bale_sales_pool(
            bales[1]["bale_barcode"],
            {"note": "move to bale sales pool", "updated_by": "warehouse_supervisor_1"},
        )

        self.assertEqual(sales_pool_bale["destination_judgement"], "bale_sales_pool")
        self.assertEqual(sales_pool_bale["status"], "in_bale_sales_pool")
        self.assertEqual(sales_pool_bale["current_location"], "bale_sales_pool")

        with self.assertRaises(HTTPException):
            self.state.create_sorting_task(
                {
                    "bale_barcodes": [sales_pool_bale["bale_barcode"]],
                    "handler_names": ["warehouse_clerk_1"],
                    "note": "should be blocked",
                    "created_by": "warehouse_supervisor_1",
                }
            )

    def test_ready_bale_can_create_sorting_task_without_route_judgement(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="RAW240424")
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "ready bale can go straight into sorting",
                "created_by": "warehouse_supervisor_1",
            }
        )

        updated_bale = self.state.list_raw_bales(shipment_no=shipment["shipment_no"])[0]
        self.assertEqual(task["bale_barcodes"], [bales[0]["bale_barcode"]])
        self.assertEqual(updated_bale["status"], "sorting_in_progress")
        self.assertEqual(updated_bale["occupied_by_task_no"], task["task_no"])

    def test_raw_bale_without_source_cost_cannot_create_sorting_task(self):
        _, bales = self._create_ready_bales(customs_notice_no="RAW240428")

        with self.assertRaises(HTTPException) as ctx:
            self.state.create_sorting_task(
                {
                    "bale_barcodes": [bales[0]["bale_barcode"]],
                    "handler_names": ["warehouse_clerk_1"],
                    "note": "missing source cost should be blocked",
                    "created_by": "warehouse_supervisor_1",
                }
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(ctx.exception.detail, "该 Bale 来源成本未完成，不能创建分拣任务。请先补齐中方来源与三段成本。")

    def test_raw_bale_with_source_cost_can_create_sorting_task(self):
        shipment, bales, _, _ = self._create_ready_bales_with_source_cost(customs_notice_no="RAW240429")

        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "source cost completed",
                "created_by": "warehouse_supervisor_1",
            }
        )

        updated_bale = self.state.list_raw_bales(shipment_no=shipment["shipment_no"])[0]
        self.assertEqual(task["bale_barcodes"], [bales[0]["bale_barcode"]])
        self.assertEqual(updated_bale["status"], "sorting_in_progress")

    def test_bale_scan_token_is_short_and_used_for_print_payload_and_sorting_lookup(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="RAW240427")
        first_bale = bales[0]

        self.assertTrue(first_bale["bale_barcode"].startswith("RB"))
        self.assertEqual(first_bale["scan_token"], first_bale["bale_barcode"])
        self.assertTrue(first_bale["legacy_bale_barcode"].startswith("BALE-"))
        self.assertLess(len(first_bale["bale_barcode"]), len(first_bale["legacy_bale_barcode"]))

        queued = self.state.queue_bale_barcode_print_jobs(
            shipment["shipment_no"],
            [{"bale_barcode": first_bale["bale_barcode"], "copies": 1}],
            requested_by="warehouse_clerk_1",
        )
        job = queued["print_jobs"][0]
        self.assertEqual(job["barcode"], first_bale["bale_barcode"])
        self.assertEqual(job["print_payload"]["barcode_value"], first_bale["bale_barcode"])
        self.assertEqual(job["print_payload"]["scan_token"], first_bale["scan_token"])
        self.assertEqual(job["print_payload"]["bale_barcode"], first_bale["bale_barcode"])
        self.assertEqual(job["print_payload"]["legacy_bale_barcode"], first_bale["legacy_bale_barcode"])

        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [first_bale["legacy_bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "scan token can create sorting task",
                "created_by": "warehouse_supervisor_1",
            }
        )

        self.assertEqual(task["bale_barcodes"], [first_bale["bale_barcode"]])
        self.assertEqual(task["legacy_bale_barcodes"], [first_bale["legacy_bale_barcode"]])

    def test_store_prep_bale_task_moves_sorted_inventory_into_waiting_dispatch_bale_view(self):
        _, _, result = self._create_confirmed_sorting_inventory()

        created = self.state.create_store_prep_bale_task(
            {
                "category_sub": "2 pieces",
                "target_qty": 5,
                "assigned_employee": "warehouse_clerk_1",
                "note": "pack overflow clothes for store dispatch",
                "created_by": "warehouse_supervisor_1",
            }
        )

        self.assertEqual(created["status"], "open")
        self.assertEqual(created["category_sub"], "2 pieces")
        self.assertEqual(created["target_qty"], 5)
        self.assertEqual(created["available_qty"], 5)
        self.assertEqual(created["suspended_qty"], 5)
        self.assertEqual(created["assigned_employee"], "warehouse_clerk_1")

        completed = self.state.complete_store_prep_bale_task(
            created["task_no"],
            {
                "updated_by": "warehouse_supervisor_1",
                "note": "compressed and stacked aside",
            },
        )

        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["packed_qty"], 5)
        self.assertTrue(completed["prepared_bale_no"].startswith("SPB-"))
        self.assertEqual(completed["unit_cost_kes"], 80)
        self.assertEqual(completed["total_cost_kes"], 400)
        self.assertEqual(completed["assigned_employee"], "warehouse_clerk_1")

        prep_bales = self.state.list_store_prep_bales()
        self.assertEqual(len(prep_bales), 1)
        self.assertEqual(prep_bales[0]["bale_no"], completed["prepared_bale_no"])
        self.assertEqual(prep_bales[0]["category_sub"], "2 pieces")
        self.assertEqual(prep_bales[0]["qty"], 5)
        self.assertEqual(prep_bales[0]["status"], "waiting_store_dispatch")
        self.assertRegex(prep_bales[0]["bale_barcode"], r"^SDB\d{6}[A-Z]{3}$")
        self.assertEqual(prep_bales[0]["scan_token"], prep_bales[0]["bale_barcode"])
        self.assertEqual(completed["prepared_bale_barcode"], prep_bales[0]["bale_barcode"])

        stock_rows = self.state.list_sorting_stock()
        dress_row = next(row for row in stock_rows if row["sku_code"] == result["result_items"][0]["sku_code"])
        self.assertEqual(dress_row["qty_on_hand"], 5)
        self.assertEqual(dress_row["total_cost_kes"], 400)

        packed_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("store_prep_bale_no") == completed["prepared_bale_no"]
        ]
        self.assertEqual(len(packed_tokens), 5)
        self.assertTrue(all(row["status"] == "packed_waiting_store_dispatch" for row in packed_tokens))

    def test_store_dispatch_compression_task_can_create_multiple_bales_in_one_assignment(self):
        self._create_confirmed_sorting_inventory(qty=220, estimated_unit_cost_kes=50)

        created = self.state.create_store_prep_bale_task(
            {
                "task_type": "store_dispatch",
                "category_sub": "2 pieces",
                "pieces_per_bale": 100,
                "bale_count": 2,
                "assigned_employee": "warehouse_clerk_1",
                "note": "pack two dispatch bales in one assigned task",
                "created_by": "warehouse_supervisor_1",
            }
        )

        self.assertEqual(created["target_qty"], 200)
        self.assertEqual(created["pieces_per_bale"], 100)
        self.assertEqual(created["bale_count"], 2)
        self.assertEqual(created["suspended_qty"], 200)
        self.assertEqual(created["assigned_employee"], "warehouse_clerk_1")

        completed = self.state.complete_store_prep_bale_task(
            created["task_no"],
            {
                "updated_by": "warehouse_supervisor_1",
                "note": "two bales accepted",
            },
        )

        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["packed_qty"], 200)
        self.assertEqual(completed["pieces_per_bale"], 100)
        self.assertEqual(completed["bale_count"], 2)
        self.assertEqual(len(completed["prepared_bale_nos"]), 2)
        self.assertEqual(len(completed["prepared_bale_barcodes"]), 2)
        self.assertEqual(completed["prepared_bale_no"], completed["prepared_bale_nos"][0])
        self.assertEqual(completed["prepared_bale_barcode"], completed["prepared_bale_barcodes"][0])

        prep_bales = self.state.list_store_prep_bales()
        self.assertEqual(len(prep_bales), 2)
        self.assertEqual([row["qty"] for row in prep_bales], [100, 100])
        self.assertEqual({row["task_no"] for row in prep_bales}, {created["task_no"]})
        self.assertEqual({row["status"] for row in prep_bales}, {"waiting_store_dispatch"})
        self.assertEqual(len({row["bale_barcode"] for row in prep_bales}), 2)

        packed_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("store_prep_task_no") == completed["task_no"]
            and row.get("store_prep_bale_no") in completed["prepared_bale_nos"]
        ]
        self.assertEqual(len(packed_tokens), 200)
        counts_by_bale = {
            bale_no: len([row for row in packed_tokens if row.get("store_prep_bale_no") == bale_no])
            for bale_no in completed["prepared_bale_nos"]
        }
        self.assertEqual(counts_by_bale, {completed["prepared_bale_nos"][0]: 100, completed["prepared_bale_nos"][1]: 100})

    def test_store_prep_bale_consumes_sorting_cost_layers_fifo(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423FIFOA",
            qty=150,
            estimated_unit_cost_kes=10,
        )
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423FIFOB",
            qty=100,
            estimated_unit_cost_kes=20,
        )

        stock_row = next(row for row in self.state.list_sorting_stock() if row["sku_code"] == "DRESS2PI-P-028000")
        self.assertEqual(stock_row["qty_on_hand"], 250)
        self.assertEqual(stock_row["total_cost_kes"], 3500)
        self.assertEqual([layer["qty_on_hand"] for layer in stock_row["cost_layers"]], [150, 100])
        self.assertEqual([layer["unit_cost_kes"] for layer in stock_row["cost_layers"]], [10, 20])

        created = self.state.create_store_prep_bale_task(
            {
                "category_sub": "2 pieces",
                "pieces_per_bale": 100,
                "bale_count": 2,
                "assigned_employee": "warehouse_clerk_1",
                "note": "fifo pick without physical batch lock",
                "created_by": "warehouse_supervisor_1",
            }
        )
        completed = self.state.complete_store_prep_bale_task(
            created["task_no"],
            {
                "updated_by": "warehouse_supervisor_1",
                "note": "fifo cost layers consumed",
            },
        )

        self.assertEqual(completed["packed_qty"], 200)
        self.assertEqual(completed["total_cost_kes"], 2500)
        self.assertEqual(completed["unit_cost_kes"], 12.5)
        packed_tokens = [
            row for row in self.state.list_item_barcode_tokens()
            if row.get("store_prep_task_no") == completed["task_no"]
        ]
        self.assertEqual([row["unit_cost_kes"] for row in packed_tokens[:3]], [10, 10, 10])
        self.assertEqual([row["unit_cost_kes"] for row in packed_tokens[148:152]], [10, 10, 20, 20])
        stock_row = next(row for row in self.state.list_sorting_stock() if row["sku_code"] == "DRESS2PI-P-028000")
        self.assertEqual(stock_row["qty_on_hand"], 50)
        self.assertEqual(stock_row["total_cost_kes"], 1000)
        self.assertEqual([layer["qty_on_hand"] for layer in stock_row["cost_layers"]], [50])
        self.assertEqual([layer["unit_cost_kes"] for layer in stock_row["cost_layers"]], [20])

    def test_store_prep_bale_task_rejects_employee_with_other_open_task(self):
        self._create_confirmed_sorting_inventory()

        created = self.state.create_store_prep_bale_task(
            {
                "category_sub": "2 pieces",
                "target_qty": 5,
                "assigned_employee": "warehouse_clerk_1",
                "note": "first compression task",
                "created_by": "warehouse_supervisor_1",
            }
        )
        self.assertEqual(created["status"], "open")

        with self.assertRaises(HTTPException) as ctx:
            self.state.create_store_prep_bale_task(
                {
                    "category_sub": "2 pieces",
                    "target_qty": 5,
                    "assigned_employee": "warehouse_clerk_1",
                    "note": "should fail because same employee is occupied",
                    "created_by": "warehouse_supervisor_1",
                }
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("warehouse_clerk_1", str(ctx.exception.detail))
        self.assertIn(created["task_no"], str(ctx.exception.detail))

    def test_store_dispatch_compression_task_tracks_grade_split_and_deducts_matching_stock(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423P",
            category_name="dress / 2 pieces",
            grade="P",
            qty=6,
            estimated_unit_cost_kes=80,
        )
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423S",
            category_name="dress / 2 pieces",
            grade="S",
            qty=4,
            estimated_unit_cost_kes=60,
        )

        created = self.state.create_store_prep_bale_task(
            {
                "task_type": "store_dispatch",
                "category_sub": "2 pieces",
                "grade_requirements": [
                    {"grade": "P", "qty": 3},
                    {"grade": "S", "qty": 2},
                ],
                "assigned_employee": "warehouse_clerk_1",
                "note": "pack graded pieces for store dispatch",
                "created_by": "warehouse_supervisor_1",
            }
        )

        self.assertEqual(created["task_type"], "store_dispatch")
        self.assertEqual(created["target_qty"], 5)
        self.assertEqual(created["available_qty"], 5)
        self.assertEqual(created["suspended_qty"], 5)
        self.assertEqual(
            created["grade_requirements"],
            [
                {"grade": "P", "qty": 3},
                {"grade": "S", "qty": 2},
            ],
        )

        suspended_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("store_prep_task_no") == created["task_no"]
        ]
        self.assertEqual(len(suspended_tokens), 5)
        suspended_grade_counts = {
            grade: len([row for row in suspended_tokens if row.get("grade") == grade])
            for grade in {"P", "S"}
        }
        self.assertEqual(suspended_grade_counts, {"P": 3, "S": 2})
        self.assertTrue(all(row["status"] == "reserved_waiting_store_dispatch" for row in suspended_tokens))

        stock_rows = self.state.list_sorting_stock()
        dress_rows = [row for row in stock_rows if row["category_name"] == "dress / 2 pieces"]
        dress_by_grade = {row["grade"]: row for row in dress_rows}
        self.assertEqual(dress_by_grade["P"]["qty_on_hand"], 6)
        self.assertEqual(dress_by_grade["S"]["qty_on_hand"], 4)

        with self.assertRaises(HTTPException) as insufficient_ctx:
            self.state.create_store_prep_bale_task(
                {
                    "task_type": "store_dispatch",
                    "category_sub": "2 pieces",
                    "grade_requirements": [
                        {"grade": "P", "qty": 4},
                        {"grade": "S", "qty": 2},
                    ],
                    "assigned_employee": "warehouse_clerk_2",
                    "note": "should fail because five pieces are already suspended",
                    "created_by": "warehouse_supervisor_1",
                }
            )

        self.assertEqual(insufficient_ctx.exception.status_code, 409)
        self.assertIn("当前只有 5 件可打包", str(insufficient_ctx.exception.detail))

        completed = self.state.complete_store_prep_bale_task(
            created["task_no"],
            {
                "updated_by": "warehouse_supervisor_1",
                "note": "compressed and stacked aside",
            },
        )

        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["task_type"], "store_dispatch")
        self.assertEqual(completed["packed_qty"], 5)
        self.assertEqual(completed["grade_summary"], "P 3 件 / S 2 件")
        self.assertEqual(completed["unit_cost_kes"], 72)
        self.assertEqual(completed["total_cost_kes"], 360)

        prep_bales = self.state.list_store_prep_bales()
        self.assertEqual(len(prep_bales), 1)
        self.assertEqual(prep_bales[0]["task_type"], "store_dispatch")
        self.assertEqual(prep_bales[0]["status"], "waiting_store_dispatch")
        self.assertEqual(prep_bales[0]["grade_summary"], "P 3 件 / S 2 件")

        stock_rows = self.state.list_sorting_stock()
        dress_rows = [row for row in stock_rows if row["category_name"] == "dress / 2 pieces"]
        dress_by_grade = {row["grade"]: row for row in dress_rows}
        self.assertEqual(dress_by_grade["P"]["qty_on_hand"], 3)
        self.assertEqual(dress_by_grade["S"]["qty_on_hand"], 2)
        self.assertEqual(dress_by_grade["P"]["total_cost_kes"], 240)
        self.assertEqual(dress_by_grade["S"]["total_cost_kes"], 120)

        packed_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("store_prep_bale_no") == completed["prepared_bale_no"]
        ]
        self.assertEqual(len(packed_tokens), 5)
        self.assertCountEqual(
            [row.get("token_no") for row in packed_tokens],
            [row.get("token_no") for row in suspended_tokens],
        )
        packed_grade_counts = {
            grade: len([row for row in packed_tokens if row.get("grade") == grade])
            for grade in {"P", "S"}
        }
        self.assertEqual(packed_grade_counts, {"P": 3, "S": 2})
        self.assertTrue(all(row["status"] == "packed_waiting_store_dispatch" for row in packed_tokens))

    def test_sale_compression_task_estimates_grade_mix_and_keeps_sorted_stock_undeducted(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423SALEP",
            category_name="dress / 2 pieces",
            grade="P",
            qty=16,
            estimated_unit_cost_kes=80,
        )
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423SALES",
            category_name="dress / 2 pieces",
            grade="S",
            qty=4,
            estimated_unit_cost_kes=50,
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "dress",
                "category_sub": "2 pieces",
                "standard_weight_kg": 2,
            },
            updated_by="warehouse_supervisor_1",
        )

        created = self.state.create_store_prep_bale_task(
            {
                "task_type": "sale",
                "category_sub": "2 pieces",
                "target_weight_kg": 40,
                "ratio_label": "A",
                "grade_ratios": [
                    {"grade": "P", "ratio_pct": 80},
                    {"grade": "S", "ratio_pct": 20},
                ],
                "assigned_employee": "warehouse_clerk_2",
                "note": "build sale bale with graded mix",
                "created_by": "warehouse_supervisor_1",
            }
        )

        self.assertEqual(created["task_type"], "sale")
        self.assertEqual(created["target_weight_kg"], 40)
        self.assertEqual(created["target_qty"], 20)
        self.assertEqual(created["available_qty"], 0)
        self.assertEqual(created["suspended_qty"], 20)
        self.assertEqual(created["ratio_label"], "A")
        self.assertEqual(created["ratio_summary"], "P80% / S20%")
        self.assertEqual(
            created["grade_requirements"],
            [
                {"grade": "P", "qty": 16},
                {"grade": "S", "qty": 4},
            ],
        )

        suspended_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("sale_prep_task_no") == created["task_no"]
        ]
        self.assertEqual(len(suspended_tokens), 20)
        self.assertTrue(all(row["status"] == "reserved_waiting_bale_sale" for row in suspended_tokens))

        stock_rows = self.state.list_sorting_stock()
        dress_rows = [row for row in stock_rows if row["category_name"] == "dress / 2 pieces"]
        dress_by_grade = {row["grade"]: row for row in dress_rows}
        self.assertEqual(dress_by_grade["P"]["qty_on_hand"], 16)
        self.assertEqual(dress_by_grade["S"]["qty_on_hand"], 4)
        self.assertEqual(dress_by_grade["P"]["total_cost_kes"], 1280)
        self.assertEqual(dress_by_grade["S"]["total_cost_kes"], 200)

        with self.assertRaises(HTTPException) as insufficient_ctx:
            self.state.create_store_prep_bale_task(
                {
                    "task_type": "sale",
                    "category_sub": "2 pieces",
                    "target_weight_kg": 35,
                    "ratio_label": "B",
                    "grade_ratios": [
                        {"grade": "P", "ratio_pct": 50},
                        {"grade": "S", "ratio_pct": 50},
                    ],
                    "assigned_employee": "warehouse_clerk_1",
                    "note": "should fail because current pieces are already suspended",
                    "created_by": "warehouse_supervisor_1",
                }
            )

        self.assertEqual(insufficient_ctx.exception.status_code, 409)
        self.assertIn("当前只有 0 件可打包", str(insufficient_ctx.exception.detail))

        completed = self.state.complete_store_prep_bale_task(
            created["task_no"],
            {
                "updated_by": "warehouse_supervisor_1",
                "actual_weight_kg": 40,
                "note": "sale bale packed and parked",
            },
        )

        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["task_type"], "sale")
        self.assertEqual(completed["packed_qty"], 20)
        self.assertEqual(completed["grade_summary"], "P 16 件 / S 4 件")
        self.assertEqual(completed["total_cost_kes"], 1480)

        prep_bales = self.state.list_store_prep_bales()
        self.assertEqual(len(prep_bales), 1)
        self.assertEqual(prep_bales[0]["task_type"], "sale")
        self.assertEqual(prep_bales[0]["status"], "waiting_bale_sale")
        self.assertEqual(prep_bales[0]["ratio_label"], "A")
        self.assertEqual(prep_bales[0]["ratio_summary"], "P80% / S20%")

        packed_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("sale_prep_bale_no") == completed["prepared_bale_no"]
        ]
        self.assertEqual(len(packed_tokens), 20)
        self.assertCountEqual(
            [row.get("token_no") for row in packed_tokens],
            [row.get("token_no") for row in suspended_tokens],
        )
        self.assertTrue(all(row["status"] == "packed_waiting_bale_sale" for row in packed_tokens))

    def test_store_dispatch_completion_accepts_actual_qty_and_releases_unused_reserved_tokens(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423ADJP",
            category_name="dress / 2 pieces",
            grade="P",
            qty=6,
            estimated_unit_cost_kes=80,
        )
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423ADJS",
            category_name="dress / 2 pieces",
            grade="S",
            qty=4,
            estimated_unit_cost_kes=60,
        )

        created = self.state.create_store_prep_bale_task(
            {
                "task_type": "store_dispatch",
                "category_sub": "2 pieces",
                "grade_requirements": [
                    {"grade": "P", "qty": 3},
                    {"grade": "S", "qty": 2},
                ],
                "assigned_employee": "warehouse_clerk_1",
                "note": "created for actual qty check",
                "created_by": "warehouse_supervisor_1",
            }
        )

        reserved_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("store_prep_task_no") == created["task_no"]
        ]
        self.assertEqual(len(reserved_tokens), 5)

        completed = self.state.complete_store_prep_bale_task(
            created["task_no"],
            {
                "updated_by": "warehouse_supervisor_1",
                "actual_qty": 4,
                "note": "主管评价：实际只压出 4 件",
            },
        )

        self.assertEqual(completed["packed_qty"], 4)
        self.assertEqual(completed["note"], "主管评价：实际只压出 4 件")
        self.assertEqual(completed["grade_summary"], "P 3 件 / S 1 件")
        self.assertEqual(completed["total_cost_kes"], 300)

        packed_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("store_prep_bale_no") == completed["prepared_bale_no"]
        ]
        released_tokens = [
            row
            for row in reserved_tokens
            if str(row.get("store_prep_bale_no") or "").strip().upper() != completed["prepared_bale_no"]
        ]
        self.assertEqual(len(packed_tokens), 4)
        self.assertEqual(len(released_tokens), 1)
        self.assertTrue(all(row["status"] == "packed_waiting_store_dispatch" for row in packed_tokens))
        self.assertTrue(all(row["status"] == "pending_store_print" for row in released_tokens))
        self.assertTrue(all(not str(row.get("store_prep_task_no") or "").strip() for row in released_tokens))

        stock_rows = self.state.list_sorting_stock()
        dress_rows = [row for row in stock_rows if row["category_name"] == "dress / 2 pieces"]
        dress_by_grade = {row["grade"]: row for row in dress_rows}
        self.assertEqual(dress_by_grade["P"]["qty_on_hand"], 3)
        self.assertEqual(dress_by_grade["S"]["qty_on_hand"], 3)

    def test_store_dispatch_completion_rejects_actual_qty_larger_than_reserved(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423QTYCHK",
            category_name="dress / 2 pieces",
            grade="P",
            qty=5,
            estimated_unit_cost_kes=80,
        )

        created = self.state.create_store_prep_bale_task(
            {
                "task_type": "store_dispatch",
                "category_sub": "2 pieces",
                "target_qty": 5,
                "assigned_employee": "warehouse_clerk_1",
                "note": "created for over-acceptance validation",
                "created_by": "warehouse_supervisor_1",
            }
        )

        reserved_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("store_prep_task_no") == created["task_no"]
        ]
        self.assertEqual(len(reserved_tokens), 5)

        with self.assertRaises(HTTPException) as ctx:
            self.state.complete_store_prep_bale_task(
                created["task_no"],
                {
                    "updated_by": "warehouse_supervisor_1",
                    "actual_qty": 6,
                    "note": "should fail because actual qty cannot exceed suspended qty",
                },
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("不能大于当前已悬挂的 5 件", str(ctx.exception.detail))

        task = self.state.list_store_prep_bale_tasks(status="open")[0]
        self.assertEqual(task["task_no"], created["task_no"])
        self.assertEqual(task["status"], "open")
        self.assertEqual(task["suspended_qty"], 5)

        still_reserved_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("store_prep_task_no") == created["task_no"]
        ]
        self.assertEqual(len(still_reserved_tokens), 5)
        self.assertTrue(all(row["status"] == "reserved_waiting_store_dispatch" for row in still_reserved_tokens))

    def test_sale_completion_requires_actual_weight_and_releases_unused_reserved_tokens(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423SALE2P",
            category_name="dress / 2 pieces",
            grade="P",
            qty=16,
            estimated_unit_cost_kes=80,
        )
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423SALE2S",
            category_name="dress / 2 pieces",
            grade="S",
            qty=4,
            estimated_unit_cost_kes=50,
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "dress",
                "category_sub": "2 pieces",
                "standard_weight_kg": 2,
            },
            updated_by="warehouse_supervisor_1",
        )

        created = self.state.create_store_prep_bale_task(
            {
                "task_type": "sale",
                "category_sub": "2 pieces",
                "target_weight_kg": 40,
                "ratio_label": "A",
                "grade_ratios": [
                    {"grade": "P", "ratio_pct": 80},
                    {"grade": "S", "ratio_pct": 20},
                ],
                "assigned_employee": "warehouse_clerk_2",
                "note": "created for actual weight check",
                "created_by": "warehouse_supervisor_1",
            }
        )

        with self.assertRaises(HTTPException) as missing_weight_ctx:
            self.state.complete_store_prep_bale_task(
                created["task_no"],
                {
                    "updated_by": "warehouse_supervisor_1",
                    "actual_qty": 18,
                    "note": "missing weight should fail",
                },
            )

        self.assertEqual(missing_weight_ctx.exception.status_code, 400)
        self.assertIn("实际重量", str(missing_weight_ctx.exception.detail))

        reserved_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("sale_prep_task_no") == created["task_no"]
        ]
        self.assertEqual(len(reserved_tokens), 20)

        completed = self.state.complete_store_prep_bale_task(
            created["task_no"],
            {
                "updated_by": "warehouse_supervisor_1",
                "actual_qty": 18,
                "actual_weight_kg": 38.5,
                "note": "主管评价：已核重",
            },
        )

        self.assertEqual(completed["packed_qty"], 18)
        self.assertEqual(completed["actual_weight_kg"], 38.5)
        self.assertEqual(completed["grade_summary"], "P 16 件 / S 2 件")
        self.assertEqual(completed["note"], "主管评价：已核重")

        prep_bales = self.state.list_store_prep_bales()
        self.assertEqual(prep_bales[0]["qty"], 18)
        self.assertEqual(prep_bales[0]["actual_weight_kg"], 38.5)

        packed_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("sale_prep_bale_no") == completed["prepared_bale_no"]
        ]
        released_tokens = [
            row
            for row in reserved_tokens
            if str(row.get("sale_prep_bale_no") or "").strip().upper() != completed["prepared_bale_no"]
        ]
        self.assertEqual(len(packed_tokens), 18)
        self.assertEqual(len(released_tokens), 2)
        self.assertTrue(all(row["status"] == "packed_waiting_bale_sale" for row in packed_tokens))
        self.assertTrue(all(row["status"] == "pending_store_print" for row in released_tokens))
        self.assertTrue(all(not str(row.get("sale_prep_task_no") or "").strip() for row in released_tokens))

    def test_store_prep_bale_task_rejects_employee_if_open_sorting_task_already_uses_them(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423OCC2",
            category_name="dress / 2 pieces",
            grade="P",
            qty=5,
            estimated_unit_cost_kes=80,
        )
        shipment, bales, _, _ = self._create_ready_bales_with_source_cost(
            customs_notice_no="SORT240423OCC",
            total_source_cost_kes=400,
            package_count=1,
            unit_weight_kg=40,
            category_name="dress / 2 pieces",
        )
        self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "occupy sorter with open sorting task",
                "created_by": "warehouse_supervisor_1",
            }
        )

        with self.assertRaises(HTTPException) as ctx:
            self.state.create_store_prep_bale_task(
                {
                    "task_type": "store_dispatch",
                    "category_sub": "2 pieces",
                    "grade_requirements": [{"grade": "P", "qty": 5}],
                    "assigned_employee": "warehouse_clerk_1",
                    "note": "should fail because sorter is busy elsewhere",
                    "created_by": "warehouse_supervisor_1",
                }
            )

        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("warehouse_clerk_1", str(ctx.exception.detail))
        self.assertIn("分拣任务", str(ctx.exception.detail))

    def test_multiple_same_day_sorting_tasks_keep_distinct_item_tokens(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423A",
            category_name="pants / jeans pant",
            grade="P",
            qty=5,
            estimated_unit_cost_kes=122,
        )
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423B",
            category_name="dress / short dress",
            grade="P",
            qty=6,
            estimated_unit_cost_kes=138,
        )

        jeans_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("category_name") == "pants / jeans pant"
        ]
        dress_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if row.get("category_name") == "dress / short dress"
        ]

        self.assertEqual(len(jeans_tokens), 5)
        self.assertEqual(len(dress_tokens), 6)

    def test_reload_reconciles_missing_item_tokens_for_store_prep_inventory(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423C",
            category_name="pants / jeans pant",
            grade="P",
            qty=5,
            estimated_unit_cost_kes=122,
        )

        jeans_token_nos = [
            row["token_no"]
            for row in self.state.list_item_barcode_tokens()
            if row.get("category_name") == "pants / jeans pant"
        ]
        self.assertEqual(len(jeans_token_nos), 5)

        for token_no in jeans_token_nos:
            del self.state.item_barcode_tokens[token_no]
        self.state._persist()

        reloaded_state = InMemoryState()
        jeans_tokens = [
            row
            for row in reloaded_state.list_item_barcode_tokens()
            if row.get("category_name") == "pants / jeans pant"
        ]
        self.assertEqual(len(jeans_tokens), 5)

        created = reloaded_state.create_store_prep_bale_task(
            {
                "category_sub": "jeans pant",
                "target_qty": 5,
                "assigned_employee": "warehouse_clerk_1",
                "note": "recovered after reload",
                "created_by": "warehouse_supervisor_1",
            }
        )
        self.assertEqual(created["available_qty"], 0)
        self.assertEqual(created["suspended_qty"], 5)

    def test_store_prep_bale_can_queue_warehouseout_print_job_for_bale_modal_preview(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423PRINTP",
            category_name="dress / 2 pieces",
            grade="P",
            qty=5,
            estimated_unit_cost_kes=80,
        )
        created = self.state.create_store_prep_bale_task(
            {
                "category_sub": "2 pieces",
                "target_qty": 5,
                "assigned_employee": "warehouse_clerk_1",
                "note": "ready for print queue",
                "created_by": "warehouse_supervisor_1",
            }
        )
        completed = self.state.complete_store_prep_bale_task(
            created["task_no"],
            {
                "updated_by": "warehouse_supervisor_1",
                "actual_qty": 5,
                "note": "主管评价：验收完成",
            },
        )

        job = self.state.queue_store_prep_bale_print_job(
            completed["prepared_bale_no"],
            requested_by="warehouse_supervisor_1",
            template_code="wait_for_transtoshop",
        )

        self.assertEqual(job["job_type"], "bale_barcode_label")
        self.assertEqual(job["barcode"], completed["prepared_bale_barcode"])
        self.assertEqual(job["print_payload"]["bale_barcode"], completed["prepared_bale_barcode"])
        self.assertEqual(job["print_payload"]["parcel_batch_no"], completed["prepared_bale_no"])
        self.assertEqual(job["template_code"], "wait_for_transtoshop")
        self.assertEqual(job["print_payload"]["template_scope"], "warehouseout_bale")
        self.assertEqual(job["print_payload"]["status"], "WAITING FOR STORE DISPATCH")
        self.assertEqual(job["print_payload"]["qty"], "5")
        self.assertEqual(job["print_payload"]["dispatch_bale_no"], completed["prepared_bale_barcode"])

    def test_store_prep_sale_bale_defaults_to_wait_for_sale_template(self):
        self._create_confirmed_sorting_inventory(
            customs_notice_no="SORT240423SALEP",
            category_name="dress / 2 pieces",
            grade="P",
            qty=5,
            estimated_unit_cost_kes=80,
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "dress",
                "category_sub": "2 pieces",
                "standard_weight_kg": 2,
            },
            updated_by="warehouse_supervisor_1",
        )
        created = self.state.create_store_prep_bale_task(
            {
                "task_type": "sale",
                "category_sub": "2 pieces",
                "target_weight_kg": 10,
                "assigned_employee": "warehouse_clerk_1",
                "note": "sale print queue",
                "created_by": "warehouse_supervisor_1",
                "grade_ratios": [{"grade": "P", "ratio_pct": 100}],
            }
        )
        completed = self.state.complete_store_prep_bale_task(
            created["task_no"],
            {
                "updated_by": "warehouse_supervisor_1",
                "actual_weight_kg": 10,
                "note": "sale验收完成",
            },
        )

        job = self.state.queue_store_prep_bale_print_job(
            completed["prepared_bale_no"],
            requested_by="warehouse_supervisor_1",
        )

        self.assertEqual(job["template_code"], "wait_for_sale")
        self.assertEqual(job["print_payload"]["template_scope"], "warehouseout_bale")
        self.assertEqual(job["print_payload"]["status"], "wait for sale")

    def test_reload_preserves_existing_main_flow_records(self):
        self.state.create_or_update_china_source_record(
            {
                "source_pool_token": "CN-SRC-GOSUQIN6862022-01",
                "container_type": "40HQ",
                "customs_notice_no": "GOSUQ I N6862022",
                "lines": [
                    {
                        "source_bale_token": "CN-SRC-GOSUQIN6862022-01-001",
                        "supplier_name": "YouXun",
                        "category_main": "Dress",
                        "category_sub": "Summer Dress",
                        "package_count": 3,
                        "unit_weight_kg": 40,
                        "unit_cost_amount": 120,
                        "unit_cost_currency": "CNY",
                    }
                ],
            },
            created_by="warehouse_clerk_1",
        )
        shipment = self.state.create_inbound_shipment(
            {
                "shipment_type": "sea",
                "customs_notice_no": "GOSUQ I N6862022",
                "unload_date": "2026-04-21 09:42",
                "coc_goods_manifest": "reload regression",
                "note": "",
                "coc_documents": [],
            }
        )
        self.state.create_parcel_batch(
            {
                "intake_type": "sea_freight",
                "inbound_shipment_no": shipment["shipment_no"],
                "supplier_name": "YouXun",
                "cargo_type": "summer apparel",
                "category_main": "Dress",
                "category_sub": "Summer Dress",
                "package_count": 3,
                "total_weight": 120,
                "received_by": "warehouse_clerk_1",
                "note": "reload regression",
                "source_bale_token": "CN-SRC-GOSUQIN6862022-01-001",
            }
        )
        self.state.confirm_inbound_shipment_intake(
            shipment["shipment_no"],
            {
                "declared_total_packages": 3,
                "confirmed_by": "warehouse_supervisor_1",
                "note": "confirmed for reload regression",
            },
        )
        self.state.generate_bale_barcodes(shipment["shipment_no"], "warehouse_supervisor_1")

        reloaded = InMemoryState()

        self.assertEqual(len(reloaded.china_source_records), 1)
        self.assertEqual(len(reloaded.inbound_shipments), 1)
        self.assertEqual(len(reloaded.parcel_batches), 1)
        self.assertEqual(len(reloaded.bale_barcodes), 3)
        self.assertIn("GOSUQ I N6862022-2026-04-21", reloaded.inbound_shipments)

    def test_bale_template_defaults_and_normalization_keep_60x40_scan_safe(self):
        layout = self.state._default_bale_template_layout(60, 40)
        headline = next(component for component in layout["components"] if component["id"] == "headline")
        barcode = next(component for component in layout["components"] if component["id"] == "barcode")

        self.assertEqual(headline["content_source"], "supplier_package")
        self.assertLessEqual(headline["h_mm"], 7.0)
        self.assertLessEqual(headline["font_size"], 9)
        self.assertGreaterEqual(barcode["h_mm"], 14)

        normalized = self.state._normalize_label_template_layout(
            "bale",
            {
                "components": [
                    {
                        "id": "barcode",
                        "enabled": True,
                        "x_mm": 2,
                        "y_mm": 12,
                        "w_mm": 8,
                        "h_mm": 3,
                    }
                ]
            },
            60,
            40,
        )
        barcode_after = next(component for component in normalized["components"] if component["id"] == "barcode")

        self.assertEqual(barcode_after["w_mm"], 24)
        self.assertEqual(barcode_after["h_mm"], 10)

    def test_custom_warehouse_in_template_is_seeded_and_keeps_custom_components(self):
        template = self.state.get_label_template("warehouse_in", template_scope="bale")

        self.assertEqual(template["name"], "warehouse in")
        self.assertEqual(template["template_scope"], "bale")
        self.assertTrue(template["is_active"])

        component_ids = [component["id"] for component in template["layout"]["components"]]
        self.assertIn("warehouse_in_top_supplier", component_ids)
        self.assertIn("warehouse_in_middle_divider", component_ids)
        self.assertIn("warehouse_in_lower_vertical_divider", component_ids)
        self.assertNotIn("headline", component_ids)

        divider_types = {
            component["id"]: component["type"]
            for component in template["layout"]["components"]
            if component["id"] in {"warehouse_in_top_divider", "warehouse_in_middle_divider", "warehouse_in_lower_vertical_divider"}
        }
        self.assertEqual(
            divider_types,
            {
                "warehouse_in_top_divider": "line",
                "warehouse_in_middle_divider": "line",
                "warehouse_in_lower_vertical_divider": "line",
            },
        )

    def test_list_bale_label_templates_only_returns_warehouse_in(self):
        templates = self.state.list_label_templates(template_scope="bale")

        self.assertEqual(
            [row["template_code"] for row in templates],
            ["warehouse_in"],
        )

    def test_transtoshop_template_is_seeded_with_warehouseout_scope(self):
        template = self.state.get_label_template("transtoshop", template_scope="warehouseout_bale")

        self.assertEqual(template["template_code"], "transtoshop")
        self.assertEqual(template["name"], "transtoshop")
        self.assertEqual(template["template_scope"], "warehouseout_bale")
        self.assertEqual(template["paper_preset"], "60x40")

        component_ids = [component["id"] for component in template["layout"]["components"]]
        self.assertIn("transtoshop_store_name", component_ids)
        self.assertIn("transtoshop_total_quantity", component_ids)
        self.assertIn("transtoshop_packing_list", component_ids)
        self.assertIn("transtoshop_barcode", component_ids)

    def test_list_label_templates_includes_transtoshop_without_changing_bale_filter(self):
        template_codes = [row["template_code"] for row in self.state.list_label_templates()]

        self.assertIn("transtoshop", template_codes)
        self.assertEqual(
            [row["template_code"] for row in self.state.list_label_templates(template_scope="bale")],
            ["warehouse_in"],
        )

    def test_wait_templates_are_seeded_with_warehouseout_scope(self):
        transtoshop_wait = self.state.get_label_template("wait_for_transtoshop", template_scope="warehouseout_bale")
        loose_pick = self.state.get_label_template("store_loose_pick_60x40", template_scope="warehouseout_bale")
        sale_wait = self.state.get_label_template("wait_for_sale", template_scope="warehouseout_bale")

        self.assertEqual(transtoshop_wait["template_code"], "wait_for_transtoshop")
        self.assertEqual(transtoshop_wait["name"], "WAITING FOR STORE DISPATCH")
        self.assertEqual(transtoshop_wait["template_scope"], "warehouseout_bale")
        self.assertEqual(transtoshop_wait["paper_preset"], "60x40")
        self.assertEqual(sale_wait["template_code"], "wait_for_sale")
        self.assertEqual(sale_wait["name"], "wait for sale")
        self.assertEqual(sale_wait["template_scope"], "warehouseout_bale")
        self.assertEqual(sale_wait["paper_preset"], "60x40")
        self.assertEqual(loose_pick["template_code"], "store_loose_pick_60x40")
        self.assertEqual(loose_pick["name"], "门店补差拣货单 60x40")
        self.assertEqual(loose_pick["template_scope"], "warehouseout_bale")
        self.assertEqual(loose_pick["paper_preset"], "60x40")
        self.assertIn("packing_list", loose_pick["fields"])

        wait_component_ids = [component["id"] for component in transtoshop_wait["layout"]["components"]]
        loose_component_ids = [component["id"] for component in loose_pick["layout"]["components"]]
        sale_component_ids = [component["id"] for component in sale_wait["layout"]["components"]]
        self.assertIn("wait_for_transtoshop_status", wait_component_ids)
        self.assertIn("wait_for_transtoshop_barcode", wait_component_ids)
        self.assertIn("store_loose_pick_status", loose_component_ids)
        self.assertIn("store_loose_pick_packing_list", loose_component_ids)
        self.assertIn("store_loose_pick_barcode", loose_component_ids)
        loose_components = {component["id"]: component for component in loose_pick["layout"]["components"]}
        self.assertLess(loose_components["store_loose_pick_barcode"]["x_mm"], 31)
        self.assertLess(loose_components["store_loose_pick_code"]["x_mm"], 31)
        self.assertEqual(loose_components["store_loose_pick_packing_list"]["content_source"], "packing_list")
        self.assertAlmostEqual(loose_components["store_loose_pick_packing_list"]["x_mm"], 2.4)
        self.assertAlmostEqual(loose_components["store_loose_pick_packing_list"]["h_mm"], 9.0)
        self.assertIn("wait_for_sale_status", sale_component_ids)
        self.assertIn("wait_for_sale_weight", sale_component_ids)

    def test_list_label_templates_includes_wait_templates_without_unlocking_bale_scope(self):
        template_codes = [row["template_code"] for row in self.state.list_label_templates()]

        self.assertIn("wait_for_transtoshop", template_codes)
        self.assertIn("store_loose_pick_60x40", template_codes)
        self.assertIn("wait_for_sale", template_codes)
        self.assertEqual(
            [row["template_code"] for row in self.state.list_label_templates(template_scope="bale")],
            ["warehouse_in"],
        )

    def test_clothes_retail_template_is_seeded_with_product_scope(self):
        template = self.state.get_label_template("clothes_retail", template_scope="product")

        self.assertEqual(template["template_code"], "clothes_retail")
        self.assertEqual(template["name"], "clothes retail")
        self.assertEqual(template["template_scope"], "product")
        self.assertEqual(template["paper_preset"], "60x40")
        self.assertEqual(template["width_mm"], 60)
        self.assertEqual(template["height_mm"], 40)

        component_ids = [component["id"] for component in template["layout"]["components"]]
        self.assertIn("clothes_retail_price", component_ids)
        self.assertIn("clothes_retail_product_name", component_ids)
        self.assertIn("clothes_retail_barcode", component_ids)

    def test_product_label_print_job_uses_clothes_retail_dimensions(self):
        self.state.products[999] = {
            "id": 999,
            "product_code": "PRD-999",
            "barcode": "420200000001",
            "product_name": "short dress",
            "category_main": "dress",
            "category_sub": "short dress",
            "supplier_code": "SUP-001",
            "supplier_name": "YCUXUR",
            "cost_price": 320.0,
            "launch_price": 890.0,
            "rack_code": "A12",
            "label_template_code": "clothes_retail",
            "created_by": "system",
            "created_at": "2026-04-23T00:00:00+00:00",
        }
        self.state.product_by_barcode["420200000001"] = 999

        job = self.state.create_label_print_job(
            {
                "barcode": "420200000001",
                "copies": 1,
                "printer_name": "Deli DL-720C",
                "requested_by": "warehouse_supervisor_1",
            }
        )

        self.assertEqual(job["template_code"], "clothes_retail")
        self.assertEqual(job["label_size"], "60x40")
        self.assertEqual(job["print_payload"]["template_code"], "clothes_retail")
        self.assertEqual(job["print_payload"]["label_size"], "60x40")

    def test_department_retail_template_is_seeded_with_product_scope(self):
        template = self.state.get_label_template("department_retail", template_scope="product")

        self.assertEqual(template["template_code"], "department_retail")
        self.assertEqual(template["name"], "department retail")
        self.assertEqual(template["template_scope"], "product")
        self.assertEqual(template["paper_preset"], "40x30")
        self.assertEqual(template["width_mm"], 40)
        self.assertEqual(template["height_mm"], 30)

        component_ids = [component["id"] for component in template["layout"]["components"]]
        self.assertIn("department_retail_price", component_ids)
        self.assertIn("department_retail_product_name", component_ids)
        self.assertIn("department_retail_barcode", component_ids)

    def test_product_label_print_job_uses_department_retail_dimensions(self):
        self.state.products[1000] = {
            "id": 1000,
            "product_code": "PRD-1000",
            "barcode": "420300000018",
            "product_name": "wire basket",
            "category_main": "home",
            "category_sub": "wire basket",
            "supplier_code": "SUP-002",
            "supplier_name": "MINIGOODS",
            "cost_price": 180.0,
            "launch_price": 590.0,
            "rack_code": "B12",
            "label_template_code": "department_retail",
            "created_by": "system",
            "created_at": "2026-04-23T00:00:00+00:00",
        }
        self.state.product_by_barcode["420300000018"] = 1000

        job = self.state.create_label_print_job(
            {
                "barcode": "420300000018",
                "copies": 1,
                "printer_name": "Deli DL-720C",
                "requested_by": "warehouse_supervisor_1",
            }
        )

        self.assertEqual(job["template_code"], "department_retail")
        self.assertEqual(job["label_size"], "40x30")
        self.assertEqual(job["print_payload"]["template_code"], "department_retail")
        self.assertEqual(job["print_payload"]["label_size"], "40x30")

    def test_hydrate_label_templates_removes_legacy_bale_templates(self):
        self.state.label_templates["bale_60x40"] = {
            "template_code": "bale_60x40",
            "name": "legacy bale",
            "template_scope": "bale",
            "width_mm": 60,
            "height_mm": 40,
            "paper_preset": "60x40",
            "barcode_type": "Code128",
            "fields": ["barcode_value"],
            "layout": {"components": []},
            "is_active": True,
            "created_at": "2026-04-22T00:00:00+00:00",
            "created_by": "system",
            "updated_at": "2026-04-22T00:00:00+00:00",
            "updated_by": "system",
        }

        updated = self.state._hydrate_label_templates()

        self.assertTrue(updated)
        self.assertNotIn("bale_60x40", self.state.label_templates)
        self.assertEqual(
            [row["template_code"] for row in self.state.list_label_templates(template_scope="bale")],
            ["warehouse_in"],
        )

    def test_save_non_warehouse_bale_template_is_rejected(self):
        with self.assertRaises(HTTPException):
            self.state.save_label_template(
                {
                    "template_code": "bale_60x40",
                    "name": "legacy bale",
                    "template_scope": "bale",
                    "description": "should be blocked",
                    "width_mm": 60,
                    "height_mm": 40,
                    "paper_preset": "60x40",
                    "barcode_type": "Code128",
                    "fields": ["barcode_value"],
                    "layout": {"components": []},
                    "is_active": True,
                },
                updated_by="warehouse_supervisor_1",
            )

    def test_legacy_bale_template_request_is_forced_to_warehouse_in(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="RAW240428")

        queued = self.state.queue_bale_barcode_print_jobs(
            shipment["shipment_no"],
            [{"bale_barcode": bales[0]["bale_barcode"], "copies": 1}],
            requested_by="warehouse_supervisor_1",
            template_code="bale_60x40",
        )

        job = queued["print_jobs"][0]
        self.assertEqual(job["template_code"], "warehouse_in")
        self.assertEqual(job["print_payload"]["template_code"], "warehouse_in")

    def test_sorting_task_can_mix_bales_from_multiple_shipments(self):
        first_shipment, first_bales = self._create_ready_bales(customs_notice_no="RAW240425")
        second_shipment, second_bales = self._create_ready_bales(customs_notice_no="RAW240426")

        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [first_bales[0]["bale_barcode"], second_bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1", "warehouse_clerk_2"],
                "note": "mix shipments in one sorting task",
                "created_by": "warehouse_supervisor_1",
            }
        )

        self.assertEqual(task["shipment_nos"], [first_shipment["shipment_no"], second_shipment["shipment_no"]])
        self.assertEqual(task["customs_notice_nos"], ["RAW240425", "RAW240426"])
        self.assertEqual(task["shipment_no"], "MULTI")
        self.assertEqual(task["customs_notice_no"], "MULTI")

    def test_sorting_results_keep_pending_cost_when_source_link_missing_even_if_client_forces_lock(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="RAW240428A")
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "backend must decide pending cost",
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
                        "actual_weight_kg": 2,
                        "qty": 2,
                        "confirm_to_inventory": True,
                    }
                ],
                "note": "client tried to force lock without source link",
                "mark_task_completed": True,
                "cost_status_override": "cost_locked",
                "estimated_unit_cost_kes": 999,
                "cost_model_code": "fake_client_model",
                "source_bale_tokens": ["CLIENT-WRONG-001"],
                "source_pool_tokens": ["CLIENT-WRONG"],
            },
        )

        self.assertEqual(result["shipment_no"], shipment["shipment_no"])
        self.assertEqual(result["cost_status"], "pending_source_link")
        self.assertIsNone(result["unit_cost_kes"])
        self.assertEqual(result["cost_model_code"], "")
        self.assertIsNone(result["cost_locked_at"])
        self.assertEqual(result["source_bale_token_count"], 0)
        self.assertEqual(result["source_pool_token_count"], 0)
        self.assertEqual(result["result_items"][0]["cost_status"], "pending_source_link")
        self.assertIsNone(result["result_items"][0]["unit_cost_kes"])
        self.assertIsNone(result["result_items"][0]["total_cost_kes"])

        stock_row = next(row for row in self.state.list_sorting_stock() if row["sku_code"] == "TOPSLADY-P-018500")
        self.assertEqual(stock_row["default_cost_kes"], 185)
        self.assertIsNone(stock_row["unit_cost_kes"])
        self.assertIsNone(stock_row["total_cost_kes"])

        token_rows = self.state.list_item_barcode_tokens(task_no=task["task_no"])
        self.assertEqual(len(token_rows), 2)
        self.assertTrue(all(row["cost_status"] == "pending_source_link" for row in token_rows))
        self.assertTrue(all(row["unit_cost_kes"] is None for row in token_rows))
        self.assertTrue(all(row["cost_model_code"] == "" for row in token_rows))
        self.assertTrue(all(row["source_pool_tokens"] == [] for row in token_rows))

    def test_sorting_results_backend_computes_weighted_cost_and_ignores_client_overrides(self):
        shipment, bales, source_pool_token, source_bale_token = self._create_ready_bales_with_source_cost(
            customs_notice_no="RAW240428SRC",
            total_source_cost_kes=800,
            package_count=1,
            unit_weight_kg=8,
            category_name="tops / lady tops",
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "tops",
                "category_sub": "lady tops",
                "standard_weight_kg": 1,
                "note": "weighted v2 top",
            },
            updated_by="warehouse_supervisor_1",
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "dress",
                "category_sub": "short dress",
                "standard_weight_kg": 3,
                "note": "weighted v2 dress",
            },
            updated_by="warehouse_supervisor_1",
        )
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "backend weighted cost lock",
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
                        "actual_weight_kg": 2,
                        "qty": 2,
                        "confirm_to_inventory": True,
                        "estimated_unit_cost_kes": 999,
                    },
                    {
                        "category_name": "dress / short dress",
                        "grade": "P",
                        "actual_weight_kg": 6,
                        "qty": 2,
                        "confirm_to_inventory": True,
                        "estimated_unit_cost_kes": 888,
                    },
                ],
                "note": "client overrides must be ignored",
                "mark_task_completed": True,
                "cost_status_override": "pending_allocation",
                "estimated_unit_cost_kes": 777,
                "cost_model_code": "fake_client_model",
                "source_bale_tokens": ["CLIENT-WRONG-001"],
                "source_pool_tokens": ["CLIENT-WRONG"],
            },
        )

        self.assertEqual(result["shipment_no"], shipment["shipment_no"])
        self.assertEqual(result["cost_status"], "cost_locked")
        self.assertEqual(result["cost_model_code"], "sorting_actual_weight_v3")
        self.assertEqual(result["unit_cost_kes"], 200.0)
        self.assertIsNotNone(result["cost_locked_at"])
        self.assertEqual(result["source_bale_token_count"], 1)
        self.assertEqual(result["source_pool_token_count"], 1)

        top_row = result["result_items"][0]
        dress_row = result["result_items"][1]
        self.assertEqual(top_row["unit_cost_kes"], 100.0)
        self.assertEqual(top_row["total_cost_kes"], 200.0)
        self.assertEqual(dress_row["unit_cost_kes"], 300.0)
        self.assertEqual(dress_row["total_cost_kes"], 600.0)

        token_rows = self.state.list_item_barcode_tokens(task_no=task["task_no"])
        self.assertEqual(len(token_rows), 4)
        self.assertEqual(
            [row["unit_cost_kes"] for row in token_rows],
            [100.0, 100.0, 300.0, 300.0],
        )
        self.assertTrue(all(row["cost_status"] == "cost_locked" for row in token_rows))
        self.assertTrue(all(row["cost_model_code"] == "sorting_actual_weight_v3" for row in token_rows))
        self.assertTrue(all(row["source_pool_tokens"] == [source_pool_token] for row in token_rows))
        self.assertTrue(all(row["suggested_price_kes"] is not None for row in token_rows))

        source_linked_bales = [
            row for row in self.state.list_raw_bales(shipment_no=shipment["shipment_no"])
            if row["bale_barcode"] == bales[0]["bale_barcode"]
        ]
        self.assertEqual(source_linked_bales[0]["source_bale_token"], source_bale_token)

    def test_sorting_results_weighted_unit_cost_changes_with_result_qty_mix(self):
        shipment, bales, _, _ = self._create_ready_bales_with_source_cost(
            customs_notice_no="RAW240428QTYMIX",
            total_source_cost_kes=800,
            package_count=1,
            unit_weight_kg=8,
            category_name="tops / lady tops",
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "tops",
                "category_sub": "lady tops",
                "standard_weight_kg": 1,
                "note": "qty mix top",
            },
            updated_by="warehouse_supervisor_1",
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "dress",
                "category_sub": "short dress",
                "standard_weight_kg": 3,
                "note": "qty mix dress",
            },
            updated_by="warehouse_supervisor_1",
        )
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "qty mix cost lock",
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
                        "actual_weight_kg": 2,
                        "qty": 2,
                        "confirm_to_inventory": True,
                        "default_cost_kes": 185,
                    },
                    {
                        "category_name": "dress / short dress",
                        "grade": "P",
                        "actual_weight_kg": 6,
                        "qty": 1,
                        "confirm_to_inventory": True,
                        "default_cost_kes": 220,
                    },
                ],
                "mark_task_completed": True,
            },
        )

        top_row = result["result_items"][0]
        dress_row = result["result_items"][1]
        self.assertEqual(top_row["unit_cost_kes"], 100.0)
        self.assertEqual(top_row["total_cost_kes"], 200.0)
        self.assertEqual(dress_row["unit_cost_kes"], 600.0)
        self.assertEqual(dress_row["total_cost_kes"], 600.0)
        self.assertEqual(result["unit_cost_kes"], 266.67)

    def test_sorting_results_loss_weight_uses_sellable_kg_for_unit_cost(self):
        shipment, bales, _, _ = self._create_ready_bales_with_source_cost(
            customs_notice_no="RAW240428LOSSCOST",
            total_source_cost_kes=800,
            package_count=1,
            unit_weight_kg=8,
            category_name="tops / lady tops",
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "tops",
                "category_sub": "lady tops",
                "standard_weight_kg": 1,
                "note": "loss cost top",
            },
            updated_by="warehouse_supervisor_1",
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "dress",
                "category_sub": "short dress",
                "standard_weight_kg": 3,
                "note": "loss cost dress",
            },
            updated_by="warehouse_supervisor_1",
        )
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "loss cost uplift",
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
                        "actual_weight_kg": 2,
                        "qty": 2,
                        "confirm_to_inventory": True,
                        "default_cost_kes": 185,
                    },
                    {
                        "category_name": "dress / short dress",
                        "grade": "P",
                        "actual_weight_kg": 3,
                        "qty": 1,
                        "confirm_to_inventory": True,
                        "default_cost_kes": 220,
                    },
                ],
                "loss_record": {
                    "has_loss": True,
                    "loss_qty": 1,
                    "loss_weight_kg": 2,
                    "photos": [
                        {
                            "filename": "loss-1.jpg",
                            "content_type": "image/jpeg",
                            "data_url": "data:image/jpeg;base64,AA==",
                        }
                    ],
                    "note": "wet pieces",
                },
                "mark_task_completed": True,
            },
        )

        top_row = result["result_items"][0]
        dress_row = result["result_items"][1]
        self.assertEqual(top_row["unit_cost_kes"], 133.34)
        self.assertEqual(top_row["total_cost_kes"], 266.67)
        self.assertEqual(dress_row["unit_cost_kes"], 400.0)
        self.assertEqual(dress_row["total_cost_kes"], 400.0)
        self.assertEqual(result["unit_cost_kes"], 222.22)

    def test_sorting_results_reject_loss_weight_greater_than_source_weight(self):
        _, bales, _, _ = self._create_ready_bales_with_source_cost(
            customs_notice_no="RAW240428LOSSGT",
            total_source_cost_kes=800,
            package_count=1,
            unit_weight_kg=8,
            category_name="tops / lady tops",
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "tops",
                "category_sub": "lady tops",
                "standard_weight_kg": 1,
                "note": "loss validation top",
            },
            updated_by="warehouse_supervisor_1",
        )
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "loss greater than source",
                "created_by": "warehouse_supervisor_1",
            }
        )

        with self.assertRaises(HTTPException):
            self.state.submit_sorting_task_results(
                task["task_no"],
                {
                    "created_by": "warehouse_supervisor_1",
                    "result_items": [
                        {
                            "category_name": "tops / lady tops",
                            "grade": "P",
                            "actual_weight_kg": 1,
                            "qty": 2,
                            "confirm_to_inventory": True,
                            "default_cost_kes": 185,
                        },
                    ],
                    "loss_record": {
                        "has_loss": True,
                        "loss_qty": 1,
                        "loss_weight_kg": 8.01,
                        "photos": [
                            {
                                "filename": "loss-1.jpg",
                                "content_type": "image/jpeg",
                                "data_url": "data:image/jpeg;base64,AA==",
                            }
                        ],
                        "note": "impossible loss",
                    },
                    "mark_task_completed": True,
                },
            )

    def test_sorting_results_reject_loss_weight_equal_to_source_weight(self):
        _, bales, _, _ = self._create_ready_bales_with_source_cost(
            customs_notice_no="RAW240428LOSSEQ",
            total_source_cost_kes=800,
            package_count=1,
            unit_weight_kg=8,
            category_name="tops / lady tops",
        )
        self.state.upsert_apparel_piece_weight(
            {
                "category_main": "tops",
                "category_sub": "lady tops",
                "standard_weight_kg": 1,
                "note": "loss equal source validation top",
            },
            updated_by="warehouse_supervisor_1",
        )
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "loss equal source",
                "created_by": "warehouse_supervisor_1",
            }
        )

        with self.assertRaises(HTTPException):
            self.state.submit_sorting_task_results(
                task["task_no"],
                {
                    "created_by": "warehouse_supervisor_1",
                    "result_items": [
                        {
                            "category_name": "tops / lady tops",
                            "grade": "P",
                            "actual_weight_kg": 1,
                            "qty": 2,
                            "confirm_to_inventory": True,
                            "default_cost_kes": 185,
                        },
                    ],
                    "loss_record": {
                        "has_loss": True,
                        "loss_qty": 2,
                        "loss_weight_kg": 8,
                        "photos": [
                            {
                                "filename": "loss-1.jpg",
                                "content_type": "image/jpeg",
                                "data_url": "data:image/jpeg;base64,AA==",
                            }
                        ],
                        "note": "all source weight cannot be loss",
                    },
                    "mark_task_completed": True,
                },
            )

    def test_sorting_results_reject_result_weight_plus_loss_greater_than_source_weight(self):
        _, bales, _, _ = self._create_ready_bales_with_source_cost(
            customs_notice_no="RAW240428LOSSSUM",
            total_source_cost_kes=800,
            package_count=1,
            unit_weight_kg=8,
            category_name="tops / lady tops",
        )
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "result plus loss greater than source",
                "created_by": "warehouse_supervisor_1",
            }
        )

        with self.assertRaises(HTTPException):
            self.state.submit_sorting_task_results(
                task["task_no"],
                {
                    "created_by": "warehouse_supervisor_1",
                    "result_items": [
                        {
                            "category_name": "tops / lady tops",
                            "grade": "P",
                            "actual_weight_kg": 7.5,
                            "qty": 2,
                            "confirm_to_inventory": True,
                            "default_cost_kes": 185,
                        },
                    ],
                    "loss_record": {
                        "has_loss": True,
                        "loss_qty": 1,
                        "loss_weight_kg": 2,
                        "photos": [
                            {
                                "filename": "loss-1.jpg",
                                "content_type": "image/jpeg",
                                "data_url": "data:image/jpeg;base64,AA==",
                            }
                        ],
                        "note": "impossible result plus loss",
                    },
                    "mark_task_completed": True,
                },
            )

    def test_sorting_results_reject_result_weight_plus_loss_less_than_source_weight(self):
        _, bales, _, _ = self._create_ready_bales_with_source_cost(
            customs_notice_no="RAW240428LOSSLOW",
            total_source_cost_kes=800,
            package_count=1,
            unit_weight_kg=8,
            category_name="tops / lady tops",
        )
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "result plus loss less than source",
                "created_by": "warehouse_supervisor_1",
            }
        )

        with self.assertRaises(HTTPException):
            self.state.submit_sorting_task_results(
                task["task_no"],
                {
                    "created_by": "warehouse_supervisor_1",
                    "result_items": [
                        {
                            "category_name": "tops / lady tops",
                            "grade": "P",
                            "actual_weight_kg": 5,
                            "qty": 2,
                            "confirm_to_inventory": True,
                            "default_cost_kes": 185,
                        },
                    ],
                    "loss_record": {
                        "has_loss": True,
                        "loss_qty": 1,
                        "loss_weight_kg": 1,
                        "photos": [
                            {
                                "filename": "loss-1.jpg",
                                "content_type": "image/jpeg",
                                "data_url": "data:image/jpeg;base64,AA==",
                            }
                        ],
                        "note": "missing sorted weight",
                    },
                    "mark_task_completed": True,
                },
            )

    def test_sorting_results_keep_partial_cost_when_only_some_bales_have_source_link(self):
        linked_shipment, linked_bales, source_pool_token, source_bale_token = self._create_ready_bales_with_source_cost(
            customs_notice_no="RAW240428PARTA",
            total_source_cost_kes=400,
            package_count=1,
            unit_weight_kg=20,
            category_name="tops / lady tops",
        )
        unlinked_shipment, unlinked_bales = self._create_ready_bales(
            customs_notice_no="RAW240428PARTB",
            package_count=1,
            unit_weight=20,
        )
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [linked_bales[0]["bale_barcode"], unlinked_bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "partial source linkage should stay unlocked",
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
                        "actual_weight_kg": 10,
                        "qty": 2,
                        "confirm_to_inventory": True,
                    }
                ],
                "note": "one bale linked and one bale missing source token",
                "mark_task_completed": True,
                "cost_status_override": "cost_locked",
                "estimated_unit_cost_kes": 999,
                "cost_model_code": "fake_client_model",
                "source_bale_tokens": ["CLIENT-WRONG-001"],
                "source_pool_tokens": ["CLIENT-WRONG"],
            },
        )

        self.assertEqual(result["shipment_no"], "MULTI")
        self.assertEqual(result["shipment_nos"], [linked_shipment["shipment_no"], unlinked_shipment["shipment_no"]])
        self.assertEqual(result["cost_status"], "partial_source_link")
        self.assertIsNone(result["unit_cost_kes"])
        self.assertEqual(result["cost_model_code"], "")
        self.assertIsNone(result["cost_locked_at"])
        self.assertEqual(result["source_bale_token_count"], 1)
        self.assertEqual(result["source_pool_token_count"], 1)
        self.assertEqual(result["result_items"][0]["cost_status"], "partial_source_link")
        self.assertIsNone(result["result_items"][0]["unit_cost_kes"])
        self.assertIsNone(result["result_items"][0]["total_cost_kes"])

        stock_row = next(row for row in self.state.list_sorting_stock() if row["sku_code"] == "TOPSLADY-P-018500")
        self.assertEqual(stock_row["default_cost_kes"], 185)
        self.assertIsNone(stock_row["unit_cost_kes"])
        self.assertIsNone(stock_row["total_cost_kes"])

        token_rows = self.state.list_item_barcode_tokens(task_no=task["task_no"])
        self.assertEqual(len(token_rows), 2)
        self.assertTrue(all(row["cost_status"] == "partial_source_link" for row in token_rows))
        self.assertTrue(all(row["unit_cost_kes"] is None for row in token_rows))
        self.assertTrue(all(row["cost_model_code"] == "" for row in token_rows))
        self.assertTrue(all(row["source_bale_tokens"] == [source_bale_token] for row in token_rows))
        self.assertTrue(all(row["source_pool_tokens"] == [source_pool_token] for row in token_rows))

    def test_sorting_results_with_different_default_costs_cannot_share_same_rack(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="RAW240429")
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "sorting result rack isolation",
                "created_by": "warehouse_supervisor_1",
            }
        )

        with self.assertRaises(HTTPException):
            self.state.submit_sorting_task_results(
                task["task_no"],
                {
                    "created_by": "warehouse_supervisor_1",
                    "result_items": [
                        {
                            "category_name": "tops / lady tops",
                            "grade": "P",
                            "qty": 5,
                            "rack_code": "A-TS-LOCK-01",
                            "confirm_to_inventory": True,
                            "default_cost_kes": 185,
                        },
                        {
                            "category_name": "tops / lady tops",
                            "grade": "P",
                            "qty": 4,
                            "rack_code": "A-TS-LOCK-01",
                            "confirm_to_inventory": True,
                            "default_cost_kes": 165,
                        },
                    ],
                    "note": "should be blocked",
                    "mark_task_completed": True,
                    "cost_status_override": "",
                    "estimated_unit_cost_kes": None,
                    "cost_model_code": "",
                    "source_bale_tokens": [],
                    "source_pool_tokens": [],
                },
            )

    def test_sorting_results_require_photo_when_loss_is_declared(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="RAW240430")
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "loss validation",
                "created_by": "warehouse_supervisor_1",
            }
        )

        with self.assertRaises(HTTPException):
            self.state.submit_sorting_task_results(
                task["task_no"],
                {
                    "created_by": "warehouse_supervisor_1",
                    "result_items": [
                        {
                            "category_name": "tops / lady tops",
                            "grade": "P",
                            "qty": 10,
                            "rack_code": "A-TS-P-01",
                            "confirm_to_inventory": True,
                            "default_cost_kes": 185,
                            "estimated_unit_cost_kes": 12.5,
                        }
                    ],
                    "loss_record": {
                        "has_loss": True,
                        "loss_qty": 2,
                        "loss_weight_kg": 1.4,
                        "photos": [],
                        "note": "wet pieces",
                    },
                    "note": "should be blocked without photo",
                    "mark_task_completed": True,
                    "cost_status_override": "cost_locked",
                    "estimated_unit_cost_kes": 12.5,
                    "cost_model_code": "sorting_actual_weight_v3",
                    "source_bale_tokens": [],
                    "source_pool_tokens": [],
                },
            )

    def test_sorting_results_store_loss_record_with_photo(self):
        shipment, bales = self._create_ready_bales(customs_notice_no="RAW240431")
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "loss persistence",
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
                        "qty": 10,
                        "rack_code": "A-TS-P-01",
                        "confirm_to_inventory": True,
                        "default_cost_kes": 185,
                        "estimated_unit_cost_kes": 12.5,
                    }
                ],
                "loss_record": {
                    "has_loss": True,
                    "loss_qty": 2,
                    "loss_weight_kg": 1.4,
                    "photos": [
                        {
                            "filename": "loss-1.jpg",
                            "content_type": "image/jpeg",
                            "data_url": "data:image/jpeg;base64,AA==",
                        }
                    ],
                    "note": "wet pieces",
                },
                "note": "loss kept with result",
                "mark_task_completed": True,
                "cost_status_override": "cost_locked",
                "estimated_unit_cost_kes": 12.5,
                "cost_model_code": "sorting_actual_weight_v3",
                "source_bale_tokens": [],
                "source_pool_tokens": [],
            },
        )

        self.assertTrue(result["loss_record"]["has_loss"])
        self.assertEqual(result["loss_record"]["loss_qty"], 2)
        self.assertEqual(result["loss_record"]["loss_weight_kg"], 1.4)
        self.assertEqual(len(result["loss_record"]["photos"]), 1)
        self.assertEqual(result["loss_record"]["note"], "wet pieces")

    def test_sorting_stock_keeps_weighted_unit_cost_and_can_backfill_from_tokens(self):
        _, first_bales, _, _ = self._create_ready_bales_with_source_cost(
            customs_notice_no="RAW240432A",
            total_source_cost_kes=20,
            package_count=1,
            unit_weight_kg=10,
            category_name="tops / lady tops",
        )
        _, second_bales, _, _ = self._create_ready_bales_with_source_cost(
            customs_notice_no="RAW240432B",
            total_source_cost_kes=60,
            package_count=1,
            unit_weight_kg=10,
            category_name="tops / lady tops",
        )

        task_one = self.state.create_sorting_task(
            {
                "bale_barcodes": [first_bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "first cost batch",
                "created_by": "warehouse_supervisor_1",
            }
        )
        self.state.submit_sorting_task_results(
            task_one["task_no"],
            {
                "created_by": "warehouse_supervisor_1",
                "result_items": [
                    {
                        "category_name": "tops / lady tops",
                        "grade": "P",
                        "actual_weight_kg": 10,
                        "qty": 2,
                        "rack_code": "A-TS-P-01",
                        "confirm_to_inventory": True,
                        "default_cost_kes": 185,
                    }
                ],
                "note": "first result batch",
                "mark_task_completed": True,
            },
        )

        task_two = self.state.create_sorting_task(
            {
                "bale_barcodes": [second_bales[0]["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "second cost batch",
                "created_by": "warehouse_supervisor_1",
            }
        )
        self.state.submit_sorting_task_results(
            task_two["task_no"],
            {
                "created_by": "warehouse_supervisor_1",
                "result_items": [
                    {
                        "category_name": "tops / lady tops",
                        "grade": "P",
                        "actual_weight_kg": 10,
                        "qty": 3,
                        "rack_code": "A-TS-P-01",
                        "confirm_to_inventory": True,
                        "default_cost_kes": 185,
                    }
                ],
                "note": "second result batch",
                "mark_task_completed": True,
            },
        )

        rows = self.state.list_sorting_stock()
        target = next(row for row in rows if row["sku_code"] == "TOPSLADY-P-018500")
        self.assertEqual(target["qty_on_hand"], 5)
        self.assertEqual(target["unit_cost_kes"], 16.0)
        self.assertEqual(target["total_cost_kes"], 80.0)

        stock_key = "A-TS-P-01||TOPSLADY-P-018500"
        self.state.sorting_stock[stock_key].pop("unit_cost_kes", None)
        self.state.sorting_stock[stock_key].pop("total_cost_kes", None)

        backfilled = next(row for row in self.state.list_sorting_stock() if row["sku_code"] == "TOPSLADY-P-018500")
        self.assertEqual(backfilled["unit_cost_kes"], 16.0)
        self.assertEqual(backfilled["total_cost_kes"], 80.0)

    def test_generate_warehouse_mainflow_demo_builds_half_sorted_shipment_without_print_jobs(self):
        result = self.state.generate_warehouse_mainflow_demo("admin_1")

        self.assertEqual(result["per_bale_weight_kg"], 50)
        self.assertEqual(result["total_bales"], 62)
        self.assertEqual(result["sorted_bales"], 31)
        self.assertEqual(result["remaining_raw_bales"], 31)
        self.assertEqual(result["printed_bales"], 0)
        self.assertEqual(len(result["sorting_task_nos"]), 4)
        self.assertEqual(len(self.state.print_jobs), 0)

        raw_rows = self.state.list_raw_bales(shipment_no=result["shipment_no"])
        self.assertEqual(len(raw_rows), 62)
        self.assertEqual(sum(1 for row in raw_rows if row["status"] == "sorted"), 31)
        self.assertEqual(sum(1 for row in raw_rows if row["status"] == "ready_for_sorting"), 31)

        china_source = self.state.get_china_source_record(result["source_pool_token"])
        self.assertEqual(china_source["cost_entries"]["tail_transport"]["amount"], 42000)

        summer_line = next(row for row in result["categories"] if row["source_category_sub"] == "summer+")
        self.assertEqual(summer_line["package_count"], 20)
        self.assertEqual(summer_line["sorted_bales"], 10)
        self.assertEqual(summer_line["remaining_raw_bales"], 10)

        sorting_rows = [
            row
            for row in self.state.list_sorting_stock()
            if row["category_name"] in {
                "tops / lady tops",
                "jacket / jacket",
                "pants / jeans pant",
                "dress / short dress",
            }
        ]
        self.assertGreaterEqual(len(sorting_rows), 8)

    def test_generate_store_replenishment_demo_builds_recommendation_ready_chain(self):
        result = self.state.generate_store_replenishment_demo("admin_1")

        self.assertEqual(result["category_count"], 10)
        self.assertEqual(result["warehouse_total_qty"], 20000)
        self.assertEqual(result["warehouse_loose_qty"], 14000)
        self.assertEqual(result["warehouse_waiting_store_dispatch_qty"], 6000)
        self.assertEqual(result["waiting_store_dispatch_bale_count"], 60)
        self.assertEqual(result["waiting_store_dispatch_bale_size"], 100)
        self.assertEqual(result["store_seed_qty"], 3000)
        self.assertGreaterEqual(result["recent_14d_sales_qty"], 2000)
        self.assertEqual(result["recent_14d_sales_qty"], 2100)
        self.assertEqual(result["store_remaining_qty"], 900)
        self.assertEqual(result["recommendation_item_count"], 10)
        self.assertTrue(result["recommendation_no"].startswith("TRR-"))
        self.assertEqual(len(self.state.transfer_orders), 0)

        warehouse_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if not str(row.get("store_code") or "").strip()
            and str(row.get("status") or "").strip().lower() in {"pending_store_print", "packed_waiting_store_dispatch"}
        ]
        self.assertEqual(len(warehouse_tokens), 20000)

        waiting_dispatch_bales = self.state.list_store_prep_bales(status="waiting_store_dispatch")
        self.assertEqual(len(waiting_dispatch_bales), 60)
        self.assertTrue(all(int(row.get("qty") or 0) == 100 for row in waiting_dispatch_bales))

        store_tokens = [
            row
            for row in self.state.list_item_barcode_tokens()
            if str(row.get("store_code") or "").strip().upper() == "UTAWALA"
        ]
        self.assertEqual(len(store_tokens), 3000)

        store_qty_on_hand = sum(
            int(row.get("qty_on_hand") or 0)
            for row in self.state.store_stock.values()
            if str(row.get("store_code") or "").strip().upper() == "UTAWALA"
        )
        self.assertEqual(store_qty_on_hand, 900)

        self.assertEqual(len(self.state.sales_transactions), 2100)
        self.assertEqual(len(self.state.list_transfer_recommendations()), 1)
        recommendation = self.state.get_transfer_recommendation(result["recommendation_no"])
        self.assertEqual(len(recommendation["items"]), 10)
        self.assertTrue(all(int(item.get("requested_qty") or 0) > 0 for item in recommendation["items"]))


if __name__ == "__main__":
    unittest.main()
