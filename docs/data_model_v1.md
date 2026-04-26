# 数据模型 v1

## 核心实体

### 1. products

商品主数据。

字段建议：

- `id`
- `barcode`
- `sku_code`
- `product_name`
- `category_main`
- `category_sub`
- `supplier_name`
- `cost_price`
- `launch_price`
- `rack_code`
- `label_template_code`
- `status`
- `created_at`
- `updated_at`

### 2. warehouses

- `id`
- `warehouse_code`
- `warehouse_name`
- `status`

### 3. stores

- `id`
- `store_code`
- `store_name`
- `manager_name`
- `status`

### 4. warehouse_stock

记录仓库库存。

- `id`
- `warehouse_id`
- `product_id`
- `qty_on_hand`
- `rack_code`
- `updated_at`

### 5. goods_receipts

记录仓库收货单。

- `id`
- `receipt_no`
- `warehouse_id`
- `supplier_name`
- `receipt_date`
- `status`
- `created_by`

### 6. goods_receipt_items

- `id`
- `goods_receipt_id`
- `product_id`
- `received_qty`
- `cost_price`

### 7. print_jobs

标签或单据打印任务。

- `id`
- `job_type`
- `document_no`
- `product_id`
- `label_size`
- `copies`
- `printer_name`
- `status`
- `printed_by`
- `printed_at`

### 8. transfer_orders

调拨单头。

- `id`
- `transfer_no`
- `from_warehouse_id`
- `to_store_id`
- `status`
- `approval_status`
- `approved_by`
- `approved_at`
- `requested_at`
- `requested_by`
- `dispatched_at`
- `received_at`

### 9. transfer_order_items

- `id`
- `transfer_order_id`
- `product_id`
- `requested_qty`
- `picked_qty`
- `received_qty`
- `discrepancy_qty`

### 10. store_stock

记录门店库存。

- `id`
- `store_id`
- `product_id`
- `qty_on_hand`
- `store_rack_code`
- `updated_at`

### 11. receipt_discrepancies

门店签收差异。

- `id`
- `transfer_order_id`
- `product_id`
- `issue_type`
- `expected_qty`
- `actual_qty`
- `note`
- `confirmed_by`
- `confirmed_at`
- `approval_status`
- `approved_by`
- `approved_at`

### 12. sales_transactions

POS 销售单头。

- `id`
- `order_no`
- `store_id`
- `cashier_name`
- `sold_at`
- `total_amount`

### 13. sales_transaction_items

- `id`
- `sales_transaction_id`
- `product_id`
- `qty`
- `selling_price`
- `line_total`

### 14. store_rack_locations

门店货架位模板与维护。

- `id`
- `store_id`
- `rack_code`
- `category_hint`
- `status`
- `created_at`
- `updated_at`

### 15. roles

- `id`
- `role_code`
- `role_name`
- `description`

### 16. users

- `id`
- `username`
- `display_name`
- `role_id`
- `store_id`
- `status`

### 17. warehouse_zones

仓库区域字典。

- `id`
- `zone_code`
- `zone_name`
- `description`

### 18. audit_events

关键操作留痕。

- `id`
- `event_type`
- `entity_type`
- `entity_id`
- `actor`
- `summary`
- `details`
- `created_at`

### 19. inventory_movements

库存流水台账。

- `id`
- `movement_type`
- `barcode`
- `product_name`
- `quantity_delta`
- `location_type`
- `location_code`
- `reference_type`
- `reference_no`
- `actor`
- `note`
- `details`
- `created_at`

## 第一版关键规则

- 一个 `barcode` 只能对应一个商品
- 调拨单未签收前，不增加门店库存
- POS 销售不能直接卖负库存
- 打印标签和打印调拨单都必须保留日志
- 门店签收差异必须留痕，不能直接覆盖
- 调拨单必须审核后才能拣货和发货
- 差异由店长确认，但库存修正必须由区域主管审批
- 仓库货架位和门店货架位分开管理
- 门店主数据必须支持新增，不能写死在代码里
- 关键动作必须进入审计日志，至少包括建档、收货、打印、调拨、签收、差异审批、销售、架位调整、账号创建
- 所有库存增减都应该进入 `inventory_movements`，至少包括收货入库、调拨出库、门店签收入库、销售减库存、差异调整
