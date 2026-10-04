

export const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'] as const

export const axis = {
  stroke: 'var(--border)',
  tick: { fill: 'var(--muted-foreground)', fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const

export const grid = { stroke: 'var(--border)', strokeDasharray: undefined, vertical: false } as const
