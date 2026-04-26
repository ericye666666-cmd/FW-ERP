import sys
import unittest

sys.path.insert(0, "/Users/ericye/Desktop/AI自动化/retail_ops_system/backend")

from app.api.routes import _find_system_printer


class PrintEnvironmentTest(unittest.TestCase):
    def test_find_system_printer_accepts_common_queue_name_variants(self):
        printers = [
            {
                "name": "Deli_DL_720C",
                "device_uri": "usb://Deli/DL-720C?serial=P-85GXCM3J",
                "is_ready": True,
            }
        ]

        matched = _find_system_printer(printers, "Deli DL-720C")

        self.assertIsNotNone(matched)
        self.assertEqual(matched["name"], "Deli_DL_720C")


if __name__ == "__main__":
    unittest.main()
