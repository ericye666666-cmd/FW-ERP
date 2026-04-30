import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import build_settings


class SettingsEnvTest(unittest.TestCase):
    def test_build_settings_reads_runtime_env_overrides(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            env = {
                "RETAIL_OPS_ENVIRONMENT": "test",
                "RETAIL_OPS_HOST": "0.0.0.0",
                "RETAIL_OPS_PORT": "18100",
                "RETAIL_OPS_DATA_DIR": str(root / "runtime"),
                "RETAIL_OPS_STATE_FILE": str(root / "runtime" / "test_state.json"),
                "RETAIL_OPS_FRONTEND_DIR": str(root / "frontend_prototype"),
                "RETAIL_OPS_REACT_FRONTEND_DIR": str(root / "frontend_react_admin" / "dist"),
            }

            settings = build_settings(env=env)

            self.assertEqual(settings.environment, "test")
            self.assertEqual(settings.host, "0.0.0.0")
            self.assertEqual(settings.port, 18100)
            self.assertEqual(settings.data_dir, root / "runtime")
            self.assertEqual(settings.state_file, root / "runtime" / "test_state.json")
            self.assertEqual(settings.frontend_dir, root / "frontend_prototype")
            self.assertEqual(settings.react_frontend_dir, root / "frontend_react_admin" / "dist")

    def test_build_settings_uses_default_state_file_inside_data_dir(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            env = {
                "RETAIL_OPS_DATA_DIR": str(root / "prod_runtime"),
            }

            settings = build_settings(env=env)

            self.assertEqual(settings.data_dir, root / "prod_runtime")
            self.assertEqual(settings.state_file, root / "prod_runtime" / "runtime_state.json")


if __name__ == "__main__":
    unittest.main()
