import sys
import tempfile
import re
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.state import InMemoryState


@pytest.fixture()
def state():
    temp_dir = tempfile.TemporaryDirectory()
    original_state_file = settings.state_file
    settings.state_file = Path(temp_dir.name) / "runtime_state.json"
    test_state = InMemoryState()
    try:
        yield test_state
    finally:
        settings.state_file = original_state_file
        temp_dir.cleanup()


def _seed_raw_bale(state: InMemoryState) -> dict:
    raw_bale = {
        "id": 1,
        "bale_barcode": "RB260427AAAAB",
        "scan_token": "RB260427AAAAB",
        "machine_code": "1260427001",
        "legacy_bale_barcode": "BALE-260427-001",
        "shipment_no": "SHIP-BCRULE-RAW",
        "parcel_batch_no": "PB-BCRULE-RAW",
        "status": "ready_for_sorting",
        "created_at": "2026-04-27T00:00:00+03:00",
        "updated_at": "2026-04-27T00:00:00+03:00",
    }
    state.bale_barcodes[raw_bale["bale_barcode"]] = raw_bale
    return raw_bale


def _seed_dispatch_bale(state: InMemoryState) -> dict:
    dispatch_bale = {
        "bale_no": "SDB260428AAB",
        "bale_barcode": "SDB260428AAB",
        "scan_token": "SDB260428AAB",
        "machine_code": "2260428002",
        "transfer_no": "TO-20260428-001",
        "source_bales": ["SDB260428AAB"],
        "status": "ready_dispatch",
        "store_code": "UTAWALA",
        "item_count": 100,
        "token_nos": [],
    }
    state.store_dispatch_bales[dispatch_bale["bale_no"]] = dispatch_bale
    return dispatch_bale


def _seed_store_item_token(state: InMemoryState) -> dict:
    token = {
        "token_no": "TOK-ST20260428001-0001",
        "identity_no": "TOK-ST20260428001-0001",
        "barcode_value": "5260428001",
        "final_item_barcode": {"barcode_value": "5260428001"},
        "status": "printed_in_store",
        "category_name": "dress / ladies dress",
        "grade": "P",
        "task_no": "ST-20260428-001",
        "shipment_no": "SHIP-BCRULE-ITEM",
        "customs_notice_no": "",
        "source_bale_barcodes": [],
        "source_legacy_bale_barcodes": [],
        "sku_code": "DRESS-P",
        "rack_code": "",
        "qty_index": 1,
        "qty_total": 1,
        "token_group_no": 1,
        "store_dispatch_bale_no": "SDB260428AAB",
        "store_code": "UTAWALA",
        "assigned_employee": "store_clerk_1",
        "selling_price_kes": 500,
        "store_rack_code": "A-01",
        "created_at": "2026-04-28T00:00:00+03:00",
        "updated_at": "2026-04-28T00:00:00+03:00",
    }
    state.item_barcode_tokens[token["token_no"]] = token
    return token


def _seed_store_delivery_execution(state: InMemoryState) -> dict:
    order = state._normalize_store_delivery_execution_order(
        {
            "execution_order_no": "SDO260428001",
            "source_transfer_no": "TO-20260428-001",
            "from_warehouse_code": "WH1",
            "to_store_code": "UTAWALA",
            "packages": [
                {
                    "source_type": "SDB",
                    "source_code": "SDB260428AAB",
                    "item_count": 100,
                    "category_summary": "dress / ladies dress",
                }
            ],
            "status": "pending_print",
            "created_by": "warehouse_clerk_1",
            "created_at": "2026-04-28T00:00:00+03:00",
        }
    )
    state.store_delivery_execution_orders[order["execution_order_no"]] = order
    return order


def _prepare_barcode_fixtures(state: InMemoryState):
    raw_bale = _seed_raw_bale(state)
    dispatch_bale = _seed_dispatch_bale(state)
    token = _seed_store_item_token(state)
    sdo = _seed_store_delivery_execution(state)
    return raw_bale, dispatch_bale, token, sdo


def _seed_store_prep_bale(state: InMemoryState, bale_no: str = "SDB260428AAB") -> dict:
    bale = state._normalize_store_prep_bale(
        {
            "id": 1,
            "bale_no": bale_no,
            "task_no": "SPT260428001",
            "task_type": "store_dispatch",
            "status": "waiting_store_dispatch",
            "qty": 100,
            "machine_code": "2260428001",
        }
    )
    state.store_prep_bales[bale["bale_no"]] = bale
    return bale


def _seed_transfer_with_dispatch_for_execution(state: InMemoryState, transfer_no: str = "TO-20260428-001") -> None:
    state.transfer_orders[transfer_no] = {
        "transfer_no": transfer_no,
        "from_warehouse_code": "WH1",
        "to_store_code": "UTAWALA",
        "created_by": "store_manager_1",
        "approval_required": True,
        "status": "approved",
        "approval_status": "approved",
        "created_at": "2026-04-28T00:00:00+00:00",
        "submitted_at": "2026-04-28T00:00:00+00:00",
        "approved_at": "2026-04-28T00:01:00+00:00",
        "approved_by": "warehouse_supervisor_1",
        "received_at": None,
        "received_by": None,
        "closed_at": None,
        "store_receipt_status": "not_started",
        "demand_lines": [],
        "items": [],
    }
    state.store_dispatch_bales["SDB-TRF20260428001-001"] = {
        "bale_no": "SDB-TRF20260428001-001",
        "transfer_no": transfer_no,
        "source_bales": ["SDB260428AAB", "LPKTO20260428001PICK"],
        "status": "ready_dispatch",
        "token_nos": [],
    }


