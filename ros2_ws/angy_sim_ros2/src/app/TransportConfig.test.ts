import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_ROSBRIDGE_URL,
  readTransportConfig,
} from './TransportConfig'

describe('readTransportConfig', () => {
  it('defaults to "none" with no env vars set', () => {
    const cfg = readTransportConfig({})
    expect(cfg.kind).toBe('none')
    expect(cfg.rosbridgeUrl).toBe(DEFAULT_ROSBRIDGE_URL)
  })

  it('treats an empty VITE_TRANSPORT_KIND as "none"', () => {
    expect(readTransportConfig({ VITE_TRANSPORT_KIND: '' }).kind).toBe('none')
    expect(readTransportConfig({ VITE_TRANSPORT_KIND: '   ' }).kind).toBe(
      'none',
    )
  })

  it('parses each known transport kind case-insensitively', () => {
    expect(readTransportConfig({ VITE_TRANSPORT_KIND: 'rosbridge' }).kind).toBe(
      'rosbridge',
    )
    expect(readTransportConfig({ VITE_TRANSPORT_KIND: 'RosBridge' }).kind).toBe(
      'rosbridge',
    )
    expect(readTransportConfig({ VITE_TRANSPORT_KIND: 'mock' }).kind).toBe(
      'mock',
    )
    expect(readTransportConfig({ VITE_TRANSPORT_KIND: 'memory' }).kind).toBe(
      'memory',
    )
  })

  it('falls back to "none" with a warning on unknown kinds', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readTransportConfig({ VITE_TRANSPORT_KIND: 'bogus' }).kind).toBe(
      'none',
    )
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('honors VITE_ROSBRIDGE_URL when provided', () => {
    const cfg = readTransportConfig({
      VITE_TRANSPORT_KIND: 'rosbridge',
      VITE_ROSBRIDGE_URL: 'ws://robot.local:9090',
    })
    expect(cfg.rosbridgeUrl).toBe('ws://robot.local:9090')
  })

  it('falls back to the default URL on whitespace / empty', () => {
    expect(
      readTransportConfig({
        VITE_TRANSPORT_KIND: 'rosbridge',
        VITE_ROSBRIDGE_URL: '   ',
      }).rosbridgeUrl,
    ).toBe(DEFAULT_ROSBRIDGE_URL)
  })
})
