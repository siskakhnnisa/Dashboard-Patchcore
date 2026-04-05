import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";

const DashboardPage       = lazy(() => import("./pages/DashboardPage"));
const LiveMonitorPage     = lazy(() => import("./pages/LiveMonitorPage"));
const StreamPage          = lazy(() => import("./pages/StreamPage"));
const FodSnapshotsPage    = lazy(() => import("./pages/FodSnapshotsPage"));
const FodMappingPage      = lazy(() => import("./pages/FodMappingPage"));
const ActivityHistoryPage = lazy(() => import("./pages/ActivityHistoryPage"));
const DetectionStatsPage  = lazy(() => import("./pages/DetectionStatsPage"));
const AnomalyTrendsPage   = lazy(() => import("./pages/AnomalyTrendsPage"));
const InspectionLogPage   = lazy(() => import("./pages/InspectionLogPage"));
const PipelineLogPage     = lazy(() => import("./pages/PipelineLogPage"));
const SettingsPage        = lazy(() => import("./pages/SettingsPage"));
const ReportsPage         = lazy(() => import("./pages/ReportsPage"));

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/"                   element={<DashboardPage />} />
          <Route path="/live-monitor"       element={<LiveMonitorPage />} />
          <Route path="/stream"             element={<StreamPage />} />
          <Route path="/fod-snapshots"      element={<FodSnapshotsPage />} />
          <Route path="/fod-mapping"        element={<FodMappingPage />} />
          <Route path="/activity-history"   element={<ActivityHistoryPage />} />
          <Route path="/detection-stats"    element={<DetectionStatsPage />} />
          <Route path="/anomaly-trends"     element={<AnomalyTrendsPage />} />
          <Route path="/inspection-log"     element={<InspectionLogPage />} />
          <Route path="/pipeline/log"        element={<PipelineLogPage />} />
          <Route path="/settings"           element={<SettingsPage />} />
          <Route path="/reports"            element={<ReportsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
