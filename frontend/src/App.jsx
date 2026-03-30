import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";
import DashboardPage from "./pages/DashboardPage";
import LiveMonitorPage from "./pages/LiveMonitorPage";
import StreamPage from "./pages/StreamPage";
import EventTimelinePage from "./pages/EventTimelinePage";
import FodSnapshotsPage from "./pages/FodSnapshotsPage";
import DetectionStatsPage from "./pages/DetectionStatsPage";
import AnomalyTrendsPage from "./pages/AnomalyTrendsPage";
import InspectionLogPage from "./pages/InspectionLogPage";
import PipelineControlPage from "./pages/PipelineControlPage";
import PipelineConfigPage from "./pages/PipelineConfigPage";
import PipelineLogPage from "./pages/PipelineLogPage";
import SettingsPage from "./pages/SettingsPage";
import ReportsPage from "./pages/ReportsPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/"                   element={<DashboardPage />} />
          <Route path="/live-monitor"       element={<LiveMonitorPage />} />
          <Route path="/stream"             element={<StreamPage />} />
          <Route path="/event-timeline"     element={<EventTimelinePage />} />
          <Route path="/fod-snapshots"      element={<FodSnapshotsPage />} />
          <Route path="/detection-stats"    element={<DetectionStatsPage />} />
          <Route path="/anomaly-trends"     element={<AnomalyTrendsPage />} />
          <Route path="/inspection-log"     element={<InspectionLogPage />} />
          <Route path="/pipeline/control"   element={<PipelineControlPage />} />
          <Route path="/pipeline/config"    element={<PipelineConfigPage />} />
          <Route path="/pipeline/log"       element={<PipelineLogPage />} />
          <Route path="/settings"           element={<SettingsPage />} />
          <Route path="/reports"            element={<ReportsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
