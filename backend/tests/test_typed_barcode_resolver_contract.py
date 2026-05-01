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
    assert created["print_payload"]["human_readable"] == created["execution_order_no"]
    assert created["print_payload"]["barcode_value"] == created["machine_code"]

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
    receiving_result = state.resolve_barcode(prep_bale["machine_code"], context="store_receiving")
    assert receiving_result["barcode_type"] == "STORE_PREP_BALE"
    assert receiving_result["reject_reason"] == "这是仓库待送店压缩包码，不是正式送货执行码。请让仓库先生成送货执行单并打印正式送店 barcode。"


def test_machine_code_mapping_rules_for_lpk_and_sdo(state):
    assert state._physical_label_machine_code("TO-20260428-001", "LPK", source_reference="TO-20260428-001") == "3260428001"
    assert state._physical_label_machine_code("SDO260428001", "SDO") == "4260428001"
    assert state._physical_label_machine_code("ST-20260428-001-0001", "STORE_ITEM") == "5260428001"


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
    assert payload["barcode_value"].startswith("5")
    assert payload["token_no"] == token["token_no"]


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
    assert job["print_payload"]["machine_code"] == raw_bale["machine_code"]
    assert job["print_payload"]["barcode_value"].startswith("1")
