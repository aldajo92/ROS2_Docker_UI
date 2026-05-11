// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { RendererPanel } from './RendererPanel'
import type { RendererPanelProps } from './RendererPanel'

function mountPanel(props: RendererPanelProps): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  act(() => { root.render(<RendererPanel {...props} />) })
  return container
}

const defaultProps: RendererPanelProps = {
  rendererType: 'three',
  onRendererTypeChange: vi.fn(),
  motionRuntimeType: 'kinematic',
  onMotionRuntimeTypeChange: vi.fn(),
}

describe('RendererPanel', () => {
  describe('renderer selector', () => {
    it('renders renderer select with current value', () => {
      const el = mountPanel(defaultProps)
      const select = el.querySelector<HTMLSelectElement>('#renderer-select')
      expect(select).not.toBeNull()
      expect(select!.value).toBe('three')
    })

    it('calls onRendererTypeChange when renderer changes', () => {
      const onRendererTypeChange = vi.fn()
      const el = mountPanel({ ...defaultProps, onRendererTypeChange })
      const select = el.querySelector<HTMLSelectElement>('#renderer-select')!
      act(() => {
        select.value = 'phaser'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(onRendererTypeChange).toHaveBeenCalledWith('phaser')
    })

    it('shows both renderer options', () => {
      const el = mountPanel(defaultProps)
      const select = el.querySelector<HTMLSelectElement>('#renderer-select')!
      const values = Array.from(select.options).map((o) => o.value)
      expect(values).toEqual(expect.arrayContaining(['three', 'phaser']))
    })
  })

  describe('motion runtime selector', () => {
    it('renders motion runtime select with current value', () => {
      const el = mountPanel(defaultProps)
      const select = el.querySelector<HTMLSelectElement>('#motion-runtime-select')
      expect(select).not.toBeNull()
      expect(select!.value).toBe('kinematic')
    })

    it('reflects rapier as selected value', () => {
      const el = mountPanel({ ...defaultProps, motionRuntimeType: 'rapier' })
      const select = el.querySelector<HTMLSelectElement>('#motion-runtime-select')!
      expect(select.value).toBe('rapier')
    })

    it('reflects remote as selected value', () => {
      const el = mountPanel({ ...defaultProps, motionRuntimeType: 'remote' })
      const select = el.querySelector<HTMLSelectElement>('#motion-runtime-select')!
      expect(select.value).toBe('remote')
    })

    it('remote option value is "remote" while its visible label says "Remote (Pending)"', () => {
      const el = mountPanel(defaultProps)
      const select = el.querySelector<HTMLSelectElement>('#motion-runtime-select')!
      const remoteOption = Array.from(select.options).find((o) => o.value === 'remote')
      expect(remoteOption).toBeDefined()
      expect(remoteOption!.text).toBe('Remote (Pending)')
    })

    it('calls onMotionRuntimeTypeChange when selection changes', () => {
      const onMotionRuntimeTypeChange = vi.fn()
      const el = mountPanel({ ...defaultProps, onMotionRuntimeTypeChange })
      const select = el.querySelector<HTMLSelectElement>('#motion-runtime-select')!
      act(() => {
        select.value = 'rapier'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(onMotionRuntimeTypeChange).toHaveBeenCalledWith('rapier')
    })

    it('shows all three runtime options', () => {
      const el = mountPanel(defaultProps)
      const select = el.querySelector<HTMLSelectElement>('#motion-runtime-select')!
      const values = Array.from(select.options).map((o) => o.value)
      expect(values).toEqual(
        expect.arrayContaining(['kinematic', 'rapier', 'remote']),
      )
    })

    it('has a visible label for the motion runtime select', () => {
      const el = mountPanel(defaultProps)
      const label = el.querySelector<HTMLLabelElement>(
        'label[for="motion-runtime-select"]',
      )
      expect(label).not.toBeNull()
      expect(label!.textContent).toMatch(/motion runtime/i)
    })
  })
})
