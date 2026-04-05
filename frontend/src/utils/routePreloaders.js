const ROUTE_PRELOADERS = {
  home: () => import("../pages/DashboardPage"),
  "/": () => import("../pages/DashboardPage"),
  "live-monitor": () => import("../pages/LiveMonitorPage"),
  "/live-monitor": () => import("../pages/LiveMonitorPage"),
  stream: () => import("../pages/StreamPage"),
  "/stream": () => import("../pages/StreamPage"),
  "fod-snapshots": () => import("../pages/FodSnapshotsPage"),
  "/fod-snapshots": () => import("../pages/FodSnapshotsPage"),
  "fod-mapping": () => import("../pages/FodMappingPage"),
  "/fod-mapping": () => import("../pages/FodMappingPage"),
  "activity-history": () => import("../pages/ActivityHistoryPage"),
  "/activity-history": () => import("../pages/ActivityHistoryPage"),
  "detection-stats": () => import("../pages/DetectionStatsPage"),
  "/detection-stats": () => import("../pages/DetectionStatsPage"),
  "anomaly-trends": () => import("../pages/AnomalyTrendsPage"),
  "/anomaly-trends": () => import("../pages/AnomalyTrendsPage"),
  "inspection-log": () => import("../pages/InspectionLogPage"),
  "/inspection-log": () => import("../pages/InspectionLogPage"),
  "pipeline-log": () => import("../pages/PipelineLogPage"),
  "/pipeline/log": () => import("../pages/PipelineLogPage"),
  reports: () => import("../pages/ReportsPage"),
  "/reports": () => import("../pages/ReportsPage"),
  settings: () => import("../pages/SettingsPage"),
  "/settings": () => import("../pages/SettingsPage"),
};

export function preloadRoute(target) {
  const loader = ROUTE_PRELOADERS[target];
  if (loader) {
    void loader();
  }
}