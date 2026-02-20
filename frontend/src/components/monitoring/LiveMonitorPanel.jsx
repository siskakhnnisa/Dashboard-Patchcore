import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Video,
  VideoOff,
  Brain,
  Square,
  Circle,
  AlertTriangle,
  Maximize2,
  Settings2,
  RotateCcw,
  Crosshair
} from 'lucide-react'
import '../../styles/LiveMonitorPanel.css'

// ─── Simulated detection boxes ────────────────────────────────────────────────
function useSimulatedDetections(isInferenceOn, fps) {
  const [detections, setDetections] = useState([])
  const frameRef = useRef(0)

  useEffect(() => {
    if (!isInferenceOn) {
      setDetections([])
      return
    }

    const interval = setInterval(() => {
      frameRef.current++
      // Slowly animate bounding boxes to simulate real detections
      setDetections(prev => {
        const base = [
          {
            id: 1,
            label: 'FOD',
            confidence: 0.94,
            x: 22 + Math.sin(frameRef.current * 0.02) * 2,
            y: 38 + Math.cos(frameRef.current * 0.015) * 1.5,
            w: 8,
            h: 5,
            severity: 'high',
          },
          {
            id: 2,
            label: 'FOD',
            confidence: 0.81,
            x: 55 + Math.sin(frameRef.current * 0.03 + 1) * 1,
            y: 52 + Math.cos(frameRef.current * 0.02 + 1) * 1,
            w: 6,
            h: 4,
            severity: 'medium',
          },
          {
            id: 3,
            label: 'Debris',
            confidence: 0.73,
            x: 70 + Math.sin(frameRef.current * 0.025 + 2) * 1.5,
            y: 28 + Math.cos(frameRef.current * 0.018 + 2) * 1,
            w: 5,
            h: 3.5,
            severity: 'low',
          },
        ]
        return base
      })
    }, 1000 / fps)

    return () => clearInterval(interval)
  }, [isInferenceOn, fps])

  return detections
}

// ─── Runway Grid Overlay ──────────────────────────────────────────────────────
function RunwayGrid() {
  return (
    <svg className="monitor-runway-grid" viewBox="0 0 100 100" preserveAspectRatio="none">
      {/* Perspective runway lines */}
      <line x1="50" y1="0" x2="10" y2="100" stroke="rgba(255,255,255,0.08)" strokeWidth="0.3" />
      <line x1="50" y1="0" x2="90" y2="100" stroke="rgba(255,255,255,0.08)" strokeWidth="0.3" />
      <line x1="50" y1="0" x2="30" y2="100" stroke="rgba(255,255,255,0.05)" strokeWidth="0.2" />
      <line x1="50" y1="0" x2="70" y2="100" stroke="rgba(255,255,255,0.05)" strokeWidth="0.2" />
      {/* Horizontal distance markers */}
      {[20, 40, 60, 80].map(y => (
        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="0.2" />
      ))}
    </svg>
  )
}

