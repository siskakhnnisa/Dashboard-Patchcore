import React, { useState } from 'react'
import { Play, Pause, RotateCcw, Settings, CheckCircle2, Circle, AlertCircle } from 'lucide-react'
import '../../styles/PipelineControlPanel.css'

const PIPELINE_STAGES = [
  {
    id: 'runway-seg',
    label: 'Runway Segmentation',
    color: '#22c55e',
    defaultActive: true,
    description: 'Semantic segmentation of runway area',
  },
  {
    id: 'roi-masking',
    label: 'ROI Masking',
    color: '#eab308',
    defaultActive: true,
    description: 'Region of interest extraction',
  },
  {
    id: 'patchcore',
    label: 'Patchcore Detection',
    color: '#3b82f6',
    defaultActive: true,
    description: 'Anomaly detection via PatchCore',
  },
  {
    id: 'postproc',
    label: 'Post-processing',
    color: '#f97316',
    defaultActive: true,
    description: 'NMS, filtering, bounding box refinement',
  },
]

export default function PipelineControlPanel() {
  const [stages, setStages] = useState(
    PIPELINE_STAGES.reduce((acc, s) => ({ ...acc, [s.id]: s.defaultActive }), {})
  )
  const [pipelineRunning, setPipelineRunning] = useState(true)

  const toggleStage = (id) => {
    setStages(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const activeCount = Object.values(stages).filter(Boolean).length

  return (
    <div className="pipeline-panel card">
      <div className="pipeline-header">
        <div className="pipeline-header-left">
          <span className="section-title" style={{ margin: 0 }}>Pipeline Control Panel</span>
          <span className="pipeline-count">{activeCount}/{PIPELINE_STAGES.length} active</span>
        </div>
        <div className="pipeline-header-right">
          <button
            className={`btn pipeline-toggle-btn ${pipelineRunning ? 'running' : 'stopped'}`}
            onClick={() => setPipelineRunning(v => !v)}
          >
            {pipelineRunning ? <Pause size={11} /> : <Play size={11} />}
            <span>{pipelineRunning ? 'Pause' : 'Resume'}</span>
          </button>
          <button className="btn btn-ghost pipeline-icon-btn">
            <RotateCcw size={12} />
          </button>
          <button className="btn btn-ghost pipeline-icon-btn">
            <Settings size={12} />
          </button>
        </div>
      </div>

      {/* Pipeline flow */}
      <div className="pipeline-flow">
        {PIPELINE_STAGES.map((stage, idx) => {
          const isActive = stages[stage.id] && pipelineRunning
          const isEnabled = stages[stage.id]
          return (
            <div key={stage.id} className="pipeline-stage-wrap">
              <div
                className={`pipeline-stage ${isActive ? 'active' : ''} ${!isEnabled ? 'disabled' : ''}`}
                onClick={() => toggleStage(stage.id)}
              >
                {/* Status icon */}
                <div className="pipeline-stage-icon">
                  {isActive ? (
                    <CheckCircle2 size={13} color={stage.color} />
                  ) : isEnabled ? (
                    <Circle size={13} color={stage.color} />
                  ) : (
                    <AlertCircle size={13} color={stage.color} />
                  )}
                </div>

                {/* Stage info */}
                <div className="pipeline-stage-info">
                  <div className="pipeline-stage-label">{stage.label}</div>
                  <div className="pipeline-stage-desc">{stage.description}</div>
                </div>

                {/* Toggle */}
                <div
                  className={`pipeline-stage-toggle ${isEnabled ? 'on' : 'off'}`}
                  style={{ '--toggle-color': stage.color }}
                />
              </div>

              {/* Connector */}
              {idx < PIPELINE_STAGES.length - 1 && (
                <div className={`pipeline-connector ${isActive ? 'active' : ''}`}>
                  <div className="pipeline-connector-line" style={isActive ? { background: stage.color } : {}} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pipeline status bar */}
      <div className="pipeline-status-bar">
        {PIPELINE_STAGES.map(stage => (
          <div
            key={stage.id}
            className="pipeline-status-seg"
            style={{
              background: stages[stage.id] && pipelineRunning ? stage.color : 'var(--border-light)',
              opacity: stages[stage.id] && pipelineRunning ? 1 : 0.4,
            }}
          />
        ))}
      </div>
    </div>
  )
}