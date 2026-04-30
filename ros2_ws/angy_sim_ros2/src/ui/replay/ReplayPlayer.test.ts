import { describe, expect, it } from 'vitest'
import { ReplayPlayer } from './ReplayPlayer'
import { ReplaySession } from '../../simulation/recording/ReplaySession'
import {
  REPLAY_FORMAT_TAG,
  REPLAY_FORMAT_VERSION,
  type ReplayFileFormat,
} from '../../simulation/recording/ReplayFormat'
import type { SimulationFrameSnapshot } from '../../simulation/recording/SimulationFrameSnapshot'

function frame(tick: number, timeSec = tick * 0.1): SimulationFrameSnapshot {
  return { tick, timeSec, entities: [] }
}

function buildReplay(count: number, dt = 0.1): ReplayFileFormat {
  const frames: SimulationFrameSnapshot[] = []
  for (let i = 0; i < count; i++) frames.push(frame(i + 1, i * dt))
  return {
    format: REPLAY_FORMAT_TAG,
    version: REPLAY_FORMAT_VERSION,
    fixedDtSec: dt,
    frames,
  }
}

/**
 * Minimal scheduler that runs queued callbacks synchronously when
 * `flush()` is called. Each `play()` schedules ONE callback at a time
 * (the player re-schedules itself), so flush replays whatever is
 * pending and drains until the queue is empty or the player pauses.
 */
function createManualScheduler() {
  const queue: Array<() => void> = []
  const scheduler = (cb: () => void) => {
    queue.push(cb)
    return () => {
      const idx = queue.indexOf(cb)
      if (idx >= 0) queue.splice(idx, 1)
    }
  }
  const flush = () => {
    while (queue.length > 0) {
      const next = queue.shift()
      next?.()
    }
  }
  const drainOne = () => {
    const next = queue.shift()
    next?.()
  }
  return { scheduler, flush, drainOne, queue }
}

describe('ReplayPlayer', () => {
  it('starts paused and play() schedules a forward step', () => {
    const session = new ReplaySession(buildReplay(5))
    const { scheduler, queue, drainOne } = createManualScheduler()
    let now = 0
    const player = new ReplayPlayer(session, {
      scheduler,
      now: () => now,
    })
    expect(player.isPlaying()).toBe(false)
    player.play()
    expect(player.isPlaying()).toBe(true)
    expect(queue.length).toBe(1)

    now = 1000
    drainOne()
    expect(session.getCurrentIndex()).toBeGreaterThan(0)
    player.dispose()
  })

  it('walks the cursor toward the last frame and auto-pauses there', () => {
    const session = new ReplaySession(buildReplay(4))
    const { scheduler, flush } = createManualScheduler()
    let now = 0
    const player = new ReplayPlayer(session, {
      scheduler,
      now: () => now,
    })
    player.play()
    // Each scheduled tick advances ~elapsed/dt frames. Bump the clock
    // by exactly one dt per drain to step one frame at a time.
    while (player.isPlaying()) {
      now += 100
      flush()
    }
    expect(session.getCurrentIndex()).toBe(session.getFrameCount() - 1)
    expect(player.isPlaying()).toBe(false)
  })

  it('pause() cancels the scheduled callback', () => {
    const session = new ReplaySession(buildReplay(10))
    const { scheduler, queue } = createManualScheduler()
    const player = new ReplayPlayer(session, { scheduler, now: () => 0 })
    player.play()
    expect(queue.length).toBe(1)
    player.pause()
    expect(queue.length).toBe(0)
    expect(player.isPlaying()).toBe(false)
  })

  it('toggle flips between play and pause', () => {
    const session = new ReplaySession(buildReplay(3))
    const { scheduler } = createManualScheduler()
    const player = new ReplayPlayer(session, { scheduler, now: () => 0 })
    player.toggle()
    expect(player.isPlaying()).toBe(true)
    player.toggle()
    expect(player.isPlaying()).toBe(false)
    player.dispose()
  })

  it('setSpeed clamps non-finite or non-positive values to a tiny positive', () => {
    const session = new ReplaySession(buildReplay(2))
    const { scheduler } = createManualScheduler()
    const player = new ReplayPlayer(session, { scheduler, now: () => 0 })
    player.setSpeed(-2)
    expect(player.getSpeed()).toBeGreaterThan(0)
    player.setSpeed(Number.NaN)
    expect(player.getSpeed()).toBeGreaterThan(0)
    player.setSpeed(2.5)
    expect(player.getSpeed()).toBeCloseTo(2.5)
  })

  it('higher speed advances more frames per real-time interval', () => {
    const replay = buildReplay(50, 0.1)
    const sessionA = new ReplaySession(replay)
    const sessionB = new ReplaySession(replay)
    const ctxA = createManualScheduler()
    const ctxB = createManualScheduler()
    let nowA = 0
    let nowB = 0

    const slow = new ReplayPlayer(sessionA, {
      scheduler: ctxA.scheduler,
      now: () => nowA,
      speed: 1,
    })
    const fast = new ReplayPlayer(sessionB, {
      scheduler: ctxB.scheduler,
      now: () => nowB,
      speed: 4,
    })

    slow.play()
    fast.play()
    // One real-time tick of 100ms.
    nowA = 100
    nowB = 100
    ctxA.drainOne()
    ctxB.drainOne()
    expect(sessionB.getCurrentIndex()).toBeGreaterThan(
      sessionA.getCurrentIndex(),
    )
    slow.dispose()
    fast.dispose()
  })

  it('play() at the last frame is a no-op', () => {
    const session = new ReplaySession(buildReplay(2))
    session.seekToFrame(1)
    const { scheduler, queue } = createManualScheduler()
    const player = new ReplayPlayer(session, { scheduler, now: () => 0 })
    player.play()
    expect(player.isPlaying()).toBe(false)
    expect(queue.length).toBe(0)
  })

  it('dispose is idempotent', () => {
    const session = new ReplaySession(buildReplay(3))
    const { scheduler } = createManualScheduler()
    const player = new ReplayPlayer(session, { scheduler, now: () => 0 })
    player.play()
    player.dispose()
    player.dispose()
    expect(player.isPlaying()).toBe(false)
  })
})
