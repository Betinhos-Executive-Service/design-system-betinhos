import { afterEach, describe, expect, it, vi } from 'vitest'
import { toastTimers } from './Alert'

afterEach(() => { vi.useRealTimers() })

describe('timers do toast', () => {
  it('cada toast some sozinho no seu tempo', () => {
    vi.useFakeTimers()
    const removed: number[] = []
    const timers = toastTimers((id) => removed.push(id))
    timers.start(1, 4000)
    timers.start(2, 1000)
    vi.advanceTimersByTime(1000)
    expect(removed).toEqual([2])
    vi.advanceTimersByTime(3000)
    expect(removed).toEqual([2, 1])
  })

  it('fechar pelo X remove na hora e cancela o timer daquele toast', () => {
    vi.useFakeTimers()
    const removed: number[] = []
    const timers = toastTimers((id) => removed.push(id))
    timers.start(1, 4000)
    timers.dismiss(1)
    vi.advanceTimersByTime(4000)
    expect(removed).toEqual([1])
  })

  it('clear (unmount do provider) cancela todos os pendentes', () => {
    vi.useFakeTimers()
    const removed: number[] = []
    const timers = toastTimers((id) => removed.push(id))
    timers.start(1, 4000)
    timers.start(2, 2000)
    timers.clear()
    vi.advanceTimersByTime(5000)
    expect(removed).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
