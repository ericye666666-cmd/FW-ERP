# PR 审查模板 / Pull Request Review Template

## 1. 对应 Issue / Related Issue

请填写本 PR 对应的 GitHub Issue 编号。

例如：
Closes #123

对应 Issue：

---

## 2. 本次改动目的 / Purpose

请用简单语言说明这个 PR 要解决什么问题。

在这里填写：

---

## 3. 改动范围 / Scope of Changes

本次 PR 改了哪些内容？

- [ ] 前端 Frontend
- [ ] 后端 Backend
- [ ] 数据库 Database
- [ ] 权限 / RBAC
- [ ] POS
- [ ] 门店收货 Store Receiving
- [ ] 库存 Inventory
- [ ] 货架 Shelf
- [ ] 打印 Printing
- [ ] 部署 / 配置 Deployment
- [ ] 文档 Documentation

具体说明：

1.
2.
3.

---

## 4. 修改文件 / Changed Files

请列出主要修改文件。

例如：
- frontend_prototype/src/xxx
- backend/xxx
- docs/project-brain/xxx

主要文件：

1.
2.
3.

---

## 5. 前端检查 / Frontend Check

如果本 PR 涉及页面、按钮、布局、菜单、跳转，请填写。

- [ ] 已修改前端
- [ ] 不涉及前端

前端改动说明：

1.
2.
3.

需要人工检查的页面：

1.
2.
3.

---

## 6. 后端检查 / Backend Check

如果本 PR 涉及 API、权限、数据库、数据逻辑，请填写。

- [ ] 已修改后端
- [ ] 不涉及后端

后端改动说明：

1.
2.
3.

涉及的 API / 数据表 / 权限：

1.
2.
3.

---

## 7. 权限 / 角色影响 / Permission and Role Impact

本 PR 是否影响角色权限或菜单显示？

- [ ] 是 Yes
- [ ] 否 No
- [ ] 不确定 Not sure

涉及角色：

- [ ] Boss / Admin
- [ ] Area Supervisor 区域主管
- [ ] Warehouse Supervisor 仓库主管
- [ ] Store Manager 店长
- [ ] Clerk 店员
- [ ] Cashier 收银员

说明：

---

## 8. POS 影响检查 / POS Impact Check

- [ ] 不影响 POS
- [ ] 影响 POS 页面
- [ ] 影响 POS 扫码
- [ ] 影响 POS 支付
- [ ] 影响 POS 小票
- [ ] 影响 cashier shift

如果影响 POS，请说明：

---

## 9. 条码规则检查 / Barcode Rule Check

必须确认：

- [ ] POS 仍然只能扫描 STORE_ITEM
- [ ] POS 不接受 RAW_BALE
- [ ] POS 不接受 SDB
- [ ] POS 不接受 LPK
- [ ] POS 不接受 SDO
- [ ] 门店收货仍然只能扫描 SDO
- [ ] SDB 和 LPK 仍然只作为来源参考
- [ ] 没有修改 STORE_ITEM barcode generation
- [ ] 没有修改 barcode resolver 的核心红线

如果本 PR 不涉及条码，也请勾选确认没有影响。

说明：

---

## 10. 禁止文件检查 / Forbidden Files Check

确认本 PR 没有提交以下文件：

- [ ] 没有 secret
- [ ] 没有 .env
- [ ] 没有数据库备份
- [ ] 没有 runtime data
- [ ] 没有 zip
- [ ] 没有 node_modules
- [ ] 没有 cache
- [ ] 没有 dist
- [ ] 没有无关生成文件

---

## 11. 测试结果 / Test Result

请说明已经做过哪些测试。

- [ ] 本地测试通过
- [ ] 后端测试通过
- [ ] 前端 build 通过
- [ ] 手动页面测试通过
- [ ] 尚未测试，需要 reviewer 测试

测试命令：

测试结果：

---

## 12. Staging 部署要求 / Staging Deployment

本 PR 合并后是否需要部署 staging？

- [ ] 需要 Yes
- [ ] 不需要 No
- [ ] 不确定 Not sure

需要重点验证的 staging 页面：

1.
2.
3.

---

## 13. 验收标准 / Acceptance Criteria

请复制 Issue 中的验收标准，并说明本 PR 是否满足。

1.
2.
3.

---

## 14. 不在本次范围 / Out of Scope

本 PR 明确不做什么？

1.
2.
3.

---

## 15. 给 GPT Reviewer 的说明 / Notes for GPT Reviewer

请提醒 GPT 重点审查哪些地方。

例如：
- 请重点检查是否漏改前端按钮
- 请重点检查是否误改 POS 扫码规则
- 请重点检查 staging 是否需要重新部署

说明：

---

## 16. 合并前确认 / Before Merge Checklist

- [ ] PR 对应明确 Issue
- [ ] 没有扩大 scope
- [ ] 没有修改禁止范围
- [ ] 前端 / 后端闭环清楚
- [ ] 需要测试的页面已列出
- [ ] 需要部署 staging 的内容已说明
- [ ] 可以交给 GPT 审查
