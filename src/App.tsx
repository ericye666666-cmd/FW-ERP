import { Navigate, Route, Routes } from "react-router-dom";

import { AdminLayout } from "./layout/admin-layout";
import { AuditRiskDepartmentPage } from "./pages/audit-risk-department";
import { ChinaProcurementContainerIntakePage } from "./pages/china-procurement-container-intake";
import { ChinaProcurementPage } from "./pages/china-procurement";
import { ChinaProcurementShippingCostPage } from "./pages/china-procurement-shipping-cost";
import { ContentCenterPage } from "./pages/content-center";
import { FinanceDepartmentPage } from "./pages/finance-department";
import { AiCommandCenterPage } from "./pages/ai-command-center";
import { BaleInboundPage } from "./pages/bale-inbound";
import { BrandOperationsCenterPage } from "./pages/brand-operations-center";
import { BaleSalesOutboundPage } from "./pages/bale-sales-outbound";
import { BaleSalesPricingPage } from "./pages/bale-sales-pricing";
import { LocationInventoryPage } from "./pages/location-inventory";
import { SortingStationPreviewPage } from "./pages/sorting-station-preview";
import { SortingTasksPage } from "./pages/sorting-tasks";

function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route path="/" element={<AiCommandCenterPage />} />
        <Route path="/bale-inbound" element={<BaleInboundPage />} />
        <Route path="/bale-sales/pricing" element={<BaleSalesPricingPage />} />
        <Route path="/bale-sales/outbound" element={<BaleSalesOutboundPage />} />
        <Route path="/sorting-tasks" element={<SortingTasksPage />} />
        <Route path="/sorting-station-preview" element={<SortingStationPreviewPage />} />
        <Route path="/location-inventory" element={<LocationInventoryPage />} />
        <Route path="/china-procurement" element={<ChinaProcurementPage />} />
        <Route path="/brand-operations-center" element={<BrandOperationsCenterPage />} />
        <Route path="/china-procurement/container-intake" element={<ChinaProcurementContainerIntakePage />} />
        <Route path="/china-procurement/shipping-cost" element={<ChinaProcurementShippingCostPage />} />
        <Route path="/content-center" element={<ContentCenterPage />} />
        <Route path="/finance-department" element={<FinanceDepartmentPage />} />
        <Route path="/audit-risk-department" element={<AuditRiskDepartmentPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
