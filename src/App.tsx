import { Navigate, Route, Routes } from "react-router-dom";

import { AdminLayout } from "./layout/admin-layout";
import { AiCommandCenterPage } from "./pages/ai-command-center";
import { BaleInboundPage } from "./pages/bale-inbound";
import { BaleSalesOutboundPage } from "./pages/bale-sales-outbound";
import { BaleSalesPricingPage } from "./pages/bale-sales-pricing";
import { LocationInventoryPage } from "./pages/location-inventory";
import { SortingStationPreviewPage } from "./pages/sorting-station-preview";
import { SortingTasksPage } from "./pages/sorting-tasks";
import { StoreReceivingPage } from "./pages/store-receiving";

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
        <Route path="/store-receiving" element={<StoreReceivingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
