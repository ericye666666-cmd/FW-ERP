const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
const repoRoot = path.join(__dirname, "..", "..");
const gitignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
const packageScript = fs.existsSync(path.join(repoRoot, "ops/local_print_agent/package_windows_agent.ps1"))
  ? fs.readFileSync(path.join(repoRoot, "ops/local_print_agent/package_windows_agent.ps1"), "utf8")
  : "";
const buildExeScript = fs.existsSync(path.join(repoRoot, "ops/local_print_agent/build_windows_exe.ps1"))
  ? fs.readFileSync(path.join(repoRoot, "ops/local_print_agent/build_windows_exe.ps1"), "utf8")
  : "";
const employeeBat = fs.existsSync(path.join(repoRoot, "ops/local_print_agent/start_fwerp_print_agent_windows.bat"))
  ? fs.readFileSync(path.join(repoRoot, "ops/local_print_agent/start_fwerp_print_agent_windows.bat"), "utf8")
  : "";
const warehouseLauncherCmd = fs.existsSync(path.join(repoRoot, "ops/local_print_agent/start_warehouse_print_agent.cmd"))
  ? fs.readFileSync(path.join(repoRoot, "ops/local_print_agent/start_warehouse_print_agent.cmd"), "utf8")
  : "";
const readme = fs.readFileSync(path.join(repoRoot, "ops/local_print_agent/README.md"), "utf8");
const githubWorkflow = fs.existsSync(path.join(repoRoot, ".github/workflows/build-windows-print-agent.yml"))
  ? fs.readFileSync(path.join(repoRoot, ".github/workflows/build-windows-print-agent.yml"), "utf8")
  : "";

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `missing function body for ${functionName}`);
  const braceStart = signatureEnd + 2;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`could not extract ${functionName}`);
}

function extractConstSource(source, constName) {
  const match = source.match(new RegExp(`const ${constName} = [^;]+;`));
  assert.ok(match, `missing const ${constName}`);
  return match[0];
}

function loadLocalAgentValidationHelpers() {
  const optionalEntityPrefix = appJs.includes("function getLocalAgentEntityMachinePrefix")
    ? extractFunctionSource(appJs, "getLocalAgentEntityMachinePrefix")
    : "";
  const optionalSdoPackageLabel = appJs.includes("function isSdoPackageLocalAgentLabel")
    ? extractFunctionSource(appJs, "isSdoPackageLocalAgentLabel")
    : "";
  return Function(`
    ${extractFunctionSource(appJs, "normalizeLocalAgentMachineBarcode")}
    ${extractFunctionSource(appJs, "getLocalAgentTemplateMachinePrefix")}
    ${extractFunctionSource(appJs, "getLocalAgentDisplayMachinePrefix")}
    ${optionalEntityPrefix}
    ${extractConstSource(appJs, "RAW_BALE_MISSING_MACHINE_CODE_MESSAGE")}
    ${extractConstSource(appJs, "SDO_PACKAGE_MISSING_MACHINE_CODE_MESSAGE")}
    ${extractFunctionSource(appJs, "doesLocalAgentLabelTypeMatch")}
    ${extractFunctionSource(appJs, "isRawBaleLocalAgentLabel")}
    ${optionalSdoPackageLabel}
    ${extractFunctionSource(appJs, "validateLocalAgentLabelPayload")}
    ${extractFunctionSource(appJs, "buildLocalAgentLabelPayload")}
    return {
      buildLocalAgentLabelPayload,
      doesLocalAgentLabelTypeMatch,
      validateLocalAgentLabelPayload,
    };
  `)();
}

