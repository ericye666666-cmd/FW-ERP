---
name: Bug 报告 / Bug Report
about: 用于记录 staging 或 production 中发现的问题
title: "[BUG] "
labels: bug
assignees: ''
---

# Bug 报告 / Bug Report

## 1. 标题 / Title

请用一句话说明问题。

示例：
staging POS 页面在 1366×768 收银一体机上显示不完整

---

## 2. 环境 / Environment

请选择：

- [ ] Staging 测试环境
- [ ] Production 真实环境
- [ ] 本地开发环境
- [ ] 不确定 Not sure

环境地址：

请填写页面地址，例如：
https://staging.directlooperp.com/app/

---

## 3. 账号 / 角色 / Account and Role

账号 / 员工名字：

请填写账号或员工名字

角色：

- [ ] Boss / Admin 老板 / 管理员
- [ ] Area Supervisor 区域主管
- [ ] Warehouse Supervisor 仓库主管
- [ ] Store Manager 店长
- [ ] Clerk 店员
- [ ] Cashier 收银员
- [ ] 不确定 Not sure

门店 / 仓库：

例如：Utawala / Lucky Summer / Kawangware / Warehouse

---

## 4. 页面路径 / Page Path

例如：
POS 页面 / 登录页 / 店长工作台 / 门店收货 Page 5 / 库存总览 / 货架位编辑

---

## 5. 问题现象 / Issue Description

请说明你看到了什么问题。

在这里写问题现象。

---

## 6. 操作步骤 / Steps to Reproduce

请写出如何重新看到这个问题。

1.
2.
3.
4.

---

## 7. 期望结果 / Expected Result

正常情况下应该发生什么？

在这里写期望结果。

---

## 8. 实际结果 / Actual Result

实际发生了什么？

在这里写实际结果。

---

## 9. 截图 / 视频 / Screenshot or Video

请上传截图或视频。

如果截图在 PPT 里，请说明文件名或截图位置。

---

## 10. 严重程度 / Severity

请选择一个：

- [ ] Low 低：文案、轻微样式问题，不影响操作
- [ ] Medium 中：有影响，但可以绕过
- [ ] High 高：明显影响日常使用，需要优先修
- [ ] Critical 严重：无法登录、无法收银、核心流程断掉

---

## 11. 是否影响上线 / Does it affect launch?

- [ ] 是 Yes
- [ ] 否 No
- [ ] 不确定 Not sure

---

## 12. 是否影响日常使用 / Does it affect daily operation?

- [ ] 是 Yes
- [ ] 否 No
- [ ] 不确定 Not sure

---

## 13. 可能涉及范围 / Possible Area

可多选：

- [ ] 前端 Frontend：页面、按钮、布局、交互
- [ ] 后端 Backend：API、权限、数据、数据库
- [ ] 部署 Deployment：VM、服务重启、环境变量、staging 未更新
- [ ] 权限 Permission / RBAC
- [ ] POS
- [ ] 门店收货 Store Receiving
- [ ] 库存 Inventory
- [ ] 货架 Shelf
- [ ] 打印 Printing
- [ ] 不确定 Not sure

---

## 14. 验收标准 / Acceptance Criteria

修好后，如何确认这个问题已经解决？

1.
2.
3.

---

## 15. 禁止改动范围 / Do Not Change

除非本 Issue 明确要求，否则禁止：

- 不要修改 POS 扫码规则
- 不要让 POS 接受 RAW_BALE / SDB / LPK / SDO
- 不要让门店收货接受 SDB / LPK 作为正式收货码
- 不要修改 STORE_ITEM barcode generation
- 不要修改 barcode resolver 的核心红线
- 不要修改库存统计口径
- 不要修改 production 配置
- 不要上传 secret、.env、数据库备份、runtime data、zip、node_modules、cache、dist
- 不要大范围重构
- 不要顺手修改无关页面

---

## 16. 给 Codex / Agent 的备注 / Notes for Codex or Agent

如有特别说明，请写在这里。
如果没有，可以留空。
