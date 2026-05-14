const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

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

test("retired Today Overview workspace is no longer exposed in app navigation or panels", () => {
  assert.doesNotMatch(indexHtml, /data-workspace-target="overview"/);
  assert.doesNotMatch(indexHtml, /data-workspace-panel="overview"/);
  assert.doesNotMatch(indexHtml, />\s*今日总览\s*</);
  assert.doesNotMatch(appJs, /Today Overview|Dashboard Overview/);

  [
    "先这样测试",
    "全链路流程 / 角色分工",
    "开发顺序 / 开发待办",
    "下一阶段五大块",
    "总览 Dashboard",
    "门店经营摘要",
    "店铺结束营业检查",
    "红色价格预警",
    "线上收款 / 离线同步异常",
    "实时数据查看",
  ].forEach((label) => {
    assert.doesNotMatch(indexHtml, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${label} should not be in index.html`);
  });
});

test("business users do not receive overview access or visible test credentials", () => {
  const profileSource = extractFunctionSource(appJs, "getRoleAccessProfile");
  const workspaceOrderSource = appJs.match(/const WORKSPACE_ORDER = \[[^\]]+\]/)?.[0] || "";
  const setActiveWorkspaceSource = extractFunctionSource(appJs, "setActiveWorkspace");
  const hashRouteSource = extractFunctionSource(appJs, "applyHashRoute");
  const landingSource = extractFunctionSource(appJs, "getUserRoleLanding");

  assert.doesNotMatch(profileSource, /"overview"/);
  assert.doesNotMatch(profileSource, /"store",\s*"testing"/);
  assert.doesNotMatch(workspaceOrderSource, /overview/);
  assert.doesNotMatch(setActiveWorkspaceSource, /overview/);
  assert.match(hashRouteSource, /isPanelAccessible\(targetPanel, currentSession\.user\)/);
  assert.match(hashRouteSource, /redirectToRoleDefaultWorkspace\(currentSession\.user/);
  assert.match(landingSource, /roleCode === "warehouse_manager"[\s\S]*workspace: "warehouse"/);
  assert.doesNotMatch(indexHtml, /admin_1[\s\S]{0,80}demo1234|demo1234[\s\S]{0,80}admin_1/);
  assert.doesNotMatch(appJs, /测试账号默认是 demo1234|Demo accounts use demo1234/);
});
