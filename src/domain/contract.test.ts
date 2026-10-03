import { expect, test } from 'vitest'
import { contractActions, contractTransition, nextRun } from './contract'

test('next run per period', () => {
  expect(nextRun('2026-01-31T00:00:00.000Z', 'weekly')).toBe('2026-02-07T00:00:00.000Z')
  expect(nextRun('2026-01-10T00:00:00.000Z', 'monthly').slice(0, 10)).toBe('2026-02-10')
})

test('only the other side accepts; ended is final', () => {
  expect(contractActions({ status: 'proposed', proposedBy: 'buyer' }, 'supplier')).toEqual(['accept', 'decline'])
  expect(contractActions({ status: 'proposed', proposedBy: 'buyer' }, 'buyer')).toEqual(['end'])
  expect(contractTransition('active', 'pause')).toBe('paused')
  expect(contractTransition('ended', 'resume')).toBeNull()
  expect(contractTransition('paused', 'run_now')).toBeNull()
})