def test_pos_accepts_only_store_item_and_requires_identity_id(state):
    _, dispatch_bale, token, _ = _prepare_barcode_fixtures(state)
    store_item_barcode = token["barcode_value"]

    accepted = state.resolve_barcode(store_item_barcode, context="pos")
    assert accepted["barcode_type"] == "STORE_ITEM"
    assert accepted["object_id"] == token["token_no"]
    assert accepted["identity_id"] == token["token_no"]
    assert accepted["business_object"]["kind"] == "STORE_ITEM"
    assert accepted["business_object"]["id"] == token["token_no"]
    assert accepted["pos_allowed"] is True
    assert accepted["reject_reason"] == ""
    assert accepted["operational_next_step"] == ""

    dispatch_rejected = state.resolve_barcode(dispatch_bale["bale_no"], context="pos")
    assert dispatch_rejected["barcode_type"] == "DISPATCH_BALE"
    assert dispatch_rejected["reject_reason"]

    legacy_token_rejected = state.resolve_barcode(token["token_no"], context="pos")
    assert legacy_token_rejected["barcode_type"] == "STORE_ITEM"
    assert legacy_token_rejected["pos_allowed"] is False
    assert legacy_token_rejected["reject_reason"]


def test_store_item_v2_resolver_validates_ean13_for_pos(state):
    token = _seed_store_item_token(state)
    token["barcode_value"] = "5261240000013"
    token["final_item_barcode"] = {"barcode_value": "5261240000013"}

    accepted = state.resolve_barcode("5261240000013", context="pos")

    assert accepted["barcode_type"] == "STORE_ITEM"
    assert accepted["object_id"] == token["token_no"]
    assert accepted["pos_allowed"] is True
    assert accepted["reject_reason"] == ""

    token["barcode_value"] = "5261240000010"
    token["final_item_barcode"] = {"barcode_value": "5261240000010"}
    rejected = state.resolve_barcode("5261240000010", context="pos")

    assert rejected["barcode_type"] == "STORE_ITEM"
    assert rejected["object_id"] == token["token_no"]
    assert rejected["pos_allowed"] is False
    assert rejected["reject_reason"] == "STORE_ITEM EAN-13 校验位不正确，不能 POS 销售。"


def test_warehouse_sorting_accepts_raw_bale_and_rejects_store_item(state):
    raw_bale, _, token, _ = _prepare_barcode_fixtures(state)
    store_item_barcode = token["barcode_value"]

    raw_result = state.resolve_barcode(raw_bale["machine_code"], context="warehouse_sorting_create")
    assert raw_result["barcode_type"] == "RAW_BALE"
    assert raw_result["reject_reason"] == ""

    store_item_result = state.resolve_barcode(store_item_barcode, context="warehouse_sorting_create")
    assert store_item_result["barcode_type"] == "STORE_ITEM"
    assert store_item_result["reject_reason"]


def test_store_receiving_accepts_only_sdo_and_rejects_bale_or_item_codes(state):
    raw_bale, dispatch_bale, token, sdo = _prepare_barcode_fixtures(state)

    sdo_result = state.resolve_barcode(sdo["machine_code"], context="store_receiving")
    assert sdo_result["barcode_type"] == "STORE_DELIVERY_EXECUTION"
    assert sdo_result["reject_reason"] == ""

    dispatch_result = state.resolve_barcode(dispatch_bale["machine_code"], context="store_receiving")
    assert dispatch_result["barcode_type"] == "DISPATCH_BALE"
    assert dispatch_result["reject_reason"]

    raw_result = state.resolve_barcode(raw_bale["machine_code"], context="store_receiving")
    assert raw_result["barcode_type"] == "RAW_BALE"
    assert raw_result["reject_reason"]

    item_result = state.resolve_barcode(token["barcode_value"], context="store_receiving")
    assert item_result["barcode_type"] == "STORE_ITEM"
    assert item_result["reject_reason"]


@pytest.mark.xfail(reason="Typed BALE_SALES resolver class for B2B context is documented but not implemented yet.", strict=True)
def test_b2b_bale_sales_accepts_bale_sales_and_rejects_store_item(state):
    _, _, token, _ = _prepare_barcode_fixtures(state)
    store_item_barcode = token["barcode_value"]

    bale_sales_result = state.resolve_barcode("BS260427AAA", context="b2b_bale_sales")
    assert bale_sales_result["barcode_type"] == "BALE_SALES"
    assert bale_sales_result["reject_reason"] == ""

    store_item_result = state.resolve_barcode(store_item_barcode, context="b2b_bale_sales")
    assert store_item_result["barcode_type"] == "STORE_ITEM"
    assert store_item_result["reject_reason"]


def test_lpk_resolves_as_warehouse_only_loose_pick_task(state):
    machine_result = state.resolve_barcode("3260428001", context="warehouse_shortage_pick")
    assert machine_result["barcode_type"] == "LOOSE_PICK_TASK"
    assert machine_result["business_object"]["kind"] == "LOOSE_PICK_TASK"
    assert machine_result["reject_reason"] == ""

    display_result = state.resolve_barcode("LPK260428001", context="warehouse_execution")
    assert display_result["barcode_type"] == "LOOSE_PICK_TASK"
    assert display_result["reject_reason"] == ""

    pos_result = state.resolve_barcode("3260428001", context="pos")
    assert pos_result["barcode_type"] == "LOOSE_PICK_TASK"
    assert pos_result["reject_reason"]

    receiving_result = state.resolve_barcode("LPK260428001", context="store_receiving")
    assert receiving_result["barcode_type"] == "LOOSE_PICK_TASK"
    assert receiving_result["reject_reason"]


