import sys
import tempfile
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


def _prepare_sorting_flow(state: InMemoryState, customs_notice_no: str = "TYPED260427", qty: int = 2):
    state.upsert_apparel_default_cost(
        {
            "category_main": "dress",
            "category_sub": "ladies dress",
            "grade": "P",
            "default_cost_kes": 80,
            "note": "typed resolver contract test",
        },
        "warehouse_supervisor_1",
    )
    state.upsert_apparel_sorting_rack(
        {
            "category_main": "dress",
            "category_sub": "ladies dress",
            "grade": "P",
            "default_cost_kes": 80,
            "rack_code": "DR-P-01",
            "note": "typed resolver contract test",
        },
        "warehouse_supervisor_1",
    )
    shipment = state.create_inbound_shipment(
        {
            "shipment_type": "sea",
            "customs_notice_no": customs_notice_no,
            "unload_date": "2026-04-27",
            "coc_goods_manifest": "typed resolver contract test",
            "note": "",
            "coc_documents": [],
        }
    )
    state.create_parcel_batch(
        {
            "intake_type": "sea_freight",
            "inbound_shipment_no": shipment["shipment_no"],
            "supplier_name": "Resolver Contract Supplier",
            "cargo_type": "apparel",
            "category_main": "dress",
            "category_sub": "ladies dress",
            "package_count": 1,
            "total_weight": 40,
            "received_by": "warehouse_clerk_1",
            "note": "",
        }
    )
    state.confirm_inbound_shipment_intake(
        shipment["shipment_no"],
        {
            "declared_total_packages": 1,
            "confirmed_by": "warehouse_supervisor_1",
            "note": "",
        },
    )
    raw_bale = state.generate_bale_barcodes(shipment["shipment_no"], "warehouse_supervisor_1")[0]
    task = state.create_sorting_task(
        {
            "bale_barcodes": [raw_bale["bale_barcode"]],
            "handler_names": ["warehouse_clerk_1"],
            "note": "",
            "created_by": "warehouse_supervisor_1",
        }
    )
    state.submit_sorting_task_results(
        task["task_no"],
        {
            "result_items": [
                {
                    "category_name": "dress / ladies dress",
                    "grade": "P",
                    "qty": qty,
                    "confirm_to_inventory": True,
                }
            ],
            "note": "",
            "created_by": "warehouse_supervisor_1",
        },
    )
    return raw_bale


def _prepare_dispatch_and_store_item(state: InMemoryState):
    raw_bale = _prepare_sorting_flow(state)
    dispatch_bale = state.list_store_dispatch_bales()[0]
    state.accept_store_dispatch_bale(
        dispatch_bale["bale_no"],
        {"store_code": "UTAWALA", "accepted_by": "store_manager_1", "note": ""},
    )
    state.assign_store_dispatch_bale(
        dispatch_bale["bale_no"],
        {"employee_name": "store_clerk_1", "assigned_by": "store_manager_1", "note": ""},
    )
    token = state.get_store_dispatch_bale_tokens(dispatch_bale["bale_no"])[0]
    state.update_item_barcode_token_store_edit(
        token["token_no"],
        {
            "store_code": "UTAWALA",
            "selling_price_kes": 500,
            "store_rack_code": "A-01",
            "updated_by": "store_clerk_1",
            "note": "",
        },
    )
    job = state.queue_item_barcode_token_print_jobs(
        {
            "token_nos": [token["token_no"]],
            "copies": 1,
            "printer_name": "Deli DL-720C",
            "template_code": "clothes_retail",
            "requested_by": "store_clerk_1",
        }
    )[0]
    state.mark_print_job_printed(job["id"], "store_clerk_1")
    store_item_barcode = job["print_payload"]["barcode_value"]
    return raw_bale, dispatch_bale, token, store_item_barcode


