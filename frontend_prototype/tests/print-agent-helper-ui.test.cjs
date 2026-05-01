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
const readme = fs.readFileSync(path.join(repoRoot, "ops/local_print_agent/README.md"), "utf8");
const githubWorkflow = fs.existsSync(path.join(repoRoot, ".github/workflows/build-windows-print-agent.yml"))
  ? fs.readFileSync(path.join(repoRoot, ".github/workflows/build-windows-print-agent.yml"), "utf8")
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

test("print agent README separates employee startup from developer exe build", () => {
  assert.match(readme, /普通员工/);
  assert.match(readme, /不需要安装 Python/);
  assert.match(readme, /双击 `启动 FW-ERP 打印助手\.bat`/);
  assert.match(readme, /管理员 \/ 开发者/);
  assert.match(readme, /PyInstaller/);
  assert.match(readme, /build_windows_exe\.ps1/);
  const employeeSection = readme.split("## 普通员工")[1]?.split("## GitHub Actions 自动打包")[0] || "";
  assert.doesNotMatch(employeeSection, /python\.org/i);
  assert.doesNotMatch(employeeSection, /python -m/i);
  assert.doesNotMatch(employeeSection, /PyInstaller/);
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

test("print agent README documents GitHub Actions build path", () => {
  assert.match(readme, /GitHub Actions/);
  assert.match(readme, /Build Windows Print Agent/);
  assert.match(readme, /workflow_dispatch/);
  assert.match(readme, /Artifacts/);
  assert.match(readme, /\/downloads\/fw-erp-print-agent-windows\.zip/);
});
