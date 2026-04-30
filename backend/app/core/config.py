import os
from pathlib import Path
from typing import Mapping, Optional

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Retail Ops System"
    app_version: str = "0.1.0"
    environment: str = "local"
    storage_mode: str = "runtime_json"
    database_url: Optional[str] = None
    host: str = "127.0.0.1"
    port: int = 8000
    backend_dir: Path
    project_dir: Path
    data_dir: Path
    state_file: Path
    frontend_dir: Path
    react_frontend_dir: Path


def _read_path(env: Mapping[str, str], key: str, default: Path) -> Path:
    raw_value = str(env.get(key) or "").strip()
    if not raw_value:
        return default
    return Path(raw_value).expanduser()


def _read_int(env: Mapping[str, str], key: str, default: int) -> int:
    raw_value = str(env.get(key) or "").strip()
    if not raw_value:
        return default
    return int(raw_value)


def _read_choice(env: Mapping[str, str], key: str, default: str, allowed: set[str]) -> str:
    raw_value = str(env.get(key) or "").strip().lower()
    if not raw_value:
        return default
    return raw_value if raw_value in allowed else default


def build_settings(env: Optional[Mapping[str, str]] = None) -> Settings:
    env_map = env if env is not None else dict(os.environ)
    default_project_dir = Path(__file__).resolve().parents[3]
    default_backend_dir = Path(__file__).resolve().parents[2]
    project_dir = _read_path(env_map, "RETAIL_OPS_PROJECT_DIR", default_project_dir)
    backend_dir = _read_path(env_map, "RETAIL_OPS_BACKEND_DIR", project_dir / "backend")
    data_dir = _read_path(env_map, "RETAIL_OPS_DATA_DIR", backend_dir / "data")
    state_file = _read_path(env_map, "RETAIL_OPS_STATE_FILE", data_dir / "runtime_state.json")
    frontend_dir = _read_path(env_map, "RETAIL_OPS_FRONTEND_DIR", project_dir / "frontend_prototype")
    react_frontend_dir = _read_path(
        env_map,
        "RETAIL_OPS_REACT_FRONTEND_DIR",
        project_dir / "frontend_react_admin" / "dist",
    )
    return Settings(
        app_name=str(env_map.get("RETAIL_OPS_APP_NAME") or "Retail Ops System").strip() or "Retail Ops System",
        app_version=str(env_map.get("RETAIL_OPS_APP_VERSION") or "0.1.0").strip() or "0.1.0",
        environment=str(env_map.get("RETAIL_OPS_ENVIRONMENT") or "local").strip() or "local",
        storage_mode=_read_choice(
            env_map,
            "RETAIL_OPS_STORAGE_MODE",
            "runtime_json",
            {"runtime_json", "db", "dual_write"},
        ),
        database_url=str(env_map.get("DATABASE_URL") or "").strip() or None,
        host=str(env_map.get("RETAIL_OPS_HOST") or "127.0.0.1").strip() or "127.0.0.1",
        port=_read_int(env_map, "RETAIL_OPS_PORT", 8000),
        backend_dir=backend_dir,
        project_dir=project_dir,
        data_dir=data_dir,
        state_file=state_file,
        frontend_dir=frontend_dir,
        react_frontend_dir=react_frontend_dir,
    )


settings = build_settings()
