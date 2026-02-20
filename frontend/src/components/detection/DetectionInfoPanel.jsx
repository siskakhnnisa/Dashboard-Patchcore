import React, { useState, useEffect } from 'react'
import { User, AlertTriangle, Box, Layers, Activity } from 'lucide-react'
import '../../styles/DetectionInfoPanels.css'

const STATUS_VARIANTS = {
  'NORMAL/FOD': { cls: 'status-red', dot: '#ef4444' },
  'NORMAL': { cls: 'status-green', dot: '#22c55e' },
  'CLEAR': { cls: 'status-green', dot: '#22c55e' },
  'ALERT': { cls: 'status-red', dot: '#ef4444' },
}

export default function DetectionInfoPanel({ detections = [] }) {
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [anomalyScore, setAnomalyScore] = useState(0.74)
  const [area, setArea] = useState(2340)
  const [persistence, setPersistence] = useState(12)

  const hasDetections = detections.length > 0
  const status = hasDetections ? 'NORMAL/FOD' : 'NORMAL'
  const statusInfo = STATUS_VARIANTS[status] || STATUS_VARIANTS['NORMAL']

  useEffect(() => {
    if (!hasDetections) return
    const t = setInterval(() => {
      setLastUpdate(new Date())
      setAnomalyScore(prev => Math.min(1, Math.max(0, prev + (Math.random() - 0.48) * 0.03)))
      setArea(prev => Math.round(Math.max(800, Math.min(5000, prev + (Math.random() - 0.5) * 150))))
      setPersistence(prev => Math.max(0, prev + 1))
    }, 3000)
    return () => clearInterval(t)
  }, [hasDetections])

  const timeAgo = () => {
    const diff = Math.round((new Date() - lastUpdate) / 1000)
    if (diff < 60) return `${diff} seconds ago`
    return `${Math.round(diff / 60)} minutes ago`
  }

  return (
    <div className="det-info-panel card">
      <div className="det-info-header">
        <span className="section-title" style={{ margin: 0 }}>Detection Info Panel</span>
        <Activity size={13} className="det-info-icon" />
      </div>

      <div className="det-info-list">
        {/* Status */}
        <div className="det-info-row">
          <div className="det-info-row-icon">
            <User size={13} />
          </div>
          <div className="det-info-row-content">
            <div className="det-info-row-label">
              Status:{' '}
              <span className={`det-status-badge ${statusInfo.cls}`}>
                <span className="det-status-dot" style={{ background: statusInfo.dot }} />
                {status}
              </span>
            </div>
            <div className="det-info-row-time">{timeAgo()}</div>
          </div>
        </div>

        {/* Anomaly Score */}
        <div className="det-info-row">
          <div className="det-info-row-icon">
            <AlertTriangle size={13} />
          </div>
          <div className="det-info-row-content">
            <div className="det-info-row-label">
              Anomaly Score
              <span className="det-info-value">{anomalyScore.toFixed(2)}</span>
            </div>
            <div className="det-anomaly-bar-wrap">
              <div
                className="det-anomaly-bar"
                style={{ width: `${anomalyScore * 100}%` }}
              />
            </div>
            <div className="det-info-row-time">{timeAgo()}</div>
          </div>
        </div>

        {/* Area */}
        <div className="det-info-row">
          <div className="det-info-row-icon">
            <Box size={13} />
          </div>
          <div className="det-info-row-content">
            <div className="det-info-row-label">
              Area (px)
              <span className="det-info-value">{area.toLocaleString()}</span>
            </div>
            <div className="det-info-row-time">{timeAgo()}</div>
          </div>
        </div>

        {/* Persistence */}
        <div className="det-info-row">
          <div className="det-info-row-icon">
            <Layers size={13} />
          </div>
          <div className="det-info-row-content">
            <div className="det-info-row-label">
              Persistence (frames)
              <span className="det-info-value">{persistence}</span>
            </div>
            <div className="det-info-row-time">{timeAgo()}</div>
          </div>
        </div>
      </div>

      {/* Detection count summary */}
      {hasDetections && (
        <div className="det-info-footer">
          <span>{detections.length} object{detections.length !== 1 ? 's' : ''} detected</span>
          <span className="det-info-footer-severity">
            {detections.filter(d => d.severity === 'high').length} high severity
          </span>
        </div>
      )}
    </div>
  )
}