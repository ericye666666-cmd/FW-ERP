const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

test("print modal advanced options expose the Windows print helper controls", () => {
  assert.match(indexHtml, /FW-ERP 打印助手/);
  assert.match(indexHtml, /打印助手：未启动/);
  assert.match(indexHtml, /本地地址：http:\/\/127\.0\.0\.1:8719/);
  assert.match(indexHtml, /检测打印助手/);
  assert.match(indexHtml, /检测本机打印机/);
  assert.match(indexHtml, /下载 Windows 打印助手/);
  assert.match(indexHtml, /查看安装步骤/);
  assert.match(indexHtml, /安装包待上传，当前请联系管理员。/);
});

test("print helper detection checks local health and local printers without opening browser print", () => {
  assert.match(appJs, /async function checkLocalPrintAgentPrinters/);
  assert.match(appJs, /fetch\(`\$\{agentUrl\}\/printers`/);
  assert.match(appJs, /已检测到 Deli DL-720C/);
  assert.doesNotMatch(appJs, /checkLocalPrintAgentPrinters[\s\S]{0,1200}browserPrintCurrentBaleModalJob/);
});