// ─── Bounding Box ─────────────────────────────────────────────────────────────
function DetectionBox({ det }) {
  const colorMap = {
    high: '#ef4444',
    medium: '#f97316',
    low: '#eab308',
  }
  const color = colorMap[det.severity]

  return (
    <div
      className="det-box"
      style={{
        left: `${det.x}%`,
        top: `${det.y}%`,
        width: `${det.w}%`,
        height: `${det.h}%`,
        borderColor: color,
      }}
    >
      {/* Corner accents */}
      <span className="det-corner tl" style={{ borderColor: color }} />
      <span className="det-corner tr" style={{ borderColor: color }} />
      <span className="det-corner bl" style={{ borderColor: color }} />
      <span className="det-corner br" style={{ borderColor: color }} />

      {/* Label */}
      <div className="det-label" style={{ background: color }}>
        <span>{det.label}</span>
        <span className="det-confidence">{(det.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  )
}

// ─── Scanline effect ──────────────────────────────────────────────────────────
function Scanline({ active }) {
  if (!active) return null
  return <div className="monitor-scanline" />
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LiveMonitorPanel({ onDetectionUpdate }) {
  const [inferenceOn, setInferenceOn] = useState(true)
  const [cameraSource] = useState('RTSP-01')
  const [fps] = useState(34)
  const [fpsDisplay, setFpsDisplay] = useState(34)
  const [frameCount, setFrameCount] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [showCrosshair, setShowCrosshair] = useState(false)

  const detections = useSimulatedDetections(inferenceOn, fps)

  // Simulate FPS fluctuation
  useEffect(() => {
    const t = setInterval(() => {
      setFpsDisplay(Math.round(fps + (Math.random() - 0.5) * 4))
      setFrameCount(c => c + fps)
    }, 1000)
    return () => clearInterval(t)
  }, [fps])

  // Bubble detections up
  useEffect(() => {
    if (onDetectionUpdate) onDetectionUpdate(detections)
  }, [detections, onDetectionUpdate])

  const highSeverity = detections.filter(d => d.severity === 'high').length
  const hasAlert = highSeverity > 0 && inferenceOn

  return (
    <div className={`live-monitor card ${hasAlert ? 'alert-state' : ''}`}>
      {/* Header */}
      <div className="monitor-header">
        <div className="monitor-header-left">
          <div className={`monitor-live-dot ${inferenceOn ? 'live' : ''}`} />
          <span className="monitor-title">Live Monitoring</span>
          <div className="monitor-meta">
            Camera Source: [{cameraSource}]
          </div>
          <div className="monitor-meta monitor-meta-sep">|</div>
          <div className="monitor-meta">
            Inference: [{inferenceOn ? 'ON' : 'OFF'}]
          </div>
          <div className="monitor-meta">
            FPS: {fpsDisplay}
          </div>
        </div>
        <div className="monitor-header-right">
          {hasAlert && (
            <div className="monitor-alert-badge">
              <AlertTriangle size={11} />
              <span>FOD DETECTED</span>
            </div>
          )}
          <button
            className={`btn btn-ghost monitor-ctrl-btn ${inferenceOn ? 'inference-on' : ''}`}
            onClick={() => setInferenceOn(v => !v)}
            title={inferenceOn ? 'Disable Inference' : 'Enable Inference'}
          >
            <Brain size={13} />
            <span>{inferenceOn ? 'Inference ON' : 'Inference OFF'}</span>
          </button>
          <button
            className={`btn btn-ghost monitor-ctrl-btn ${isRecording ? 'recording' : ''}`}
            onClick={() => setIsRecording(v => !v)}
            title={isRecording ? 'Stop Recording' : 'Start Recording'}
          >
            {isRecording ? <Square size={11} fill="currentColor" /> : <Circle size={11} />}
            <span>{isRecording ? 'REC' : 'Record'}</span>
          </button>
          <button
            className="btn btn-ghost monitor-ctrl-btn"
            onClick={() => setShowCrosshair(v => !v)}
          >
            <Crosshair size={13} />
          </button>
          <button className="btn btn-ghost monitor-ctrl-btn">
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Video Feed Area */}
      <div className="monitor-feed">
        {/* Simulated camera background */}
        <div className="monitor-feed-bg">
          <RunwayBackground />
        </div>

        {/* Overlays */}
        <RunwayGrid />
        <Scanline active={inferenceOn} />

        {/* Bounding Boxes */}
        {inferenceOn && detections.map(det => (
          <DetectionBox key={det.id} det={det} />
        ))}

        {/* Crosshair */}
        {showCrosshair && <div className="monitor-crosshair" />}

        {/* Corner HUD elements */}
        <div className="monitor-hud-tl">
          <span className="hud-text">CAM: {cameraSource}</span>
          <span className="hud-text">FRAME: {frameCount.toLocaleString()}</span>
        </div>
        <div className="monitor-hud-tr">
          <span className="hud-text">{new Date().toLocaleTimeString()}</span>
        </div>
        <div className="monitor-hud-bl">
          {!inferenceOn && (
            <div className="monitor-paused-badge">
              <VideoOff size={12} />
              <span>Inference Disabled</span>
            </div>
          )}
        </div>
        <div className="monitor-hud-br">
          <span className="hud-text">{detections.length} objects</span>
        </div>
      </div>
    </div>
  )
}

// ─── Runway SVG Background ────────────────────────────────────────────────────
function RunwayBackground() {
  return (
    <svg
      className="runway-bg-svg"
      viewBox="0 0 800 450"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Sky */}
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2a3a" />
          <stop offset="100%" stopColor="#2d4a2d" />
        </linearGradient>
        <linearGradient id="runwayGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c1c1c" />
          <stop offset="100%" stopColor="#2a2a2a" />
        </linearGradient>
        <filter id="blur-sm">
          <feGaussianBlur stdDeviation="1" />
        </filter>
      </defs>

      {/* Sky */}
      <rect x="0" y="0" width="800" height="180" fill="url(#skyGrad)" />

      {/* Ground */}
      <rect x="0" y="170" width="800" height="280" fill="#1a2212" />

      {/* Runway surface */}
      <polygon points="300,170 500,170 780,450 20,450" fill="url(#runwayGrad)" />

      {/* Runway center line markings */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
        const y1 = 175 + i * 35
        const y2 = y1 + 22
        const ratio1 = (y1 - 170) / 280
        const ratio2 = (y2 - 170) / 280
        const cx1 = 400
        const cx2 = 400
        const hw1 = 2 + ratio1 * 40
        const hw2 = 2 + ratio2 * 40
        return (
          <polygon
            key={i}
            points={`${cx1 - hw1},${y1} ${cx1 + hw1},${y1} ${cx2 + hw2},${y2} ${cx2 - hw2},${y2}`}
            fill="rgba(255,255,255,0.55)"
          />
        )
      })}

      {/* Runway edge lines */}
      <line x1="300" y1="170" x2="20" y2="450" stroke="rgba(255,255,200,0.5)" strokeWidth="2" />
      <line x1="500" y1="170" x2="780" y2="450" stroke="rgba(255,255,200,0.5)" strokeWidth="2" />

      {/* Runway lights */}
      {[0, 1, 2, 3, 4, 5].map(i => {
        const t = i / 5
        const y = 175 + t * 270
        const xLeft = 300 - t * 280
        const xRight = 500 + t * 280
        return (
          <g key={i}>
            <circle cx={xLeft} cy={y} r={2 + t * 2} fill="rgba(255,220,50,0.8)" />
            <circle cx={xRight} cy={y} r={2 + t * 2} fill="rgba(255,220,50,0.8)" />
          </g>
        )
      })}

      {/* Horizon haze */}
      <rect x="0" y="165" width="800" height="15" fill="rgba(100,150,100,0.15)" filter="url(#blur-sm)" />

      {/* Noise overlay */}
      <rect x="0" y="0" width="800" height="450" fill="url(#noise)" opacity="0.03" />
    </svg>
  )
}