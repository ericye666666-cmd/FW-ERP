---
name: 功能需求 / Feature Request
about: 用于提出新功能、页面改造、流程优化需求
title: "[FEATURE] "
labels: enhancement
assignees: ''
---

# 功能需求 / Feature Request

## 1. 标题 / Title

请用一句话说明要做什么功能。

示例：
增加门店库存总览页面，支持按品类和货架查看库存

---

## 2. 需求背景 / Background

为什么需要这个功能？

请说明当前业务中遇到的问题，或者为什么现有系统不够用。

在这里写需求背景。

---

## 3. 使用角色 / User Role

这个功能主要给谁使用？

- [ ] Boss / Admin 老板 / 管理员
- [ ] Area Supervisor 区域主管
- [ ] Warehouse Supervisor 仓库主管
- [ ] Store Manager 店长
- [ ] Clerk 店员
- [ ] Cashier 收银员
- [ ] 不确定 Not sure

---

## 4. 使用场景 / Use Case

员工在什么情况下会用这个功能？

示例：
店长需要每天查看门店库存，确认哪些商品已经入库、哪些商品还没有绑定货架位。

在这里写使用场景。

---

## 5. 功能描述 / Feature Description

请说明这个功能具体要做什么。

1.
2.
3.
4.

---

## 6. 页面位置 / Page Location

这个功能应该放在哪里？

示例：
店长 PDA 工作台下面 / POS 页面 / 门店收货 Page 5 / 库存模块 / 仓库主管菜单

在这里写页面位置。

---

## 7. 前端要求 / Frontend Requirements

页面、按钮、布局、交互需要怎么做？

1.
2.
3.

如果没有特别要求，可以写：由 Codex 根据现有系统风格实现，保持简洁清楚。

---

## 8. 后端要求 / Backend Requirements

是否需要新增 API、权限、数据库字段、数据统计？

- [ ] 需要
- [ ] 不需要
- [ ] 不确定

具体说明：

1.
2.
3.

---

## 9. 权限要求 / Permission Requirements

哪些角色可以看到或使用这个功能？

- [ ] Boss / Admin
- [ ] Area Supervisor
- [ ] Warehouse Supervisor
- [ ] Store Manager
- [ ] Clerk
- [ ] Cashier
- [ ] 不确定 Not sure

权限说明：

在这里写权限要求。

---

## 10. 数据来源 / Data Source

这个功能的数据从哪里来？

示例：
STORE_ITEM、库存表、门店表、货架表、SDO 收货记录、POS 销售记录。

在这里写数据来源。

---

## 11. 验收标准 / Acceptance Criteria

功能完成后，如何确认它已经做好？

1.
2.
3.
4.

---

## 12. 不做什么 / Out of Scope

本次功能不做哪些事情？

示例：
本次只做管理员网页版，不嵌入店员安卓端。
本次只做只读展示，不做状态持久化。
本次不改 POS 扫码规则。

在这里写不做的范围。

---

## 13. 禁止改动范围 / Do Not Change

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

## 14. 给 Codex / Agent 的备注 / Notes for Codex or Agent

如有特别说明，请写在这里。
如果没有，可以留空。
