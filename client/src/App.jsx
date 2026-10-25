import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Landing from "./pages/Landing";
import DeliveryConsole from "./pages/DeliveryConsole";
import ChaosLab from "./pages/ChaosLab";
import SelfHealingPortal from "./pages/SelfHealingPortal";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/console" element={<DeliveryConsole />} />
        <Route path="/chaos" element={<ChaosLab />} />
        <Route path="/healing" element={<SelfHealingPortal />} />
        {/* Older links to the reliability console / dashboard open the portal. */}
        <Route path="/reliability" element={<Navigate to="/healing" replace />} />
        <Route path="/dashboard" element={<Navigate to="/healing" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
