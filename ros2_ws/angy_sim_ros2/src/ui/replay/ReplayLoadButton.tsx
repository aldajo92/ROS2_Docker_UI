import { useRef, type ChangeEvent } from 'react'
import type { ReplayFileFormat } from '../../simulation/recording/ReplayFormat'
import { readReplayFromFile } from './ReplayFileLoader'

export interface ReplayLoadButtonProps {
  onLoaded: (replay: ReplayFileFormat) => void
  onError?: (message: string) => void
  /** When non-empty the button is disabled and the title shows the reason. */
  disabledReason?: string
  className?: string
  label?: string
}

/**
 * "Load replay" control. Mounts a hidden `<input type="file">` and
 * proxies clicks through a normal button.
 *
 * Boundaries:
 * - DOM-only — File / FileReader live in `src/ui/replay/**`.
 * - Validation runs through {@link readReplayFromFile} so the parent
 *   never sees a malformed `ReplayFileFormat`.
 * - Errors flow through `onError`; if no handler is provided we fall
 *   back to `console.error` to match the rest of the app's error
 *   pattern.
 */
export function ReplayLoadButton({
  onLoaded,
  onError,
  disabledReason,
  className,
  label = 'Load replay',
}: Readonly<ReplayLoadButtonProps>) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const disabled = !!disabledReason && disabledReason.length > 0

  const handleClick = () => {
    if (disabled) return
    inputRef.current?.click()
  }

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    const result = await readReplayFromFile(file)
    if (result.ok) onLoaded(result.replay)
    else if (onError) onError(result.error)
    else console.error('[replay] load failed:', result.error)
    input.value = ''
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={disabled ? disabledReason : 'Load a recorded replay file'}
        className={className}
      >
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.angy-replay.json,application/json"
        hidden
        onChange={handleChange}
        data-testid="replay-load-input"
      />
    </>
  )
}
