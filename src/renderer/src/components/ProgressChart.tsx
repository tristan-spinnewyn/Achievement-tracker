/**
 * Composant de graphique pour afficher la progression des hauts faits dans le temps.
 */

import { useEffect, useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type TooltipItem
} from 'chart.js'
import type { SyncLogEntry } from '@shared/types'

// Enregistrer les composants ChartJS nécessaires
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

export interface ProgressChartData {
  labels: string[]
  completions: number[]
  points: number[]
}

/**
 * Convertit l'historique de sync en données pour le graphique.
 */
function processSyncLog(log: SyncLogEntry[]): ProgressChartData {
  const labels: string[] = []
  const completions: number[] = []
  const points: number[] = []

  // Trier par date (la plus ancienne en premier)
  const sortedLog = [...log].sort((a, b) => a.at.localeCompare(b.at))

  let cumulativeCompletions = 0
  let cumulativePoints = 0

  for (const entry of sortedLog) {
    if (entry.ok) {
      cumulativeCompletions += entry.newlyCompleted
      // Note: On n'a pas les points dans le log, donc on utilise le total
      cumulativePoints = entry.totalCompleted // Approximation
      
      labels.push(new Date(entry.at).toLocaleDateString('fr-FR'))
      completions.push(cumulativeCompletions)
      points.push(cumulativePoints)
    }
  }

  return { labels, completions, points }
}

interface ProgressChartProps {
  className?: string
}

export default function ProgressChart({ className }: ProgressChartProps) {
  const [chartData, setChartData] = useState<ProgressChartData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const log = await window.api.lodestone.syncLog()
        if (log.length > 0) {
          setChartData(processSyncLog(log))
        }
      } catch (error) {
        console.error('Échec du chargement de l\'historique de sync:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return <div className={className}>Chargement du graphique…</div>
  }

  if (!chartData || chartData.labels.length === 0) {
    return <div className={className}>Aucune donnée historique disponible.</div>
  }

  const data = {
    labels: chartData.labels,
    datasets: [
      {
        label: 'Hauts faits obtenus',
        data: chartData.completions,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.3,
        fill: true,
        yAxisID: 'y'
      },
      {
        label: 'Points cumulés',
        data: chartData.points,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.3,
        fill: true,
        yAxisID: 'y1'
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const
      },
      title: {
        display: true,
        text: 'Progression dans le temps',
        font: {
          size: 14
        }
      },
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<'line'>) => {
            return `${context.dataset.label ?? ''}: ${context.raw}`
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Date'
        },
        grid: {
          color: '#334155'
        },
        ticks: {
          color: '#94a3b8'
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: 'Hauts faits'
        },
        grid: {
          color: '#334155'
        },
        ticks: {
          color: '#94a3b8'
        }
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: {
          display: true,
          text: 'Points'
        },
        grid: {
          drawOnChartArea: false
        },
        ticks: {
          color: '#94a3b8'
        }
      }
    }
  }

  return (
    <div className={className}>
      <div className="h-64 w-full">
        <Line data={data} options={options} />
      </div>
    </div>
  )
}
