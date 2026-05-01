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

test("print modal advanced options expose the Windows print helper controls", () => {
  assert.match(indexHtml, /FW-ERP 打印助手/);
  assert.match(indexHtml, /打印助手：未启动/);
  assert.match(indexHtml, /本地地址：http:\/\/127\.0\.0\.1:8719/);
  assert.match(indexHtml, /检测打印助手/);
  assert.match(indexHtml, /检测本机打印机/);
  assert.match(indexHtml, /下载 Windows 打印助手/);
  assert.match(indexHtml, /查看安装步骤/);
  assert.match(indexHtml, /点击后会检测安装包/);
  assert.doesNotMatch(indexHtml, /id="balePrintModalDownloadAgentButton"[^>]*disabled/);
  assert.match(indexHtml, /data-download-url="\/downloads\/fw-erp-print-agent-windows\.zip"/);
});

test("print helper detection checks local health and local printers without opening browser print", () => {
  assert.match(appJs, /async function checkLocalPrintAgentPrinters/);
  assert.match(appJs, /fetch\(`\$\{agentUrl\}\/printers`/);
  assert.match(appJs, /已检测到 Deli DL-720C/);
  assert.doesNotMatch(appJs, /checkLocalPrintAgentPrinters[\s\S]{0,1200}browserPrintCurrentBaleModalJob/);
});

test("print helper download checks package availability before downloading", () => {
  assert.match(appJs, /async function downloadWindowsPrintAgentPackage/);
  assert.match(appJs, /\/downloads\/fw-erp-print-agent-windows\.zip/);
  assert.match(appJs, /fetch\(downloadUrl,\s*\{\s*method:\s*"HEAD"/);
  assert.match(appJs, /安装包暂未上传，请联系管理员。/);
  assert.match(appJs, /balePrintModalDownloadAgentButton/);
});

test("Windows print agent package script and zip ignore rules are present", () => {
  assert.match(packageScript, /fw-erp-print-agent-windows\.zip/);
  assert.match(packageScript, /agent\.py/);
  assert.match(packageScript, /start_windows\.ps1/);
  assert.match(packageScript, /print_station_config\.example\.json/);
  assert.match(packageScript, /Compress-Archive/);
  assert.match(gitignore, /fw-erp-print-agent-windows\.zip/);
  assert.match(gitignore, /ops\/local_print_agent\/\*\.zip/);
  assert.match(gitignore, /downloads\/\*\.zip/);
});