def _seed_store_prep_bale(state: InMemoryState, bale_no: str = "SDB260428AAB") -> dict:
    bale = state._normalize_store_prep_bale(
        {
            "id": 1,
            "bale_no": bale_no,
            "task_no": "SPT260428001",
            "task_type": "store_dispatch",
            "status": "waiting_store_dispatch",
            "qty": 100,
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
    _, dispatch_bale, token, store_item_barcode = _prepare_dispatch_and_store_item(state)

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


def test_warehouse_sorting_accepts_raw_bale_and_rejects_store_item(state):
    raw_bale, _, _, store_item_barcode = _prepare_dispatch_and_store_item(state)

    raw_result = state.resolve_barcode(raw_bale["bale_barcode"], context="warehouse_sorting_create")
    assert raw_result["barcode_type"] == "RAW_BALE"
    assert raw_result["reject_reason"] == ""

    store_item_result = state.resolve_barcode(store_item_barcode, context="warehouse_sorting_create")
    assert store_item_result["barcode_type"] == "STORE_ITEM"
    assert store_item_result["reject_reason"]


def test_store_receiving_accepts_dispatch_bale_and_rejects_raw_bale(state):
    raw_bale, dispatch_bale, _, _ = _prepare_dispatch_and_store_item(state)

    dispatch_result = state.resolve_barcode(dispatch_bale["bale_no"], context="store_receiving")
    assert dispatch_result["barcode_type"] == "DISPATCH_BALE"
    assert dispatch_result["reject_reason"] == ""

    raw_result = state.resolve_barcode(raw_bale["bale_barcode"], context="store_receiving")
    assert raw_result["barcode_type"] == "RAW_BALE"
    assert raw_result["reject_reason"]


@pytest.mark.xfail(reason="Typed BALE_SALES resolver class for B2B context is documented but not implemented yet.", strict=True)
def test_b2b_bale_sales_accepts_bale_sales_and_rejects_store_item(state):
    _, _, _, store_item_barcode = _prepare_dispatch_and_store_item(state)

    bale_sales_result = state.resolve_barcode("BS260427AAA", context="b2b_bale_sales")
    assert bale_sales_result["barcode_type"] == "BALE_SALES"
    assert bale_sales_result["reject_reason"] == ""

    store_item_result = state.resolve_barcode(store_item_barcode, context="b2b_bale_sales")
    assert store_item_result["barcode_type"] == "STORE_ITEM"
    assert store_item_result["reject_reason"]


@pytest.mark.xfail(reason="LOOSE_PICK typed barcode recognition is documented but not implemented in resolver.", strict=True)
def test_pos_rejects_loose_pick_with_typed_classification(state):
    result = state.resolve_barcode("LP260427ABC", context="pos")
    assert result["barcode_type"] == "LOOSE_PICK"
    assert result["reject_reason"]


@pytest.mark.xfail(reason="BALE_SALES typed barcode recognition is documented but not implemented in resolver.", strict=True)
def test_pos_rejects_bale_sales_with_typed_classification(state):
    result = state.resolve_barcode("BS260427ABC", context="pos")
    assert result["barcode_type"] == "BALE_SALES"
    assert result["reject_reason"]


def test_pos_rejects_raw_bale_dispatch_bale_and_unknown(state):
    raw_bale, dispatch_bale, _, _ = _prepare_dispatch_and_store_item(state)

    raw_result = state.resolve_barcode(raw_bale["bale_barcode"], context="pos")
    assert raw_result["barcode_type"] == "RAW_BALE"
    assert raw_result["reject_reason"]

    dispatch_result = state.resolve_barcode(dispatch_bale["bale_no"], context="pos")
    assert dispatch_result["barcode_type"] == "DISPATCH_BALE"
    assert dispatch_result["reject_reason"]

    unknown_result = state.resolve_barcode("UNKNOWN-DOES-NOT-EXIST", context="pos")
    assert unknown_result["barcode_type"] == "UNKNOWN"
    assert unknown_result["reject_reason"]
    assert unknown_result["rejection_message"] == unknown_result["reject_reason"]
    assert unknown_result["operational_next_step"]


def test_same_raw_bale_identity_is_preserved_across_contexts_with_contextual_rejection(state):
    raw_bale, _, _, _ = _prepare_dispatch_and_store_item(state)
    raw_barcode = raw_bale["bale_barcode"]

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
        assert result["business_object"]["id"] == raw_barcode
        assert result["object_type"] == "raw_bale"
        assert result["object_id"] == raw_barcode
        assert result["template_scope"] == "bale"
        if context == "pos":
            assert result["pos_allowed"] is False
        if should_reject:
            assert result["reject_reason"]
        else:
            assert result["reject_reason"] == ""


def test_rejection_messages_include_operational_direction_not_only_invalid(state):
    raw_bale, dispatch_bale, _, store_item_barcode = _prepare_dispatch_and_store_item(state)

    pos_reject = state.resolve_barcode(raw_bale["bale_barcode"], context="pos")["reject_reason"]
    sorting_reject = state.resolve_barcode(store_item_barcode, context="warehouse_sorting_create")["reject_reason"]
    receiving_reject = state.resolve_barcode(raw_bale["bale_barcode"], context="store_receiving")["reject_reason"]
    pda_reject = state.resolve_barcode(raw_bale["bale_barcode"], context="store_pda")["reject_reason"]

    for message in [pos_reject, sorting_reject, receiving_reject, pda_reject]:
        lowered = message.lower()
        assert "invalid barcode" not in lowered
        assert len(message.strip()) >= 10

    pos_next_step = state.resolve_barcode(raw_bale["bale_barcode"], context="pos")["operational_next_step"]
    sorting_next_step = state.resolve_barcode(store_item_barcode, context="warehouse_sorting_create")["operational_next_step"]
    receiving_next_step = state.resolve_barcode(raw_bale["bale_barcode"], context="store_receiving")["operational_next_step"]
    pda_next_step = state.resolve_barcode(raw_bale["bale_barcode"], context="store_pda")["operational_next_step"]
    for next_step in [pos_next_step, sorting_next_step, receiving_next_step, pda_next_step]:
        assert len(next_step.strip()) >= 8


def test_template_scope_is_not_business_identity_authority_contract(state):
    _, _, token, store_item_barcode = _prepare_dispatch_and_store_item(state)
    result = state.resolve_barcode(store_item_barcode, context="pos")

    assert result["barcode_type"] == "STORE_ITEM"
    assert result["identity_id"] == token["token_no"]
    assert result["business_object"]["kind"] == "STORE_ITEM"
    assert result["business_object"]["id"] == token["token_no"]
    assert result["template_scope"] == "product"


def test_store_prep_bale_resolves_as_warehouse_side_waiting_dispatch_object(state):
    prep_bale = _seed_store_prep_bale(state, "SDB260428AAB")
    result = state.resolve_barcode(prep_bale["bale_barcode"], context="identity_ledger")

    assert result["barcode_type"] == "STORE_PREP_BALE"
    assert result["business_object"]["kind"] == "STORE_PREP_BALE"
    assert result["object_type"] == "store_prep_bale"
    assert result["template_scope"] == "warehouse_store_prep_bale"
    assert result["reject_reason"] == ""


def test_store_prep_bale_is_rejected_in_store_pda_pos_and_b2b_sales(state):
    prep_bale = _seed_store_prep_bale(state, "SDB260428AAB")
    barcode = prep_bale["bale_barcode"]

    store_pda_result = state.resolve_barcode(barcode, context="store_pda")
    assert store_pda_result["barcode_type"] == "STORE_PREP_BALE"
    assert store_pda_result["reject_reason"] == "店员 PDA 只能扫描已收货/已分配流程中的正式送店执行码或 STORE_ITEM，不能直接扫描仓库待送店压缩包码。"

    pos_result = state.resolve_barcode(barcode, context="pos")
    assert pos_result["barcode_type"] == "STORE_PREP_BALE"
    assert pos_result["reject_reason"] == "POS 只允许扫描 STORE_ITEM 商品码，不能扫描仓库待送店压缩包码。"

    b2b_result = state.resolve_barcode(barcode, context="b2b_bale_sales")
    assert b2b_result["barcode_type"] == "STORE_PREP_BALE"
    assert b2b_result["reject_reason"] == "这是待送店压缩包，不是待售卖 Bale。请切换到待售 Bale 业务页面后重试。"


def test_store_prep_bale_is_rejected_in_store_receiving_but_dispatch_execution_stays_allowed(state):
    prep_bale = _seed_store_prep_bale(state, "SDB260428AAB")
    receiving_result = state.resolve_barcode(prep_bale["bale_barcode"], context="store_receiving")
    assert receiving_result["barcode_type"] == "STORE_PREP_BALE"
    assert receiving_result["reject_reason"] == "这是仓库待送店压缩包码，不是正式送货执行码。请让仓库先生成送货执行单并打印正式送店 barcode。"

    _, dispatch_bale, _, _ = _prepare_dispatch_and_store_item(state)
    dispatch_result = state.resolve_barcode(dispatch_bale["bale_no"], context="store_receiving")
    assert dispatch_result["barcode_type"] == "DISPATCH_BALE"
    assert dispatch_result["reject_reason"] == ""


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
    assert created["source_transfer_no"] == "TO-20260428-001"
    assert created["package_count"] == 1

    receiving_result = state.resolve_barcode(created["official_delivery_barcode"], context="store_receiving")
    assert receiving_result["barcode_type"] == "STORE_DELIVERY_EXECUTION"
    assert receiving_result["business_object"]["kind"] == "STORE_DELIVERY_EXECUTION"
    assert receiving_result["object_type"] == "store_delivery_execution"
    assert receiving_result["reject_reason"] == ""

    pos_result = state.resolve_barcode(created["official_delivery_barcode"], context="pos")
    assert pos_result["barcode_type"] == "STORE_DELIVERY_EXECUTION"
    assert pos_result["reject_reason"]


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
    receiving_result = state.resolve_barcode(prep_bale["bale_barcode"], context="store_receiving")
    assert receiving_result["barcode_type"] == "STORE_PREP_BALE"
    assert receiving_result["reject_reason"] == "这是仓库待送店压缩包码，不是正式送货执行码。请让仓库先生成送货执行单并打印正式送店 barcode。"
