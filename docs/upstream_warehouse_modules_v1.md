# 上游仓库模块整合说明 v1

这份说明用于把 `/Users/ericye/Desktop/warehouse_system_spec.docx` 里的“包裹入仓 / 分拣任务 / 库位库存”需求，整合进当前零售系统。

## 为什么要单独加这层

你当前系统已经覆盖的是：

- 商品建档
- barcode 绑定
- 仓库收货
- 调拨到门店
- 门店分批收货
- POS 销售

但 `warehouse_system_spec.docx` 写的是更上游的一层：

- 原始包裹入仓
- 分拣任务
- 分拣确认入库
- 按库位形成分类库存

所以这不是替代当前系统，而是把当前系统向前补一层。

## 合并后的完整链路

完整业务链应变成：

1. 包裹入仓
2. 创建分拣任务
3. 记录分拣结果
4. 分拣确认入库
5. 形成仓库分类库存
6. 后续再转成成品库存 / 门店调拨 / POS 销售

## 第一版落地范围

这次先落这 3 个模块：

### 1. 包裹入仓

目标：

- 记录原始包裹批次
- 不直接增加当前成品库存

当前字段：

- `batch_no`
- `barcode`
- `supplier_name`
- `cargo_type`
- `received_by`
- `package_count`
- `total_weight`
- `note`
- `status`
- `received_at`

当前状态流：

- `pending_sorting`
- `sorting_in_progress`
- `sorted`

### 2. 分拣任务

目标：

- 把一批或多批包裹组织成可执行的分拣单

当前字段：

- `task_no`
- `parcel_batch_nos`
- `handler_names`
- `started_at`
- `expected_completed_at`
- `note`
- `status`
- `result_items`

当前状态流：

- `open`
- `confirmed`

### 3. 分拣确认入库

目标：

- 记录分类维度的分拣结果
- 只有勾选确认入库，才增加“分拣库存”

当前字段：

- `category_name`
- `grade`
- `sku_code`
- `qty`
- `rack_code`
- `confirm_to_inventory`

## 当前库存口径

为了不破坏现在已经跑通的“成品 barcode 库存 -> 门店库存 -> 销售”链路，这次先新增一套独立库存：

- `sorting_stock`

它表示：

- 按 `商品类别 + 等级 + 库位` 形成的仓库分类库存

它暂时不直接替代当前：

- `warehouse_stock`
- `store_stock`

## 当前规则

1. 包裹入仓只建批次，不增加成品库存
2. 分拣任务可关联多个包裹
3. 分拣结果确认后，才进入 `sorting_stock`
4. 一个库位只允许一种 `category + grade`
5. 如果库位已被别的 `sku_code` 占用，系统会拒绝混放

## 当前 API

- `POST /api/v1/warehouse/parcel-batches`
- `GET /api/v1/warehouse/parcel-batches`
- `POST /api/v1/warehouse/sorting-tasks`
- `GET /api/v1/warehouse/sorting-tasks`
- `POST /api/v1/warehouse/sorting-tasks/{task_no}/results`
- `GET /api/v1/warehouse/sorting-stock`

## 下一步

后续建议按这个顺序继续：

1. 给前端加“包裹入仓 / 分拣任务”页面
2. 给分拣结果页加勾选确认入库
3. 再决定“分类库存如何转成成品库存”
4. 最后再把这一层跟门店调拨逻辑真正打通
