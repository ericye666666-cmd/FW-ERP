import json
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes as routes_module
from app.core.config import settings
from app.core.state import InMemoryState


def _isolated_state():
    temp_dir = tempfile.TemporaryDirectory()
    original_state_file = settings.state_file
    settings.state_file = Path(temp_dir.name) / "runtime_state.json"
    test_state = InMemoryState()
    return temp_dir, original_state_file, test_state


def test_pda_diagnostic_event_state_caps_latest_300_and_strips_tokens():
    temp_dir, original_state_file, state = _isolated_state()
    try:
        for index in range(305):
            state.record_pda_diagnostic_event(
                {
                    "event_type": "s1_printer_diagnostic_click",
                    "source": "clerk_pda",
                    "page": "printer_connection",
                    "method": "printS1RawTsplMinText",
                    "protocol_key": f"raw_tspl_min_text_{index}",
                    "payload": {
                        "safe": index,
                        "Authorization": "Bearer SECRET_TOKEN",
                        "access_token": "SECRET_TOKEN",
                    },
                },
                authenticated_user={"username": "Austin", "role_code": "store_clerk"},
                remote_addr="127.0.0.1",
            )

        latest = state.list_pda_diagnostic_events(limit=500)

        assert len(latest) == 300
        assert latest[0]["protocol_key"] == "raw_tspl_min_text_304"
        assert latest[-1]["protocol_key"] == "raw_tspl_min_text_5"
        assert latest[0]["authenticated_username"] == "Austin"
        assert latest[0]["remote_addr"] == "127.0.0.1"
        serialized = json.dumps(latest)
        assert "SECRET_TOKEN" not in serialized
        assert "Authorization" not in serialized
        assert "access_token" not in serialized

        log_file = settings.state_file.parent / "pda_diagnostic_events.log"
        assert log_file.exists()
        log_text = log_file.read_text(encoding="utf-8")
        assert "SECRET_TOKEN" not in log_text
        assert "raw_tspl_min_text_304" in log_text
    finally:
        settings.state_file = original_state_file
        temp_dir.cleanup()


class _Request:
    class _Client:
        host = "127.0.0.1"

    client = _Client()


def test_pda_diagnostic_events_api_requires_auth_stores_and_returns_latest():
    temp_dir, original_state_file, test_state = _isolated_state()
    original_routes_state = routes_module.state
    routes_module.state = test_state
    try:
        with pytest.raises(HTTPException) as exc:
            routes_module.create_pda_diagnostic_event(
                {"event_type": "pda_runtime_info", "source": "clerk_pda"},
                request=_Request(),
                authorization=None,
            )
        assert exc.value.status_code == 401

        session = test_state.authenticate_user("Austin", "demo1234")
        token = session["access_token"]

        created_body = routes_module.create_pda_diagnostic_event(
            {
                "event_type": "s1_printer_diagnostic_result",
                "source": "clerk_pda",
                "page": "printer_connection",
                "username": "Austin",
                "store_code": "UTAWALA",
                "selected_printer_name": "S1-3696",
                "selected_printer_address": "43:54:57:0A:36:96",
                "selected_profile": "CHITENG_S1_OFFICIAL",
                "method": "printS1RawTsplMinText",
                "protocol_key": "raw_tspl_min_text",
                "payload": {"Authorization": "Bearer SHOULD_NOT_STORE", "safe": "ok"},
                "android_result": {
                    "last_protocol_tested": "S1_RAW_TSPL_MIN_TEXT",
                    "last_preview_transport": "RAW_TSPL_SPP",
                    "last_preview_tspl_bytes": 120,
                },
                "error_message": "",
                "user_agent": "PDA WebView",
                "web_version": "fw-erp-web-test",
                "pda_bundle_version": "./app.legacy.js?v=test",
                "created_at_client": "2026-05-10T15:00:00+03:00",
            },
            request=_Request(),
            authorization=f"Bearer {token}",
        )
        assert created_body["event_type"] == "s1_printer_diagnostic_result"
        assert created_body["authenticated_username"] == "Austin"
        assert "server_received_at" in created_body
        assert "SHOULD_NOT_STORE" not in json.dumps(created_body)

        events = routes_module.list_pda_diagnostic_events(
            limit=1,
            authorization=f"Bearer {token}",
        )
        assert len(events) == 1
        assert events[0]["method"] == "printS1RawTsplMinText"
        assert events[0]["android_result"]["last_preview_tspl_bytes"] == 120
        assert "SHOULD_NOT_STORE" not in json.dumps(events)
    finally:
        routes_module.state = original_routes_state
        settings.state_file = original_state_file
        temp_dir.cleanup()
