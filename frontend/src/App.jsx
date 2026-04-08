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

function PageSkeleton() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "60vh",
      color: "#9CA3AF",
      fontSize: 14,
      gap: 10,
    }}>
      <div style={{
        width: 18,
        height: 18,
        border: "2px solid #E5E7EB",
        borderTopColor: "#6B7280",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      Memuat halaman...
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/"                   element={<Suspense fallback={<PageSkeleton />}><DashboardPage /></Suspense>} />
          <Route path="/live-monitor"       element={<Suspense fallback={<PageSkeleton />}><LiveMonitorPage /></Suspense>} />
          <Route path="/stream"             element={<Suspense fallback={<PageSkeleton />}><StreamPage /></Suspense>} />
          <Route path="/fod-snapshots"      element={<Suspense fallback={<PageSkeleton />}><FodSnapshotsPage /></Suspense>} />
          <Route path="/fod-mapping"        element={<Suspense fallback={<PageSkeleton />}><FodMappingPage /></Suspense>} />
          <Route path="/activity-history"   element={<Suspense fallback={<PageSkeleton />}><ActivityHistoryPage /></Suspense>} />
          <Route path="/detection-stats"    element={<Suspense fallback={<PageSkeleton />}><DetectionStatsPage /></Suspense>} />
          <Route path="/anomaly-trends"     element={<Suspense fallback={<PageSkeleton />}><AnomalyTrendsPage /></Suspense>} />
          <Route path="/inspection-log"     element={<Suspense fallback={<PageSkeleton />}><InspectionLogPage /></Suspense>} />
          <Route path="/pipeline/log"       element={<Suspense fallback={<PageSkeleton />}><PipelineLogPage /></Suspense>} />
          <Route path="/settings"           element={<Suspense fallback={<PageSkeleton />}><SettingsPage /></Suspense>} />
          <Route path="/reports"            element={<Suspense fallback={<PageSkeleton />}><ReportsPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
