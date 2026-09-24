import { afterEach, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-24T08:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})