@pytest.mark.xfail(reason="BALE_SALES typed barcode recognition is documented but not implemented in resolver.", strict=True)
def test_pos_rejects_bale_sales_with_typed_classification(state):
    result = state.resolve_barcode("BS260427ABC", context="pos")
    assert result["barcode_type"] == "BALE_SALES"
    assert result["reject_reason"]


def test_pos_rejects_raw_bale_dispatch_bale_and_unknown(state):
    raw_bale, dispatch_bale, _, sdo = _prepare_barcode_fixtures(state)

    raw_result = state.resolve_barcode(raw_bale["machine_code"], context="pos")
    assert raw_result["barcode_type"] == "RAW_BALE"
    assert raw_result["reject_reason"]

    dispatch_result = state.resolve_barcode(dispatch_bale["machine_code"], context="pos")
    assert dispatch_result["barcode_type"] == "DISPATCH_BALE"
    assert dispatch_result["reject_reason"]

    sdo_result = state.resolve_barcode(sdo["machine_code"], context="pos")
    assert sdo_result["barcode_type"] == "STORE_DELIVERY_EXECUTION"
    assert sdo_result["reject_reason"]

    unknown_result = state.resolve_barcode("UNKNOWN-DOES-NOT-EXIST", context="pos")
    assert unknown_result["barcode_type"] == "UNKNOWN"
    assert unknown_result["reject_reason"]
    assert unknown_result["rejection_message"] == unknown_result["reject_reason"]
    assert unknown_result["operational_next_step"]


def test_same_raw_bale_identity_is_preserved_across_contexts_with_contextual_rejection(state):
    raw_bale, _, _, _ = _prepare_barcode_fixtures(state)
    raw_barcode = raw_bale["machine_code"]

    expected_contexts = {
        "warehouse_sorting_create": False,
        "pos": True,
        "store_receiving": True,
        "store_pda": True,
        "b2b_bale_sales": True,
    }

    for context, should_reject in expected_contexts.items():
        result = state.resolve_barcode(raw_barcode, context=context)
        assert result["barcode_type"] == "RAW_BALE"
        assert result["barcode_type"] != "UNKNOWN"
        assert result["business_object"]["kind"] == "INBOUND_BALE"
        assert result["business_object"]["id"] == raw_bale["bale_barcode"]
        assert result["object_type"] == "raw_bale"
        assert result["object_id"] == raw_bale["bale_barcode"]
        assert result["template_scope"] == "bale"
        if context == "pos":
            assert result["pos_allowed"] is False
        if should_reject:
            assert result["reject_reason"]
        else:
            assert result["reject_reason"] == ""


def test_rejection_messages_include_operational_direction_not_only_invalid(state):
    raw_bale, _, token, _ = _prepare_barcode_fixtures(state)
    store_item_barcode = token["barcode_value"]

    pos_reject = state.resolve_barcode(raw_bale["machine_code"], context="pos")["reject_reason"]
    sorting_reject = state.resolve_barcode(store_item_barcode, context="warehouse_sorting_create")["reject_reason"]
    receiving_reject = state.resolve_barcode(raw_bale["machine_code"], context="store_receiving")["reject_reason"]
    pda_reject = state.resolve_barcode(raw_bale["machine_code"], context="store_pda")["reject_reason"]

    for message in [pos_reject, sorting_reject, receiving_reject, pda_reject]:
        lowered = message.lower()
        assert "invalid barcode" not in lowered
        assert len(message.strip()) >= 10

    pos_next_step = state.resolve_barcode(raw_bale["machine_code"], context="pos")["operational_next_step"]
    sorting_next_step = state.resolve_barcode(store_item_barcode, context="warehouse_sorting_create")["operational_next_step"]
    receiving_next_step = state.resolve_barcode(raw_bale["machine_code"], context="store_receiving")["operational_next_step"]
    pda_next_step = state.resolve_barcode(raw_bale["machine_code"], context="store_pda")["operational_next_step"]
    for next_step in [pos_next_step, sorting_next_step, receiving_next_step, pda_next_step]:
        assert len(next_step.strip()) >= 8


def test_template_scope_is_not_business_identity_authority_contract(state):
    _, _, token, _ = _prepare_barcode_fixtures(state)
    store_item_barcode = token["barcode_value"]
    result = state.resolve_barcode(store_item_barcode, context="pos")

    assert result["barcode_type"] == "STORE_ITEM"
    assert result["identity_id"] == token["token_no"]
    assert result["business_object"]["kind"] == "STORE_ITEM"
    assert result["business_object"]["id"] == token["token_no"]
    assert result["template_scope"] == "product"


def test_store_prep_bale_resolves_as_warehouse_side_waiting_dispatch_object(state):
    prep_bale = _seed_store_prep_bale(state, "SDB260428AAB")
    result = state.resolve_barcode(prep_bale["machine_code"], context="warehouse_dispatch_planning")

    assert result["barcode_type"] == "STORE_PREP_BALE"
    assert result["business_object"]["kind"] == "STORE_PREP_BALE"
    assert result["object_type"] == "store_prep_bale"
    assert result["template_scope"] == "warehouse_store_prep_bale"
    assert result["reject_reason"] == ""


