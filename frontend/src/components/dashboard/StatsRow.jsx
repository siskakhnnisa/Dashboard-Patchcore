import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import '../../styles/StatsRow.css'

const STATS = [
  {
    label: 'Views',
    value: '7,265',
    change: '+11.01%',
    positive: true,
  },
  {
    label: 'Visits',
    value: '3,671',
    change: '-0.03%',
    positive: false,
  },
  {
    label: 'New Users',
    value: '156',
    change: '+15.03%',
    positive: true,
  },
  {
    label: 'Active Users',
    value: '2,318',
    change: '+6.08%',
    positive: true,
  },
]

export default function StatsRow() {
  return (
    <div className="stats-row">
      {STATS.map((stat) => (
        <div key={stat.label} className="stat-card card">
          <div className="stat-label">{stat.label}</div>
          <div className="stat-bottom">
            <div className="stat-value">{stat.value}</div>
            <div className={`stat-change ${stat.positive ? 'positive' : 'negative'}`}>
              {stat.positive
                ? <TrendingUp size={13} />
                : <TrendingDown size={13} />
              }
              <span>{stat.change}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}