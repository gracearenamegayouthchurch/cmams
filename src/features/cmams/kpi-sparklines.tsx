'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { AreaSparkline, useSparklineHover } from '@/components/charts/sparkline'

export interface KpiPoint {
  date: Date
  value: number
}

export interface KpiMetric {
  label: string
  data: KpiPoint[]
  color?: string
  format?: (value: number) => string
}

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const day = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

/** Change from the previous point, in %. `null` for the first point. */
function percentChange(data: KpiPoint[], index: number): number | null {
  const current = data[index]?.value
  const previous = data[index - 1]?.value
  if (current === undefined || !previous) {
    return null
  }
  return ((current - previous) / previous) * 100
}

function KpiCard({
  metric,
  index,
  children,
}: {
  metric: KpiMetric
  /** Hovered index, or `null` to show the latest point. */
  index: number | null
  children: ReactNode
}) {
  const i = index ?? metric.data.length - 1
  const point = metric.data[i]
  const change = percentChange(metric.data, i)
  const format = metric.format ?? compact.format

  return (
    <div className='flex flex-col gap-1 rounded-xl border bg-card p-4'>
      <div className='flex items-center justify-between gap-2 text-xs text-muted-foreground'>
        <span>{metric.label}</span>
        <span className='tabular-nums'>
          {point ? day.format(point.date) : null}
        </span>
      </div>
      <div className='flex items-baseline gap-2'>
        <span className='text-2xl font-semibold tracking-tight tabular-nums'>
          {point ? format(point.value) : '—'}
        </span>
        {change === null ? null : (
          <span
            className={
              change >= 0
                ? 'text-xs text-emerald-600 tabular-nums dark:text-emerald-400'
                : 'text-xs text-rose-600 tabular-nums dark:text-rose-400'
            }
          >
            {change >= 0 ? '+' : ''}
            {change.toFixed(1)}%
          </span>
        )}
      </div>
      <div className='mt-2'>{children}</div>
    </div>
  )
}

/**
 * One hover state for the whole row: hovering any card moves every
 * crosshair and swaps every value. All series must share the same dates.
 */
export function KpiSparklines({ metrics }: { metrics: KpiMetric[] }) {
  const hover = useSparklineHover<KpiPoint>()
  return (
    <div
      className={cn(
        'grid gap-3',
        metrics.length === 4
          ? 'sm:grid-cols-2 xl:grid-cols-4'
          : 'sm:grid-cols-3'
      )}
    >
      {metrics.map((metric) => (
        <KpiCard index={hover.index} key={metric.label} metric={metric}>
          <AreaSparkline
            color={metric.color}
            data={metric.data}
            dataKey='value'
            height={40}
            {...hover.sparklineProps}
          />
        </KpiCard>
      ))}
    </div>
  )
}