def test_store_prep_bale_is_rejected_in_store_pda_pos_and_b2b_sales(state):
    prep_bale = _seed_store_prep_bale(state, "SDB260428AAB")
    barcode = prep_bale["machine_code"]

    store_pda_result = state.resolve_barcode(barcode, context="store_pda")
    assert store_pda_result["barcode_type"] == "STORE_PREP_BALE"
    assert store_pda_result["reject_reason"] == "店员 PDA 只能扫描已收货/已分配流程中的正式送店执行码或 STORE_ITEM，不能直接扫描仓库待送店压缩包码。"

    pos_result = state.resolve_barcode(barcode, context="pos")
    assert pos_result["barcode_type"] == "STORE_PREP_BALE"
    assert pos_result["reject_reason"] == "POS 只允许扫描 STORE_ITEM 商品码，不能扫描仓库待送店压缩包码。"

    b2b_result = state.resolve_barcode(barcode, context="b2b_bale_sales")
    assert b2b_result["barcode_type"] == "STORE_PREP_BALE"
    assert b2b_result["reject_reason"] == "这是待送店压缩包，不是待售卖 Bale。请切换到待售 Bale 业务页面后重试。"


def test_store_prep_bale_and_dispatch_bale_are_rejected_in_store_receiving(state):
    prep_bale = _seed_store_prep_bale(state, "SDB260428AAB")
    receiving_result = state.resolve_barcode(prep_bale["machine_code"], context="store_receiving")
    assert receiving_result["barcode_type"] == "STORE_PREP_BALE"
    assert receiving_result["reject_reason"] == "这是仓库待送店压缩包码，不是正式送货执行码。请让仓库先生成送货执行单并打印正式送店 barcode。"

    dispatch_bale = _seed_dispatch_bale(state)
    dispatch_result = state.resolve_barcode(dispatch_bale["machine_code"], context="store_receiving")
    assert dispatch_result["barcode_type"] == "DISPATCH_BALE"
    assert dispatch_result["reject_reason"]


def test_create_store_delivery_execution_order_and_resolve_in_store_receiving(state):
    _seed_transfer_with_dispatch_for_execution(state)

    created = state.create_store_delivery_execution_order(
        "TO-20260428-001",
        {"created_by": "warehouse_clerk_1", "notes": "warehouse verified"},
    )
    assert created["execution_order_no"].startswith("SDO")
    assert created["official_delivery_barcode"] == created["execution_order_no"]
    assert created["machine_code"].isdigit()
    assert len(created["machine_code"]) == 10
    assert created["machine_code"].startswith("4")
    expected_machine_code = state._physical_label_machine_code(created["execution_order_no"], "SDO")
    assert created["machine_code"] == expected_machine_code
    assert created["source_transfer_no"] == "TO-20260428-001"
    assert created["package_count"] == 1
    assert created["print_payload"]["display_code"] == created["execution_order_no"]
    assert created["print_payload"]["human_readable"] == created["machine_code"]
    assert created["print_payload"]["machine_code"] == created["machine_code"]
    assert created["print_payload"]["barcode_value"] == created["machine_code"]
    assert created["print_payload"]["scan_token"] == created["machine_code"]

    receiving_result = state.resolve_barcode(created["official_delivery_barcode"], context="store_receiving")
    assert receiving_result["barcode_type"] == "STORE_DELIVERY_EXECUTION"
    assert receiving_result["business_object"]["kind"] == "STORE_DELIVERY_EXECUTION"
    assert receiving_result["object_type"] == "store_delivery_execution"
    assert receiving_result["reject_reason"] == ""

    pos_result = state.resolve_barcode(created["official_delivery_barcode"], context="pos")
    assert pos_result["barcode_type"] == "STORE_DELIVERY_EXECUTION"
    assert pos_result["reject_reason"]