test("print modal advanced options expose only field-safe print helper controls", () => {
  assert.match(indexHtml, /FW-ERP 打印助手/);
  assert.match(indexHtml, /打印助手：未启动/);
  assert.match(indexHtml, /本地地址：http:\/\/127\.0\.0\.1:8719/);
  assert.match(indexHtml, /检测打印助手/);
  assert.match(indexHtml, /检测打印机队列/);
  assert.match(indexHtml, /id="balePrintModalLocalAgentPrintButton"[^>]*>高级：重试本张<\/button>/);
  assert.match(indexHtml, /id="balePrintModalPrintAllButton"[^>]*>高级：批量重试<\/button>/);
  const advancedSection = indexHtml.match(/<details id="balePrintModalAdvancedOptions"[\s\S]*?<\/details>/)?.[0] || "";
  const primaryActions = indexHtml.match(/<div class="bale-print-primary-actions">[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(advancedSection, /id="balePrintModalDownloadAgentLink"/);
  assert.match(advancedSection, /href="\/downloads\/start_warehouse_print_agent\.cmd"/);
  assert.match(advancedSection, /download="start_warehouse_print_agent\.cmd"/);
  assert.match(advancedSection, /下载 Start Warehouse Print Agent/);
  assert.match(advancedSection, /仓库打印电脑先双击 Start Warehouse Print Agent，保持黑色窗口不要关闭，再点击检测打印助手/);
  assert.doesNotMatch(advancedSection, /\.zip|\.exe|\.ps1/);
  assert.doesNotMatch(primaryActions, /balePrintModalDownloadAgentLink|下载 Start Warehouse Print Agent|Download Start Warehouse Print Agent/);
  assert.doesNotMatch(advancedSection, /查看安装步骤/);
  assert.doesNotMatch(advancedSection, /直接打印本张/);
  assert.doesNotMatch(advancedSection, /发送到打印站/);
  assert.doesNotMatch(advancedSection, /用浏览器打印/);
  assert.doesNotMatch(advancedSection, /刷新预览/);
});

test("test tools expose RAW_BALE barcode data repair controls", () => {
  const testingPanel = indexHtml.match(/<section class="panel" data-workspace-panel="testing">[\s\S]*?<pre id="storeRecentSalesSimulationOutput" class="output hidden-output"><\/pre>/)?.[0] || "";
  assert.match(testingPanel, /条码识别测试/);
  assert.match(testingPanel, /RAW_BALE 条码数据修复/);
  assert.match(testingPanel, /预检查 RAW_BALE 条码数据/);
  assert.match(testingPanel, /确认修复 RAW_BALE 条码数据/);
  assert.match(testingPanel, /修复历史 RAW_BALE 缺少正式 machine_code 的数据/);
  assert.match(testingPanel, /不会修改 POS、库存、成本、SDB、LPK、SDO 或 STORE_ITEM 规则/);
  assert.match(indexHtml, /data-action="raw-bale-machine-code-repair-dry-run"/);
  assert.match(indexHtml, /data-action="raw-bale-machine-code-repair-apply"/);
  assert.match(indexHtml, /id="rawBaleMachineCodeRepairSummary"/);
  assert.match(indexHtml, /id="rawBaleMachineCodeRepairOutput"/);
});

test("RAW_BALE machine_code repair UI calls the admin repair endpoint with dry-run first", () => {
  assert.match(appJs, /async function runRawBaleMachineCodeRepair/);
  assert.match(appJs, /\/admin\/tools\/raw-bale-machine-code-repair/);
  assert.match(appJs, /dry_run:\s*dryRun/);
  assert.match(appJs, /raw-bale-machine-code-repair-dry-run/);
  assert.match(appJs, /raw-bale-machine-code-repair-apply/);
  assert.match(appJs, /确定要修复 RAW_BALE machine_code 吗？此操作只修复历史 RAW_BALE 条码数据，不会修改 POS、库存、成本。/);
  assert.match(appJs, /would_update_raw_bales/);
  assert.match(appJs, /would_update_print_jobs/);
  assert.match(appJs, /skipped/);
  assert.match(appJs, /sample/);
  assert.match(appJs, /登录已过期，请重新登录后再执行修复。/);
});

test("print helper detection checks local health and local printers without opening browser print", () => {
  assert.match(appJs, /async function checkLocalPrintAgentConnection/);
  assert.match(appJs, /await checkLocalPrintAgentHealth\(\)/);
  assert.match(appJs, /await checkLocalPrintAgentPrinters\(\)/);
  assert.match(appJs, /#balePrintModalCheckLocalAgentButton[\s\S]{0,260}checkLocalPrintAgentConnection\(\)/);
  assert.match(appJs, /async function checkLocalPrintAgentPrinters/);
  assert.match(appJs, /fetch\(`\$\{agentUrl\}\/printers`/);
  assert.match(appJs, /打印机队列/);
  assert.match(appJs, /已发现 Deli DL-720C 打印队列，请确认打印机电源和 USB 已连接。/);
  assert.match(appJs, /当前未检测到本机打印队列。/);
  assert.match(appJs, /已检测到 \$\{rows\.length\} 个打印队列，未发现 Deli DL-720C。/);
  assert.doesNotMatch(appJs, /Deli DL-720C 当前在线/);
  assert.doesNotMatch(appJs, /已检测到 Deli DL-720C/);
  assert.doesNotMatch(appJs, /checkLocalPrintAgentPrinters[\s\S]{0,1200}browserPrintCurrentBaleModalJob/);
});

test("local agent connection failures explain Windows startup, port, and browser localhost access", () => {
  assert.match(appJs, /请确认 Windows 打印助手已启动、端口 8719 未被占用、浏览器允许访问本机 127\.0\.0\.1/);
  assert.match(appJs, /formatLocalPrintAgentConnectionError/);
  assert.match(appJs, /new Error\(message\)/);
});

test("printer detection clears stale Deli state before each request and on failure", () => {
  const printerFunction = appJs.match(/async function checkLocalPrintAgentPrinters[\s\S]*?function getWindowsPrintAgentDownloadUrl/)[0];
  assert.match(printerFunction, /localPrintAgentState\.printers\s*=\s*\[\]/);
  assert.match(printerFunction, /localPrintAgentState\.printerMessage\s*=\s*""/);
  assert.match(printerFunction, /localPrintAgentState\.printerChecking\s*=\s*true/);
  assert.match(printerFunction, /catch \(error\)[\s\S]*localPrintAgentState\.printers\s*=\s*\[\]/);
  assert.doesNotMatch(printerFunction, /catch \(error\)[\s\S]*已检测到 Deli DL-720C/);
});

test("local agent primary label printing uses raw label endpoint instead of browser HTML", () => {
  assert.match(appJs, /async function printCurrentBaleModalViaLocalAgent/);
  assert.match(appJs, /fetch\(`\$\{agentUrl\}\/print\/label`/);
  assert.doesNotMatch(appJs, /printCurrentBaleModalViaLocalAgent[\s\S]{0,2400}\/print\/html/);
  assert.match(appJs, /label_payload:\s*labelPayload/);
  assert.match(appJs, /barcode_value:\s*labelPayload\.barcode_value/);
});

test("frontend validates local agent label machine code before calling print agent", () => {
  assert.match(appJs, /function validateLocalAgentLabelPayload/);
  assert.match(appJs, /\^\[1-6\]\\d\{9\}\$/);
  assert.match(appJs, /当前 bale 缺少正式 machine_code，请重新生成入库标签或联系管理员修复数据。/);
  assert.match(appJs, /doesLocalAgentLabelTypeMatch/);
  assert.match(appJs, /template_code:\s*selectedTemplateCode/);

  const printFunction = appJs.match(/async function printCurrentBaleModalViaLocalAgent[\s\S]*?async function printCurrentBaleModalPrimaryAction/)[0];
  assert.match(printFunction, /validateLocalAgentLabelPayload\(labelPayload,\s*\{/);
  assert.match(printFunction, /throw new Error\(validationError\)/);
  assert.doesNotMatch(printFunction, /fetch\(`\$\{agentUrl\}\/print\/label`[\s\S]*?validateLocalAgentLabelPayload/);
});

test("SDO_PACKAGE local agent guard accepts package labels and rejects parent or source barcodes", () => {
  const { buildLocalAgentLabelPayload, validateLocalAgentLabelPayload } = loadLocalAgentValidationHelpers();
  const sdoPackagePayload = {
    entity_type: "STORE_DELIVERY_PACKAGE",
    template_code: "store_dispatch_60x40",
    template_scope: "warehouseout_bale",
    display_code: "SDP261240003",
    machine_code: "6261240003",
    barcode_value: "6261240003",
    human_readable: "6261240003",
    parent_sdo_display_code: "SDO260429001",
    parent_sdo_machine_code: "4260429001",
    store_code: "UTAWALA",
    package_no: 1,
    package_total: 2,
    source_type: "SDB",
    source_code: "SDB-TO202604-001",
    source_machine_code: "2260429001",
    item_count: 120,
    content_summary: "tops / lady tops",
  };

  assert.equal(validateLocalAgentLabelPayload(sdoPackagePayload, { templateCode: "store_dispatch_60x40" }), "");
  const localPayload = buildLocalAgentLabelPayload({ print_payload: sdoPackagePayload }, {});
  assert.equal(localPayload.entity_type, "STORE_DELIVERY_PACKAGE");
  assert.equal(localPayload.display_code, "SDP261240003");
  assert.equal(localPayload.machine_code, "6261240003");
  assert.equal(localPayload.barcode_value, "6261240003");
  assert.equal(localPayload.parent_sdo_machine_code, "4260429001");
  assert.equal(localPayload.source_code, "SDB-TO202604-001");
  assert.equal(localPayload.item_count, 120);

  ["", "4261240003", "2261240003", "3261240003"].forEach((machineCode) => {
    const error = validateLocalAgentLabelPayload(
      {
        ...sdoPackagePayload,
        machine_code: machineCode,
        barcode_value: machineCode,
      },
      { templateCode: "store_dispatch_60x40" },
    );
    assert.match(error, /当前 SDO 缺少 6 开头实体包码，请先生成 SDO_PACKAGE 后再打印。/);
  });
});

test("print helper exposes a static Windows agent download link in advanced options", () => {
  const advancedSection = indexHtml.match(/<details id="balePrintModalAdvancedOptions"[\s\S]*?<\/details>/)?.[0] || "";
  const primaryActions = indexHtml.match(/<div class="bale-print-primary-actions">[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(advancedSection, /id="balePrintModalDownloadAgentLink"/);
  assert.match(advancedSection, /href="\/downloads\/start_warehouse_print_agent\.cmd"/);
  assert.match(advancedSection, /download="start_warehouse_print_agent\.cmd"/);
  assert.match(advancedSection, /下载 Start Warehouse Print Agent/);
  assert.match(advancedSection, /仓库打印电脑先双击 Start Warehouse Print Agent，保持黑色窗口不要关闭，再点击检测打印助手/);
  assert.doesNotMatch(advancedSection, /\.zip|\.exe|\.ps1/);
  assert.match(appJs, /Download Start Warehouse Print Agent/);
  assert.match(appJs, /const WINDOWS_PRINT_AGENT_DOWNLOAD_FILENAME = "start_warehouse_print_agent\.cmd"/);
  assert.match(appJs, /new Blob\(\[WINDOWS_PRINT_AGENT_LAUNCHER_SCRIPT\]/);
  assert.doesNotMatch(primaryActions, /balePrintModalDownloadAgentLink|下载 Start Warehouse Print Agent|Download Start Warehouse Print Agent/);
  assert.doesNotMatch(indexHtml, /id="balePrintModalDownloadAgentButton"/);
  assert.doesNotMatch(appJs, /balePrintModalDownloadAgentButton/);
  assert.doesNotMatch(appJs, /fetch\(downloadUrl,\s*\{\s*method:\s*"HEAD"/);
});

test("Warehouse CMD launcher starts local-api without PowerShell or auto Python install", () => {
  assert.match(warehouseLauncherCmd, /curl\.exe -fL --retry 3 -o agent\.py "%AGENT_URL%"/);
  assert.match(warehouseLauncherCmd, /curl\.exe -fL --retry 3 -o requirements\.txt "%REQ_URL%"/);
  assert.match(warehouseLauncherCmd, /set "INSTALL_DIR=%LOCALAPPDATA%\\FW-ERP\\PrintAgent"/);
  assert.match(warehouseLauncherCmd, /py -3 -c "import sys"/);
  assert.match(warehouseLauncherCmd, /python -c "import sys"/);
  assert.match(warehouseLauncherCmd, /Install Python 3 and check Add Python to PATH, then run this file again\./);
  assert.match(warehouseLauncherCmd, /%PYTHON_CMD% -m venv \.venv/);
  assert.match(warehouseLauncherCmd, /\.venv\\Scripts\\python\.exe/);
  assert.match(warehouseLauncherCmd, /"%AGENT_PYTHON%" agent\.py local-api/);
  assert.match(warehouseLauncherCmd, /Keep this window open while printing\./);
  assert.match(warehouseLauncherCmd, /127\.0\.0\.1:8719/);
  assert.doesNotMatch(warehouseLauncherCmd, /powershell|ExecutionPolicy|winget|Expand-Archive|\.zip|FW-ERP-Print-Agent\.exe|start_fwerp_print_agent_windows\.ps1/i);
});

test("Windows print agent package script and zip ignore rules are present", () => {
  assert.match(packageScript, /fw-erp-print-agent-windows\.zip/);
  assert.match(packageScript, /FW-ERP-Print-Agent\.exe/);
  assert.match(packageScript, /start_fwerp_print_agent_windows\.bat/);
  assert.match(packageScript, /Run build_windows_exe\.ps1 on a Windows build machine first/);
  assert.match(packageScript, /print_station_config\.example\.json/);
  assert.match(packageScript, /Compress-Archive/);
  assert.match(gitignore, /fw-erp-print-agent-windows\.zip/);
  assert.match(gitignore, /ops\/local_print_agent\/dist\//);
  assert.match(gitignore, /ops\/local_print_agent\/build\//);
  assert.match(gitignore, /ops\/local_print_agent\/\*\.spec/);
  assert.match(gitignore, /ops\/local_print_agent\/FW-ERP-Print-Agent\.exe/);
  assert.match(gitignore, /ops\/local_print_agent\/\*\.zip/);
  assert.match(gitignore, /downloads\/\*\.zip/);
});

test("Windows employee launcher starts bundled exe without requiring Python", () => {
  assert.match(employeeBat, /FW-ERP-Print-Agent\.exe/);
  assert.match(employeeBat, /local-api/);
  assert.match(employeeBat, /FW-ERP-Print-Agent\.exe not found\. Please download the official print agent package\./);
  assert.doesNotMatch(employeeBat, /python\s+agent\.py/i);
  assert.doesNotMatch(employeeBat, /pip install/i);
});

test("Windows exe build script uses PyInstaller for administrator packaging", () => {
  assert.match(buildExeScript, /PyInstaller/);
  assert.match(buildExeScript, /python -m pip install pyinstaller/);
  assert.match(buildExeScript, /--onefile/);
  assert.match(buildExeScript, /--name\s+FW-ERP-Print-Agent/);
  assert.match(buildExeScript, /dist[\\/]FW-ERP-Print-Agent\.exe/);
});

test("print agent README documents the fixed warehouse CMD startup path", () => {
  assert.match(readme, /FW-ERP Warehouse Print Station/);
  assert.match(readme, /Install Python 3 on the warehouse Windows computer once/);
  assert.match(readme, /Add Python to PATH/);
  assert.match(readme, /Double-click `start_warehouse_print_agent\.cmd`/);
  assert.match(readme, /Keep the black window open while printing/);
  assert.match(readme, /Do not use the PowerShell launcher as the main warehouse startup path/);
  assert.match(readme, /uses `curl\.exe` to download\/update `agent\.py` and `requirements\.txt`/);
  assert.match(readme, /%LOCALAPPDATA%\\FW-ERP\\PrintAgent/);
  assert.match(readme, /Install Python 3 and check Add Python to PATH, then run this file again\./);
  assert.match(readme, /\.venv\\Scripts\\python\.exe agent\.py local-api/);
  assert.match(readme, /仓库打印电脑先双击 Start Warehouse Print Agent，保持黑色窗口不要关闭，再点击检测打印助手。/);
});

test("GitHub Actions workflow builds Windows print agent artifacts", () => {
  assert.match(githubWorkflow, /name:\s*Build Windows Print Agent/);
  assert.match(githubWorkflow, /workflow_dispatch:/);
  assert.match(githubWorkflow, /ops\/local_print_agent\/\*\*/);
  assert.match(githubWorkflow, /\.github\/workflows\/build-windows-print-agent\.yml/);
  assert.match(githubWorkflow, /runs-on:\s*windows-latest/);
  assert.match(githubWorkflow, /actions\/setup-python@v5/);
  assert.match(githubWorkflow, /python -m pip install pyinstaller/);
  assert.match(githubWorkflow, /build_windows_exe\.ps1/);
  assert.match(githubWorkflow, /package_windows_agent\.ps1/);
  assert.match(githubWorkflow, /FW-ERP-Print-Agent\.exe/);
  assert.match(githubWorkflow, /fw-erp-print-agent-windows\.zip/);
  assert.match(githubWorkflow, /actions\/upload-artifact@v4/);
});

test("print agent README documents TSPL raw label printing as the formal Deli path", () => {
  assert.match(readme, /RAW TSPL/);
  assert.match(readme, /\/print\/label/);
  assert.match(readme, /60x40 labels/);
  assert.match(readme, /RAW_BALE barcode and label rules are not changed/);
});
