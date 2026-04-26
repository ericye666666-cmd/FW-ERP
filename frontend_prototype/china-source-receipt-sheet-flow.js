(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.ChinaSourceReceiptSheetFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || "").trim();
  }

  function escapeHtml(value) {
    return normalizeText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatWholeNumber(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    return numeric.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  function formatWeight(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) {
      return "0";
    }
    return numeric.toLocaleString("en-US", {
      minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  function buildBilingualLabel(primary, secondary) {
    const left = normalizeText(primary);
    const right = normalizeText(secondary);
    if (left && right) {
      return `${left} / ${right}`;
    }
    return left || right || "-";
  }

  function normalizeReceiptSheetLines(lines) {
    return (Array.isArray(lines) ? lines : [])
      .filter((row) => row && (normalizeText(row.package_code) || normalizeText(row.supplier_name) || normalizeText(row.category_sub)))
      .map((row, index) => {
        const packageCount = Number(row.package_count || 0);
        const unitWeightKg = Number(row.unit_weight_kg || 0);
        const totalWeightKg = Number(row.total_weight_kg || (packageCount * unitWeightKg) || 0);
        return {
          rowNo: index + 1,
          supplierName: normalizeText(row.supplier_name) || "-",
          packageCode: normalizeText(row.package_code) || "-",
          categoryMainLabel: buildBilingualLabel(row.category_main, row.category_main_zh),
          categorySubLabel: buildBilingualLabel(row.category_sub, row.category_sub_zh),
          packageCount: packageCount > 0 ? packageCount : 0,
          unitWeightKg: unitWeightKg > 0 ? unitWeightKg : 0,
          totalWeightKg: totalWeightKg > 0 ? totalWeightKg : 0,
        };
      });
  }

  function buildChinaSourceReceiptSheetHtml(record) {
    const lines = normalizeReceiptSheetLines(record && record.lines);
    const customsNoticeNo = normalizeText(record && record.customs_notice_no) || "-";
    const containerType = normalizeText(record && record.container_type) || "-";
    const totalBales = Number(record && record.total_bale_count || lines.reduce((sum, row) => sum + row.packageCount, 0) || 0);
    const totalWeightKg = Number(record && record.domestic_total_weight_kg || lines.reduce((sum, row) => sum + row.totalWeightKg, 0) || 0);
    const rowsHtml = lines.map((row) => `
      <tr>
        <td>${escapeHtml(row.rowNo)}</td>
        <td>${escapeHtml(row.supplierName)}</td>
        <td>${escapeHtml(row.packageCode)}</td>
        <td>${escapeHtml(row.categoryMainLabel)}</td>
        <td>${escapeHtml(row.categorySubLabel)}</td>
        <td class="number-cell">${escapeHtml(formatWholeNumber(row.packageCount))}</td>
        <td class="number-cell">${escapeHtml(formatWeight(row.unitWeightKg))}</td>
        <td class="number-cell">${escapeHtml(formatWeight(row.totalWeightKg))}</td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `).join("");

    return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>中方来源收货对照单 - ${escapeHtml(customsNoticeNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      body {
        margin: 0;
        color: #111;
        font-family: "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
        font-size: 12px;
      }
      .sheet {
        padding: 8mm 6mm;
      }
      .sheet-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8mm;
      }
      .sheet-head h1 {
        margin: 0 0 4mm;
        font-size: 20px;
      }
      .sheet-note {
        font-size: 12px;
        color: #555;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4mm;
        margin-bottom: 6mm;
      }
      .summary-card {
        border: 1px solid #222;
        border-radius: 3mm;
        padding: 3mm 4mm;
      }
      .summary-card strong {
        display: block;
        font-size: 11px;
        color: #555;
        margin-bottom: 2mm;
      }
      .summary-card span {
        font-size: 16px;
        font-weight: 700;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      th, td {
        border: 1px solid #222;
        padding: 2.4mm 2mm;
        vertical-align: top;
        word-break: break-word;
      }
      th {
        background: #f5f1e8;
        text-align: left;
        font-size: 11px;
      }
      .number-cell {
        text-align: right;
      }
      .footer-note {
        margin-top: 5mm;
        font-size: 11px;
        color: #666;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="sheet-head">
        <div>
          <h1>中方来源收货对照单</h1>
          <div class="sheet-note">仅供仓库收货核对使用，不显示成本价。</div>
        </div>
      </div>
      <div class="summary-grid">
        <article class="summary-card"><strong>船单</strong><span>${escapeHtml(customsNoticeNo)}</span></article>
        <article class="summary-card"><strong>整柜类型</strong><span>${escapeHtml(containerType)}</span></article>
        <article class="summary-card"><strong>总包数</strong><span>${escapeHtml(formatWholeNumber(totalBales))}</span></article>
        <article class="summary-card"><strong>总重量 KG</strong><span>${escapeHtml(formatWeight(totalWeightKg))}</span></article>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:5%;">序号</th>
            <th style="width:9%;">供应商</th>
            <th style="width:10%;">包裹编码</th>
            <th style="width:14%;">大类</th>
            <th style="width:18%;">小类</th>
            <th style="width:7%;">包数</th>
            <th style="width:10%;">单包重量 KG</th>
            <th style="width:10%;">总重量 KG</th>
            <th style="width:6%;">到货勾选</th>
            <th style="width:6%;">实收情况</th>
            <th style="width:5%;">备注</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <div class="footer-note">打印后由仓库按单核对供应商、包裹编码、品类、包数和重量，再据此做后续收货。</div>
    </div>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180));</script>
  </body>
</html>`;
  }

  return {
    buildChinaSourceReceiptSheetHtml,
    normalizeReceiptSheetLines,
  };
});
