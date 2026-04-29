(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.StoreExecutionFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeRoleCode(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeFlowType(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getStoreRoleLanding(roleCode, hasStoreCode = true) {
    if (!hasStoreCode) {
      return null;
    }
    const normalizedRole = normalizeRoleCode(roleCode);
    const managerRoles = new Set(["store_manager", "manager", "store_supervisor", "shop_manager"]);
    const clerkRoles = new Set(["store_clerk", "clerk", "store_staff", "sales_clerk"]);
    const cashierRoles = new Set(["cashier", "store_cashier"]);
    if (managerRoles.has(normalizedRole)) {
      return {
        workspace: "store",
        panelTitle: "5. 门店到货工作台 / Store Receiving Dashboard",
        label: "店长端 / 门店到货工作台",
      };
    }
    if (clerkRoles.has(normalizedRole)) {
      return {
        workspace: "store",
        panelTitle: "6.2 我的当前 bale",
        label: "店员端 / 我的当前 bale",
      };
    }
    if (cashierRoles.has(normalizedRole)) {
      return {
        workspace: "store",
        panelTitle: "9. 收银销售",
        label: "收银功能区 / 收银销售",
      };
    }
    return null;
  }

  function getStoreWorkerDefault(roleCode, username) {
    const normalizedRole = normalizeRoleCode(roleCode);
    const normalizedUsername = String(username || "").trim();
    const clerkRoles = new Set(["store_clerk", "clerk", "store_staff", "sales_clerk"]);
    if (!normalizedUsername) {
      return "";
    }
    return clerkRoles.has(normalizedRole) ? normalizedUsername : "";
  }

  function buildClerkAssignment(options) {
    return {
      entityType: "clerk_assignment",
      baleNo: String(options && options.baleNo || "").trim().toUpperCase(),
      storeCode: String(options && options.storeCode || "").trim().toUpperCase(),
      assignedEmployee: String(options && options.assignedEmployee || "").trim(),
      flowType: normalizeFlowType(options && options.flowType) || "sorting",
      itemCount: Number(options && options.itemCount || 0),
      assignedAt: String(options && options.assignedAt || "").trim(),
      note: String(options && options.note || "").trim(),
      status: String(options && options.status || "").trim(),
    };
  }

  function buildClerkShelvingTask(options) {
    return {
      entityType: "clerk_shelving_task",
      sessionNo: String(options && options.sessionNo || "").trim().toUpperCase(),
      baleNo: String(options && options.baleNo || "").trim().toUpperCase(),
      storeCode: String(options && options.storeCode || "").trim().toUpperCase(),
      assignedEmployee: String(options && options.assignedEmployee || "").trim(),
      status: String(options && options.status || "").trim(),
      tokenCount: Number(options && options.tokenCount || 0),
      placedCount: Number(options && options.placedCount || 0),
      pendingCount: Number(options && options.pendingCount || 0),
    };
  }

  function bucketStoreManagerDispatchBales(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const arrivalStatuses = new Set(["created", "packed", "labelled", "in_transit", "ready_dispatch", "pending_acceptance"]);
    const assignmentStatuses = new Set(["received", "accepted", "partially_received"]);
    const activeStatuses = new Set(["assigned", "processing", "printing_in_progress"]);
    const completedStatuses = new Set(["completed"]);

    const buckets = {
      arrivalQueue: [],
      assignmentQueue: [],
      activeQueue: [],
      completedQueue: [],
    };

    list.forEach((row) => {
      const status = String(row && row.status || "").trim().toLowerCase();
      if (completedStatuses.has(status)) {
        buckets.completedQueue.push(row);
        return;
      }
      if (activeStatuses.has(status)) {
        buckets.activeQueue.push(row);
        return;
      }
      if (assignmentStatuses.has(status)) {
        buckets.assignmentQueue.push(row);
        return;
      }
      if (arrivalStatuses.has(status)) {
        buckets.arrivalQueue.push(row);
        return;
      }
      if (String(row && row.assigned_employee || "").trim()) {
        buckets.activeQueue.push(row);
        return;
      }
      buckets.arrivalQueue.push(row);
    });

    return buckets;
  }

  function getStoreAssignmentNavigation(options) {
    const flowType = normalizeFlowType(options && options.flowType);
    const assignedEmployee = String(options && options.assignedEmployee || "").trim();
    const workbenchTitle = flowType === "direct_hang"
      ? "7.2 直挂店员工作台"
      : "7. 店员 PDA 上架工作台";

    return {
      managerPanelTitle: "6.1 门店分配店员",
      clerkHomePanelTitle: "6.2 我的当前 bale",
      workbenchTitle,
      shouldAutoOpenWorkbench: false,
      assignmentMessage: assignedEmployee
        ? `门店配货 bale 已绑定给 ${assignedEmployee}。店员下一步从“6.2 我的当前 bale”进入，再进入“${workbenchTitle}”。`
        : `门店配货 bale 已完成分配。店员下一步从“6.2 我的当前 bale”进入，再进入“${workbenchTitle}”。`,
    };
  }

  function getStoreManagerProgressNavigation() {
    return {
      panelTitle: "6.1 门店分配店员",
      actionLabel: "查看处理进度",
      note: "店长只看分配、进度和异常，不直接进入店员主工作台。",
    };
  }

  function getStoreClerkCompletionNavigation(options) {
    const baleNo = String(options && options.baleNo || "").trim().toUpperCase();
    const prefix = baleNo ? `当前 bale ${baleNo}` : "当前 bale";
    return {
      panelTitle: "6.2 我的当前 bale",
      completionMessage: `${prefix} 已完成，返回“6.2 我的当前 bale”接下一包。`,
    };
  }

  return {
    getStoreRoleLanding,
    getStoreWorkerDefault,
    buildClerkAssignment,
    buildClerkShelvingTask,
    bucketStoreManagerDispatchBales,
    getStoreAssignmentNavigation,
    getStoreManagerProgressNavigation,
    getStoreClerkCompletionNavigation,
  };
});