def test_sdo_package_resolves_for_store_receiving_and_is_rejected_by_pos(state):
    _seed_transfer_with_dispatch_for_execution(state, transfer_no="TO-20260428-SDP")
    state.store_dispatch_bales.clear()
    state.store_dispatch_bales["SDB260503AAG"] = {
        "bale_no": "SDB260503AAG",
        "machine_code": "2260503006",
        "transfer_no": "TO-20260428-SDP",
        "source_type": "SDB",
        "source_code": "SDB260503AAG",
        "source_bales": ["SDB260503AAG"],
        "status": "ready_dispatch",
        "store_code": "UTAWALA",
        "item_count": 100,
        "category_summary": "pants / jeans pant / P",
        "token_nos": [],
    }
    state.store_dispatch_bales["LPK260504001"] = {
        "bale_no": "LPK260504001",
        "machine_code": "3260504001",
        "transfer_no": "TO-20260428-SDP",
        "source_type": "LPK",
        "source_code": "LPK260504001",
        "source_bales": ["LPK260504001"],
        "status": "ready_dispatch",
        "store_code": "UTAWALA",
        "item_count": 40,
        "category_summary": "pants / jeans pant / P",
        "token_nos": [],
    }
    created = state.create_store_delivery_execution_order(
        "TO-20260428-SDP",
        {"created_by": "warehouse_clerk_1", "notes": "warehouse verified"},
    )
    package = created["packages"][0]

    receiving_result = state.resolve_barcode(package["machine_code"], context="store_receiving")
    assert receiving_result["barcode_type"] == "STORE_DELIVERY_PACKAGE"
    assert receiving_result["business_object"]["kind"] == "STORE_DELIVERY_PACKAGE"
    assert receiving_result["object_type"] == "store_delivery_package"
    assert receiving_result["reject_reason"] == ""
    assert receiving_result["parent_entity_type"] == "STORE_DELIVERY_EXECUTION"
    assert receiving_result["parent_sdo_machine_code"] == created["machine_code"]
    assert receiving_result["parent_sdo_display_code"] == created["execution_order_no"]
    assert receiving_result["package_no"] == 1
    assert receiving_result["package_total"] == 2
    assert receiving_result["store_code"] == "UTAWALA"
    assert receiving_result["source_type"] in {"SDB", "LPK"}
    assert "store_receiving" in receiving_result["allowed_contexts"]
    assert "identity_ledger" in receiving_result["allowed_contexts"]
    assert receiving_result["pos_allowed"] is False

    display_result = state.resolve_barcode(package["display_code"], context="store_receiving")
    assert display_result["barcode_type"] == "STORE_DELIVERY_PACKAGE"
    assert display_result["object_id"] == package["display_code"]

    pos_result = state.resolve_barcode(package["machine_code"], context="pos")
    assert pos_result["barcode_type"] == "STORE_DELIVERY_PACKAGE"
    assert pos_result["pos_allowed"] is False
    assert pos_result["reject_reason"] == "POS 只允许扫描已激活的 STORE_ITEM 商品码，不能扫描仓库/送店 bale 码。"

    sdb_result = state.resolve_barcode("2260503006", context="store_receiving")
    assert sdb_result["barcode_type"] in {"STORE_PREP_BALE", "DISPATCH_BALE"}
    assert sdb_result["reject_reason"]

    lpk_result = state.resolve_barcode("3260504001", context="store_receiving")
    assert lpk_result["barcode_type"] == "LOOSE_PICK_TASK"
    assert lpk_result["reject_reason"]


def test_list_store_delivery_execution_orders_does_not_create_sdo_packages_or_persist(state):
    state.store_delivery_execution_orders["SDO260504001"] = {
        "execution_order_no": "SDO260504001",
        "official_delivery_barcode": "SDO260504001",
        "source_transfer_no": "TO-20260504-SDP",
        "from_warehouse_code": "WH1",
        "to_store_code": "UTAWALA",
        "package_count": 2,
        "packages": [
            {
                "source_type": "SDB",
                "source_code": "SDB260503AAG",
                "item_count": 100,
                "category_summary": "pants / jeans pant / P",
            },
            {
                "source_type": "LPK",
                "source_code": "LPK260504001",
                "item_count": 40,
                "category_summary": "pants / jeans pant / P",
            },
        ],
        "status": "pending_print",
        "created_by": "warehouse_clerk_1",
        "created_at": "2026-05-04T00:00:00+03:00",
    }

    def fail_on_persist():
        raise AssertionError("list_store_delivery_execution_orders must not persist")

    state._persist = fail_on_persist

    rows = state.list_store_delivery_execution_orders()

    assert len(rows) == 1
    assert state.store_delivery_packages == {}
    assert [package["source_code"] for package in rows[0]["packages"]] == ["SDB260503AAG", "LPK260504001"]
    assert not any(str(package.get("display_code") or "").startswith("SDP") for package in rows[0]["packages"])


def test_ensure_sdo_packages_repairs_old_sdo_without_reissuing_existing_packages(state):
    _seed_transfer_with_dispatch_for_execution(state, transfer_no="TO-20260428-ENSURE")
    state.store_dispatch_bales.clear()
    state.store_dispatch_bales["SDB260503AAG"] = {
        "bale_no": "SDB260503AAG",
        "machine_code": "2260503006",
        "transfer_no": "TO-20260428-ENSURE",
        "source_type": "SDB",
        "source_code": "SDB260503AAG",
        "source_bales": ["SDB260503AAG"],
        "status": "ready_dispatch",
        "store_code": "UTAWALA",
        "item_count": 100,
        "category_summary": "pants / jeans pant / P",
        "token_nos": [],
    }
    state.store_dispatch_bales["LPK260504001"] = {
        "bale_no": "LPK260504001",
        "machine_code": "3260504001",
        "transfer_no": "TO-20260428-ENSURE",
        "source_type": "LPK",
        "source_code": "LPK260504001",
        "source_bales": ["LPK260504001"],
        "status": "ready_dispatch",
        "store_code": "UTAWALA",
        "item_count": 40,
        "category_summary": "pants / jeans pant / P",
        "token_nos": [],
    }
    state.store_delivery_execution_orders["SDO260504001"] = {
        "execution_order_no": "SDO260504001",
        "official_delivery_barcode": "SDO260504001",
        "source_transfer_no": "TO-20260428-ENSURE",
        "from_warehouse_code": "WH1",
        "to_store_code": "UTAWALA",
        "package_count": 2,
        "packages": [],
        "status": "pending_print",
        "created_by": "warehouse_clerk_1",
        "created_at": "2026-05-04T00:00:00+03:00",
    }

    first = state.ensure_store_delivery_execution_order_packages(
        "TO-20260428-ENSURE",
        "SDO260504001",
        {"created_by": "warehouse_clerk_1"},
    )
    second = state.ensure_store_delivery_execution_order_packages(
        "TO-20260428-ENSURE",
        "SDO260504001",
        {"created_by": "warehouse_clerk_1"},
    )

    assert len(first["packages"]) == 2
    assert all(package["display_code"].startswith("SDP") for package in first["packages"])
    assert all(re.fullmatch(r"6\d{9}", package["machine_code"]) for package in first["packages"])
    assert all(package["barcode_value"] == package["machine_code"] for package in first["packages"])
    assert [package["source_code"] for package in first["packages"]] == ["SDB260503AAG", "LPK260504001"]
    assert [package["package_no"] for package in first["packages"]] == [1, 2]
    assert [package["package_total"] for package in first["packages"]] == [2, 2]
    assert [package["machine_code"] for package in second["packages"]] == [package["machine_code"] for package in first["packages"]]


