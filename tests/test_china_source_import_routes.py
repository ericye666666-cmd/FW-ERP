import sys
import unittest
from io import BytesIO

from openpyxl import Workbook

sys.path.insert(0, "/Users/ericye/Desktop/AI自动化/retail_ops_system/backend")

from app.api.routes import _parse_china_source_import_rows


class ChinaSourceImportRoutesTest(unittest.TestCase):
    def test_parse_china_source_import_rows_supports_new_bilingual_template_columns(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "中方整柜导入模板"
        sheet.append([
            "供应商",
            "包裹编码",
            "大类英",
            "大类中",
            "小类中",
            "小类英",
            "包数",
            "单包重量KG",
            "包裹单价",
            "货币",
        ])
        sheet.append([
            "MA",
            "M11-S",
            "DRESS",
            "连衣裙",
            "冬连衣裙",
            "Winter dress",
            2,
            95,
            427.5,
            "CNY",
        ])
        buffer = BytesIO()
        workbook.save(buffer)

        rows = _parse_china_source_import_rows(
            "china_source_bale_import_template_v改.xlsx",
            buffer.getvalue(),
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].package_code, "M11-S")
        self.assertEqual(rows[0].category_main, "DRESS")
        self.assertEqual(rows[0].category_main_zh, "连衣裙")
        self.assertEqual(rows[0].category_sub_zh, "冬连衣裙")
        self.assertEqual(rows[0].category_sub, "Winter dress")
        self.assertEqual(rows[0].package_count, 2)
        self.assertAlmostEqual(rows[0].unit_weight_kg, 95.0, places=2)
        self.assertAlmostEqual(rows[0].unit_cost_amount, 427.5, places=2)
        self.assertEqual(rows[0].unit_cost_currency, "CNY")
        self.assertTrue(rows[0].valid)


if __name__ == "__main__":
    unittest.main()
