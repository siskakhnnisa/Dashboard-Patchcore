import React, { useState, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import StatsRow from '../components/dashboard/StatsRow'
import TrafficByWebsite from '../components/dashboard/TrafficByWebsite'
import DetectionInfoPanel from '../components/detection/DetectionInfoPanel'
import PipelineControlPanel from '../components/detection/PipelineControlPanel'
import FODeventsTimeline from '../components/detection/FODeventsTimeline'
import '../pages/DashboardPage.css'

export default function DashboardPage() {
  const [liveDetections, setLiveDetections] = useState([])

  const handleDetectionUpdate = useCallback((detections) => {
    setLiveDetections(detections)
  }, [])

  return (
    <div className="dashboard">
      {/* Overview section header */}
      <div className="dashboard-section-header">
        <h2 className="dashboard-section-title">Overview</h2>
        <button className="btn btn-ghost dashboard-date-btn">
          <span>Today</span>
          <ChevronDown size={13} />
        </button>
      </div>

      {/* Stats Row */}
      <StatsRow />

      {/* Main Middle Row: Live Monitor + Traffic */}
      <div className="dashboard-middle">
        <div className="dashboard-monitor-col">
          <LiveMonitorPanel onDetectionUpdate={handleDetectionUpdate} />
        </div>
        <div className="dashboard-traffic-col">
          <TrafficByWebsite />
        </div>
      </div>

      {/* Detection Panels Row */}
      <div className="dashboard-detection-row">
        <div className="dashboard-det-info">
          <DetectionInfoPanel detections={liveDetections} />
        </div>
        <div className="dashboard-pipeline">
          <PipelineControlPanel />
        </div>
      </div>

      {/* FOD Events Timeline */}
      <FODeventsTimeline liveDetections={liveDetections} />
    </div>
  )
}