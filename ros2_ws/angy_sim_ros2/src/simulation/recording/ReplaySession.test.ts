import { describe, expect, it, vi } from 'vitest'
import { ReplaySession } from './ReplaySession'
import {
  REPLAY_FORMAT_TAG,
  REPLAY_FORMAT_VERSION,
  type ReplayFileFormat,
} from './ReplayFormat'
import type { SimulationFrameSnapshot } from './SimulationFrameSnapshot'

function frame(tick: number, timeSec = tick * 0.1): SimulationFrameSnapshot {
  return { tick, timeSec, entities: [] }
}

function buildReplay(
  frames: SimulationFrameSnapshot[],
  fixedDtSec = 0.1,
): ReplayFileFormat {
  return {
    format: REPLAY_FORMAT_TAG,
    version: REPLAY_FORMAT_VERSION,
    fixedDtSec,
    frames,
  }
}

describe('ReplaySession', () => {
  it('exposes frame count, duration and fixed dt from the replay envelope', () => {
    const session = new ReplaySession(
      buildReplay([frame(1, 0), frame(2, 0.1), frame(3, 0.25)], 0.05),
    )
    expect(session.getFrameCount()).toBe(3)
    expect(session.getDurationSec()).toBeCloseTo(0.25)
    expect(session.getFixedDtSec()).toBeCloseTo(0.05)
    expect(session.getCurrentIndex()).toBe(0)
    expect(session.getCurrentFrame().tick).toBe(1)
  })

  it('rejects empty replays', () => {
    expect(() => new ReplaySession(buildReplay([]))).toThrow(/no frames/i)
  })

  it('clamps seekToFrame to [0, frameCount-1]', () => {
    const session = new ReplaySession(
      buildReplay([frame(1), frame(2), frame(3)]),
    )
    session.seekToFrame(-100)
    expect(session.getCurrentIndex()).toBe(0)
    session.seekToFrame(100)
    expect(session.getCurrentIndex()).toBe(2)
    session.seekToFrame(1)
    expect(session.getCurrentIndex()).toBe(1)
  })

  it('seekToTime resolves to the first frame whose timeSec >= t', () => {
    const session = new ReplaySession(
      buildReplay([
        frame(1, 0),
        frame(2, 0.1),
        frame(3, 0.2),
        frame(4, 0.3),
      ]),
    )
    session.seekToTime(0.15)
    expect(session.getCurrentIndex()).toBe(2)
    session.seekToTime(0.1)
    expect(session.getCurrentIndex()).toBe(1)
    session.seekToTime(-1)
    expect(session.getCurrentIndex()).toBe(0)
    session.seekToTime(99)
    expect(session.getCurrentIndex()).toBe(3)
  })

  it('seekToTime ignores non-finite inputs without firing onChange', () => {
    const session = new ReplaySession(
      buildReplay([frame(1, 0), frame(2, 0.1)]),
    )
    session.seekToFrame(1)
    const listener = vi.fn()
    session.onChange(listener)
    session.seekToTime(Number.NaN)
    session.seekToTime(Number.POSITIVE_INFINITY)
    expect(listener).not.toHaveBeenCalled()
  })

  it('stepForward / stepBackward clamp at the bounds', () => {
    const session = new ReplaySession(
      buildReplay([frame(1), frame(2), frame(3)]),
    )
    session.stepBackward(5)
    expect(session.getCurrentIndex()).toBe(0)
    session.stepForward(1)
    session.stepForward(1)
    session.stepForward(50)
    expect(session.getCurrentIndex()).toBe(2)
    session.stepBackward(1)
    expect(session.getCurrentIndex()).toBe(1)
  })

  it('onChange fires only on real index changes', () => {
    const session = new ReplaySession(
      buildReplay([frame(1), frame(2), frame(3)]),
    )
    const listener = vi.fn()
    session.onChange(listener)
    session.seekToFrame(0)
    expect(listener).not.toHaveBeenCalled()

    session.seekToFrame(2)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(2)

    session.stepForward(50)
    expect(listener).toHaveBeenCalledTimes(1)

    session.stepBackward(1)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(1)
  })

  it('reset() returns to index 0 and emits when needed', () => {
    const session = new ReplaySession(
      buildReplay([frame(1), frame(2), frame(3)]),
    )
    const listener = vi.fn()
    session.onChange(listener)
    session.seekToFrame(2)
    session.reset()
    expect(session.getCurrentIndex()).toBe(0)
    expect(listener).toHaveBeenLastCalledWith(0)
  })

  it('unsubscribe stops further notifications', () => {
    const session = new ReplaySession(
      buildReplay([frame(1), frame(2), frame(3)]),
    )
    const listener = vi.fn()
    const off = session.onChange(listener)
    off()
    session.seekToFrame(2)
    expect(listener).not.toHaveBeenCalled()
  })

  it('getFrame(index) clamps without moving the cursor', () => {
    const session = new ReplaySession(
      buildReplay([frame(1), frame(2), frame(3)]),
    )
    expect(session.getFrame(-9).tick).toBe(1)
    expect(session.getFrame(99).tick).toBe(3)
    expect(session.getCurrentIndex()).toBe(0)
  })

  it('getDurationSec returns 0 for single-frame recordings', () => {
    const session = new ReplaySession(buildReplay([frame(1, 5)]))
    expect(session.getDurationSec()).toBe(0)
  })
})