def test_create_store_delivery_execution_order_rejects_when_transfer_has_no_dispatch_rows(state):
    _seed_transfer_with_dispatch_for_execution(state, transfer_no="TO-20260428-EMPTY")
    state.store_dispatch_bales.clear()

    with pytest.raises(HTTPException) as exc_info:
        state.create_store_delivery_execution_order(
            "TO-20260428-EMPTY",
            {"created_by": "warehouse_clerk_1", "notes": "warehouse verified"},
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "该补货申请还没有可送店包裹，不能生成正式门店送货执行单 barcode。请先完成仓库核对和打包。"


def test_store_prep_bale_rejection_message_in_store_receiving_mentions_official_execution_barcode(state):
    prep_bale = _seed_store_prep_bale(state, "SDB260428AAB")
    receiving_result = state.resolve_barcode(prep_bale["machine_code"], context="store_receiving")
    assert receiving_result["barcode_type"] == "STORE_PREP_BALE"
    assert receiving_result["reject_reason"] == "这是仓库待送店压缩包码，不是正式送货执行码。请让仓库先生成送货执行单并打印正式送店 barcode。"


def test_machine_code_mapping_rules_for_lpk_and_sdo(state):
    assert state._physical_label_machine_code("TO-20260428-001", "LPK", source_reference="TO-20260428-001") == "3260428001"
    assert state._physical_label_machine_code("SDO260428001", "SDO") == "4260428001"


def test_store_item_v2_ean13_generation_rules(state):
    assert state._ean13_check_digit("526124000001") == "3"
    assert state._store_item_barcode_v2_value("2026-05-04", 1) == "5261240000013"


def test_store_item_v2_allocator_skips_existing_codes(state):
    token = _seed_store_item_token(state)
    token["barcode_value"] = "5261240000013"
    token["final_item_barcode"] = {"barcode_value": "5261240000013"}

    allocated = state._store_item_barcode_value("ST-20260504-001", 1, "2026-05-04T08:00:00+03:00")

    assert allocated == "5261240000020"
    assert state._is_valid_store_item_v2_barcode(allocated)


def test_lpk_machine_code_uses_related_to_number_to_avoid_collision(state):
    machine_code_1 = state._physical_label_machine_code(
        "LPKTO20260428001PICK",
        "LPK",
        source_reference="TO-20260428-001",
    )
    machine_code_2 = state._physical_label_machine_code(
        "LPKTO20260428002PICK",
        "LPK",
        source_reference="TO-20260428-002",
    )
    assert machine_code_1 == "3260428001"
    assert machine_code_2 == "3260428002"
    assert machine_code_1 != machine_code_2


def test_store_prep_print_payload_uses_type_2_machine_code(state):
    prep_bale = _seed_store_prep_bale(state, "SDB-TRF20260428001-001")
    job = state.queue_store_prep_bale_print_job(prep_bale["bale_no"], requested_by="warehouse_clerk_1")
    payload = job["print_payload"]
    assert payload["display_code"] == prep_bale["scan_token"]
    assert payload["barcode_value"] == prep_bale["machine_code"]
    assert payload["machine_code"] == prep_bale["machine_code"]
    assert payload["scan_token"] == prep_bale["machine_code"]
    assert payload["human_readable"] == prep_bale["machine_code"]
    assert payload["machine_code"].startswith("2")


def test_store_item_print_payload_uses_type_5_machine_code(state):
    token = _seed_store_item_token(state)
    token["barcode_value"] = token["token_no"]

    job = state._build_item_token_print_job(
        token["token_no"],
        copies=1,
        printer_name="Deli DL-720C",
        requested_by="Austin",
    )

    payload = job["print_payload"]
    assert payload["barcode_value"] == token["barcode_value"]
    assert payload["machine_code"] == token["barcode_value"]
    assert payload["human_readable"] == token["barcode_value"]
    assert payload["display_code"] == token["token_no"]
    assert re.fullmatch(r"5\d{12}", payload["barcode_value"])
    assert state._is_valid_store_item_v2_barcode(payload["barcode_value"])
    assert payload["token_no"] == token["token_no"]


def test_print_station_reprint_requires_numeric_machine_code(state):
    with pytest.raises(HTTPException) as exc_info:
        state.create_bale_label_print_station_job(
            {
                "code": "RB260427AAAAB",
                "requested_by": "warehouse_clerk_1",
                "supplier": "Youxun",
                "category": "dress",
                "subcategory": "long dress",
                "batch": "PB-001",
                "ship_reference": "SHIP-001",
                "total_number": 1,
                "sequence_number": 1,
            }
        )
    assert exc_info.value.status_code == 400
    assert "machine_code" in exc_info.value.detail

    job = state.create_bale_label_print_station_job(
        {
            "code": "1260427001",
            "requested_by": "warehouse_clerk_1",
            "supplier": "Youxun",
            "category": "dress",
            "subcategory": "long dress",
            "batch": "PB-001",
            "ship_reference": "SHIP-001",
            "total_number": 1,
            "sequence_number": 1,
        }
    )
    assert job["code"] == "1260427001"


def test_raw_bale_print_payload_uses_type_1_machine_code(state):
    raw_bale = _seed_raw_bale(state)
    job = {
        "id": 1,
        "job_type": "bale_barcode_label",
        "barcode": raw_bale["bale_barcode"],
        "template_code": "warehouse_in",
        "print_payload": {"barcode_value": raw_bale["bale_barcode"], "scan_token": raw_bale["bale_barcode"]},
    }
    state.print_jobs.append(job)
    state._hydrate_bale_print_jobs()
    assert job["print_payload"]["display_code"] == raw_bale["bale_barcode"]
    assert job["print_payload"]["barcode_value"] == raw_bale["machine_code"]
    assert job["print_payload"]["display_code"] != job["print_payload"]["barcode_value"]
    assert job["print_payload"]["scan_token"] == raw_bale["machine_code"]
    assert job["print_payload"]["machine_code"] == raw_bale["machine_code"]
    assert job["print_payload"]["human_readable"] == raw_bale["machine_code"]
    assert job["print_payload"]["barcode_value"].startswith("1")


def test_stale_raw_bale_print_job_is_hydrated_when_source_has_machine_code(state):
    raw_bale = _seed_raw_bale(state)
    job = {
        "id": 2,
        "job_type": "bale_barcode_label",
        "status": "queued",
        "barcode": raw_bale["bale_barcode"],
        "template_code": "warehouse_in",
        "print_payload": {
            "display_code": raw_bale["bale_barcode"],
            "bale_barcode": raw_bale["bale_barcode"],
            "scan_token": raw_bale["bale_barcode"],
            "barcode_value": raw_bale["bale_barcode"],
            "machine_code": "",
        },
    }
    state.print_jobs.append(job)

    listed = state.list_print_jobs(status="queued")

    payload = listed[0]["print_payload"]
    assert payload["display_code"] == raw_bale["bale_barcode"]
    assert payload["machine_code"] == raw_bale["machine_code"]
    assert payload["barcode_value"] == raw_bale["machine_code"]
    assert payload["scan_token"] == raw_bale["machine_code"]
    assert payload["human_readable"] == raw_bale["machine_code"]


def test_stale_raw_bale_print_job_does_not_guess_machine_code_from_display_code(state):
    raw_bale = {
        "id": 1,
        "bale_barcode": "RB260427AAAQH",
        "scan_token": "RB260427AAAQH",
        "legacy_bale_barcode": "BALE-260427-001",
        "shipment_no": "SHIP-BCRULE-RAW",
        "parcel_batch_no": "PB-BCRULE-RAW",
        "status": "ready_for_sorting",
        "created_at": "2026-04-27T00:00:00+03:00",
        "updated_at": "2026-04-27T00:00:00+03:00",
    }
    state.bale_barcodes[raw_bale["bale_barcode"]] = raw_bale
    job = {
        "id": 3,
        "job_type": "bale_barcode_label",
        "status": "queued",
        "barcode": raw_bale["bale_barcode"],
        "template_code": "warehouse_in",
        "print_payload": {
            "display_code": raw_bale["bale_barcode"],
            "bale_barcode": raw_bale["bale_barcode"],
            "scan_token": raw_bale["bale_barcode"],
            "barcode_value": raw_bale["bale_barcode"],
            "machine_code": "",
        },
    }
    state.print_jobs.append(job)

    listed = state.list_print_jobs(status="queued")

    payload = listed[0]["print_payload"]
    assert payload["display_code"] == "RB260427AAAQH"
    assert payload.get("machine_code", "") == ""
    assert payload["barcode_value"] == "RB260427AAAQH"
    assert payload["scan_token"] == "RB260427AAAQH"
    assert payload["barcode_value"] != "260427"


def test_raw_bale_machine_code_repair_dry_run_reports_missing_source_and_print_job(state):
    raw_bale = {
        "id": 31,
        "bale_barcode": "RB260427AAAQH",
        "scan_token": "RB260427AAAQH",
        "machine_code": "",
        "legacy_bale_barcode": "BALE-260427-031",
        "shipment_no": "SHIP-REPAIR-RAW",
        "parcel_batch_no": "PB-REPAIR-RAW",
        "status": "ready_for_sorting",
        "unload_date": "2026-04-27",
        "created_at": "2026-04-27T00:00:00+03:00",
    }
    state.bale_barcodes[raw_bale["bale_barcode"]] = raw_bale
    state.print_jobs.append(
        {
            "id": 3101,
            "job_type": "bale_barcode_label",
            "status": "queued",
            "barcode": raw_bale["bale_barcode"],
            "template_code": "warehouse_in",
            "print_payload": {
                "display_code": raw_bale["bale_barcode"],
                "bale_barcode": raw_bale["bale_barcode"],
                "scan_token": raw_bale["bale_barcode"],
                "barcode_value": raw_bale["bale_barcode"],
                "human_readable": raw_bale["bale_barcode"],
                "machine_code": "",
            },
        }
    )

    report = state.repair_raw_bale_machine_codes(dry_run=True, actor_username="admin_1")

    assert report["dry_run"] is True
    assert report["would_update_raw_bales"] == 1
    assert report["would_update_print_jobs"] == 1
    assert raw_bale["machine_code"] == ""
    assert state.print_jobs[-1]["print_payload"]["barcode_value"] == "RB260427AAAQH"
    assert report["sample"][0]["display_code"] == "RB260427AAAQH"
    assert re.fullmatch(r"1\d{9}", report["sample"][0]["new_machine_code"])
    assert report["sample"][0]["new_machine_code"] != "260427"


def test_raw_bale_machine_code_repair_apply_updates_source_and_print_payload(state):
    raw_bale = {
        "id": 32,
        "bale_barcode": "RB260427AABCD",
        "scan_token": "RB260427AABCD",
        "machine_code": "260427",
        "legacy_bale_barcode": "BALE-260427-032",
        "shipment_no": "SHIP-REPAIR-RAW",
        "parcel_batch_no": "PB-REPAIR-RAW",
        "status": "ready_for_sorting",
        "unload_date": "2026-04-27",
        "created_at": "2026-04-27T00:00:00+03:00",
    }
    state.bale_barcodes[raw_bale["bale_barcode"]] = raw_bale
    state.print_jobs.append(
        {
            "id": 3201,
            "job_type": "bale_barcode_label",
            "status": "queued",
            "barcode": raw_bale["bale_barcode"],
            "template_code": "warehouse_in",
            "print_payload": {
                "display_code": raw_bale["bale_barcode"],
                "bale_barcode": raw_bale["bale_barcode"],
                "scan_token": raw_bale["bale_barcode"],
                "barcode_value": raw_bale["bale_barcode"],
                "human_readable": raw_bale["bale_barcode"],
                "machine_code": "",
            },
        }
    )

    report = state.repair_raw_bale_machine_codes(dry_run=False, actor_username="admin_1")

    assert report["dry_run"] is False
    assert report["updated_raw_bales"] == 1
    assert report["updated_print_jobs"] == 1
    assert re.fullmatch(r"1\d{9}", raw_bale["machine_code"])
    assert raw_bale["machine_code"].startswith("1260427")
    payload = state.print_jobs[-1]["print_payload"]
    assert payload["display_code"] == "RB260427AABCD"
    assert payload["machine_code"] == raw_bale["machine_code"]
    assert payload["barcode_value"] == raw_bale["machine_code"]
    assert payload["scan_token"] == raw_bale["machine_code"]
    assert payload["human_readable"] == raw_bale["machine_code"]
    assert payload["barcode_value"] != "260427"


def test_raw_bale_machine_code_repair_keeps_valid_codes_and_generates_unique_sequence(state):
    valid_bale = {
        "id": 51,
        "bale_barcode": "RB351231VALID",
        "scan_token": "RB351231VALID",
        "machine_code": "1351231004",
        "legacy_bale_barcode": "BALE-351231-004",
        "unload_date": "2035-12-31",
        "status": "ready_for_sorting",
    }
    missing_bale = {
        "id": 52,
        "bale_barcode": "RB351231MISSN",
        "scan_token": "RB351231MISSN",
        "machine_code": "",
        "legacy_bale_barcode": "BALE-351231-005",
        "unload_date": "2035-12-31",
        "status": "ready_for_sorting",
    }
    state.bale_barcodes[valid_bale["bale_barcode"]] = valid_bale
    state.bale_barcodes[missing_bale["bale_barcode"]] = missing_bale

    report = state.repair_raw_bale_machine_codes(dry_run=False, actor_username="admin_1")

    assert report["already_valid_raw_bales"] >= 1
    assert valid_bale["machine_code"] == "1351231004"
    assert missing_bale["machine_code"] == "1351231005"
    all_codes = [
        row.get("machine_code")
        for row in state.bale_barcodes.values()
        if re.fullmatch(r"1\d{9}", str(row.get("machine_code") or ""))
    ]
    assert len(all_codes) == len(set(all_codes))


def test_raw_bale_machine_code_repair_skips_ambiguous_print_job_without_guessing(state):
    first = {
        "id": 61,
        "bale_barcode": "RB360101AAAAB",
        "scan_token": "RB360101AAAAB",
        "machine_code": "1360101001",
        "legacy_bale_barcode": "BALE-DUP-RAW",
        "unload_date": "2036-01-01",
    }
    second = {
        "id": 62,
        "bale_barcode": "RB360101AAAAC",
        "scan_token": "RB360101AAAAC",
        "machine_code": "1360101002",
        "legacy_bale_barcode": "BALE-DUP-RAW",
        "unload_date": "2036-01-01",
    }
    state.bale_barcodes[first["bale_barcode"]] = first
    state.bale_barcodes[second["bale_barcode"]] = second
    state.print_jobs.append(
        {
            "id": 6101,
            "job_type": "bale_barcode_label",
            "status": "queued",
            "barcode": "BALE-DUP-RAW",
            "template_code": "warehouse_in",
            "print_payload": {
                "display_code": "BALE-DUP-RAW",
                "bale_barcode": "BALE-DUP-RAW",
                "barcode_value": "BALE-DUP-RAW",
                "scan_token": "BALE-DUP-RAW",
                "machine_code": "",
            },
        }
    )

    report = state.repair_raw_bale_machine_codes(dry_run=False, actor_username="admin_1")

    assert report["updated_print_jobs"] == 0
    assert any(item["reason"] == "cannot_find_unique_raw_bale_source" for item in report["skipped"])
    payload = state.print_jobs[-1]["print_payload"]
    assert payload["barcode_value"] == "BALE-DUP-RAW"
    assert payload.get("machine_code", "") == ""
