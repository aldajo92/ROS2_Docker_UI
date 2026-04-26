/**
 * Tracks the live set of keyboard keys held down by the user. A pure
 * input observer — it does not know about vehicles, commands, or
 * simulation state. A consumer (e.g. `KeyboardVehicleCommandMapper`)
 * polls `isPressed` once per simulation tick and translates the
 * snapshot into a `VehicleCommand`.
 *
 * Why not push events into the queue directly?
 * The simulation loop runs at a fixed dt; producing one command per
 * keydown event would either burst the queue (key autorepeat) or miss
 * frames where a key is held but no event fires. Polling per tick
 * gives a deterministic 1-command-per-tick rate.
 *
 * Browser concerns handled here:
 *   - Listens on `window` so the user doesn't need to focus the
 *     viewport canvas to drive.
 *   - Ignores events whose target is a form control or a
 *     `contenteditable` element (so typing into the inspector's
 *     scenario picker doesn't drive the car).
 *   - Optionally swallows the default action for arrow keys, which
 *     would otherwise scroll the page.
 *   - Keys are stored lowercase to give callers case-insensitive
 *     lookups (`isPressed("ArrowUp")` and `isPressed("arrowup")` are
 *     equivalent).
 *
 * Lifecycle: `start()` attaches listeners, `stop()` detaches them and
 * clears state. Calling `start()` twice is a no-op.
 */
export interface KeyboardInputSourceOptions {
  /** When true, prevents the browser's default scroll for the four
   *  arrow keys while this source is active. Defaults to true. */
  preventArrowScroll?: boolean
}

const ARROW_KEYS: ReadonlySet<string> = new Set([
  'arrowup',
  'arrowdown',
  'arrowleft',
  'arrowright',
])

function shouldIgnoreKeyboardEvent(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target) return false
  const tag = target.tagName?.toLowerCase()
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    target.isContentEditable === true
  )
}

export class KeyboardInputSource {
  private readonly pressedKeys = new Set<string>()
  private readonly preventArrowScroll: boolean
  private active = false

  constructor(options: KeyboardInputSourceOptions = {}) {
    this.preventArrowScroll = options.preventArrowScroll ?? true
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (shouldIgnoreKeyboardEvent(event)) return
    const key = event.key.toLowerCase()
    if (this.preventArrowScroll && ARROW_KEYS.has(key)) {
      event.preventDefault()
    }
    this.pressedKeys.add(key)
  }

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    // We don't gate keyup on form-target — if a key was registered as
    // pressed before focus moved into a form, we still want to release
    // it. Otherwise the vehicle would keep driving after a tab-away.
    const key = event.key.toLowerCase()
    this.pressedKeys.delete(key)
  }

  private readonly handleBlur = (): void => {
    // Focus loss (alt-tab, devtools, etc.) prevents keyup from firing
    // for held keys — clear everything to avoid a runaway vehicle.
    this.pressedKeys.clear()
  }

  start(): void {
    if (this.active) return
    this.active = true
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('blur', this.handleBlur)
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('blur', this.handleBlur)
    this.pressedKeys.clear()
  }

  isPressed(key: string): boolean {
    return this.pressedKeys.has(key.toLowerCase())
  }

  getPressedKeys(): ReadonlySet<string> {
    return this.pressedKeys
  }

  clear(): void {
    this.pressedKeys.clear()
  }
}
