# FW-ERP RBAC 上线计划（2026-05）

本计划用于 Direct Loop Retail Ops System 上线前第一阶段 RBAC 权限收口。

## 1. 上线角色定义

- `admin`：当前最高权限，用于系统管理、配置、测试和必要的上线维护。
- `area_supervisor`：老板助手 / 区域运营主管，负责门店录入、门店基础资料维护、门店员工账号管理和区域运营只读查看。
- `warehouse_supervisor`：仓库主管。
- `warehouse_manager`：仓库管理。
- `warehouse_clerk`：仓库员工。
- `store_manager`：店长。
- `store_clerk`：店员。
- `cashier`：收银员。
- `external_auditor`：外部审计；如启用，保持只读。

## 2. admin 仍是最高权限

上线阶段暂时不新增 `owner` 角色。

`admin` 继续作为最高权限角色，但不得绕过业务硬规则：

- POS barcoded sale 只能销售 `STORE_ITEM`。
- `STORE_ITEM machine_code / barcode_value` 只能由后端生成。
- SDP assignment lock、STORE_ITEM 幂等、sold lock、打印和入库分离规则必须保留。
- 不改变现有 admin 语义。

## 3. area_supervisor 定义

`area_supervisor` 是老板助手 / 区域运营主管。

当前上线阶段默认只有一个 `area_supervisor`，不做“给区域主管分配门店”的页面。

`area_supervisor` 可以录入目前所有已开门店。由 `area_supervisor` 创建的新门店，会自动加入该用户自己的 `managed_store_codes`。

后续如果出现多个区域主管，再单独做门店分配功能；本阶段不做。

## 4. area_supervisor 允许动作

`area_supervisor` 允许：

- 创建门店。
- 编辑门店基础资料：门店名称、地址、电话、Google Maps 链接、备注。
- 编辑营业状态：`preparing` / `active` / `paused` / `closed`。
- 创建门店员工账号：`store_manager` / `store_clerk` / `cashier`。
- 重置门店员工密码：`store_manager` / `store_clerk` / `cashier`。
- 停用门店员工账号：`store_manager` / `store_clerk` / `cashier`。
- 查看所有已录入门店或 `managed_store_codes` 范围内门店数据。

## 5. area_supervisor 禁止动作

`area_supervisor` 禁止：

- 删除门店。
- 删除用户。
- 创建 `admin` / `warehouse_supervisor` / `warehouse_manager` / `warehouse_clerk` / `area_supervisor` / `external_auditor`。
- 重置 `admin` / warehouse roles / `area_supervisor` / `external_auditor` 密码。
- 停用 `admin` / warehouse roles / `area_supervisor` / `external_auditor`。
- POS sale。
- POS shift open / close。
- STORE_ITEM generation。
- STORE_ITEM stock-in confirmation。
- SDP assignment 实操。
- 仓库入库、分拣、出库执行。
- 修改成本。
- 修改 barcode 规则。
- 清空库存。
- 物理删除任何业务记录。

## 6. 门店创建、编辑、关闭规则

- 门店创建者可以是 `admin` 或 `area_supervisor`。
- `area_supervisor` 创建的新门店必须自动加入自己的 `managed_store_codes`。
- 门店基础资料仅允许编辑名称、地址、电话、Google Maps 链接、备注、营业状态。
- 门店关闭不是删除，只能通过 `status` 调整为 `paused` 或 `closed`。
- 上线阶段不允许 physical delete store。
- 当前不新增 DELETE store endpoint；如果后续发现已有删除入口，应限制为 `admin` only，或直接返回 403 / 405。

## 7. 用户创建、停用、密码重置规则

`area_supervisor` 只能管理门店级员工：

- `store_manager`
- `store_clerk`
- `cashier`

允许动作：

- 创建上述角色。
- 重置上述角色密码。
- 停用上述角色账号。

禁止动作：

- 创建、重置或停用 `admin`。
- 创建、重置或停用任何 warehouse role。
- 创建、重置或停用 `area_supervisor`。
- 创建、重置或停用 `external_auditor`。

权限不足时，后端返回 403，并优先使用简单中文：

- `你没有权限`
- `你不能创建这个角色`
- `你不能重置这个账号的密码`
- `该门店不属于你`
- `请联系主管处理`

## 8. 门店不能物理删除

上线阶段门店不能物理删除。

门店停止营业必须通过 `status` 表达：

- `paused`：暂停营业。
- `closed`：关闭门店。

历史销售、库存、收货、调拨、打印、入库记录必须保留。

## 9. 用户不能物理删除

上线阶段用户不能物理删除。

用户离职或暂停使用账号，只能软停用：

- `status = inactive`
- `is_active = false`

历史操作记录、销售记录、收货记录、打印记录、入库确认记录必须保留。

## 10. 后续 PR 计划

PR 2：核心业务动作 RBAC guard。

覆盖：

- SDO receiving。
- SDP receive。
- SDP assignment。
- STORE_ITEM generation。
- STORE_ITEM print job create / mark success / mark failed。
- STORE_ITEM stock-in confirmation。
- Store inventory overview。
- Store item trace。
- POS sale。
- POS shift open / close。
- POS reports / shift reports。

PR 3：前端入口隐藏 + RBAC 回归测试。

覆盖：

- 按角色隐藏无权限入口和按钮。
- 简单中文无权限提示。
- `backend/tests/test_rbac_launch_regression.py` 汇总 PR1 / PR2 核心边界。

前端隐藏只是体验优化，真实权限以后端 guard 为准。

## 11. 不改变的业务边界

本 RBAC 上线计划不改变：

- POS barcode 类型。
- STORE_ITEM EAN-13 格式。
- STORE_ITEM backend allocator。
- STORE_ITEM generation 幂等逻辑。
- POS sale 幂等逻辑。
- sold lock。
- manual unbarcoded sale 行为。
- print core。
- K300 / Bluetooth。
- Android native。
- refund / void。
- offline sale redesign。
- 百货 SKU 系统。
- 仓库 SDO / SDB / LPK 生成逻辑。
- 库存统计口径。
