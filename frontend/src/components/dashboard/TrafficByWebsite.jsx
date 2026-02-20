import React from 'react'
import '../../styles/TrafficByWebsite.css'

const TRAFFIC_DATA = [
  { source: 'Google', value: 68, color: '#4a90d9' },
  { source: 'YouTube', value: 85, color: '#ef4444' },
  { source: 'Instagram', value: 45, color: '#e1306c' },
  { source: 'Pinterest', value: 72, color: '#e60023' },
  { source: 'Facebook', value: 40, color: '#1877f2' },
  { source: 'Twitter', value: 38, color: '#1da1f2' },
]

export default function TrafficByWebsite() {
  const max = Math.max(...TRAFFIC_DATA.map(d => d.value))

  return (
    <div className="traffic-widget card">
      <div className="traffic-header">
        <span className="section-title" style={{ margin: 0 }}>Traffic by Website</span>
      </div>
      <div className="traffic-list">
        {TRAFFIC_DATA.map(item => (
          <div key={item.source} className="traffic-item">
            <span className="traffic-source">{item.source}</span>
            <div className="traffic-bar-wrap">
              <div
                className="traffic-bar"
                style={{
                  width: `${(item.value / max) * 100}%`,
                  background: item.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}