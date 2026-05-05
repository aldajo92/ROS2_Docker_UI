import { useState, useEffect, useRef, type ChangeEvent, type ReactNode } from 'react'

const ICON_COPY: ReactNode = (
  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
)

const ICON_CHECK: ReactNode = (
  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const ICON_X: ReactNode = (
  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

export interface ScenarioEditorPanelProps {
  /** Current scenario as JSON text. Empty string means "no scenario
   *  has been loaded yet". */
  scenarioText?: string
  /** Notified on every textarea keystroke while the editor is open.
   *  Owned by `App.tsx` so the parent can validate / persist as needed. */
  onScenarioTextChange?: (text: string) => void
  /** Click handler for the "Apply changes" button. The panel always
   *  forwards the latest textarea value; parsing/validation lives in
   *  `App.tsx`, which keeps this card a dumb UI shell. */
  onApplyScenario?: (text: string) => void
  /** Click handler for the "Download scenario JSON" button. */
  onDownloadScenario?: (text: string) => void
  /** When non-empty the editor is fully disabled and the title shows
   *  the reason. Used by the App to lock the editor while in replay
   *  mode, for example. */
  disabledReason?: string
  /** Optional error message rendered under the action row (e.g. JSON
   *  parse / validation failures from the App). */
  errorMessage?: string
  /** Expanded layout mode. When `true`, the card grows to fill the
   *  remaining inspector height. App owns the state because expanding
   *  also hides the sibling Scenario card. */
  expanded?: boolean
  /** Notified when the user toggles the expand/collapse button. */
  onExpandedChange?: (expanded: boolean) => void
}

/**
 * Standalone "Scenario Editor" card. Renders only the chrome — all
 * scenario state, validation, and lifecycle wiring lives in `App.tsx`.
 *
 * UX contract:
 * - When `scenarioText` is empty the card shows an empty-state hint
 *   and disables every action — there is nothing to edit yet.
 * - "Edit scenario" toggles the textarea visibility. The button label
 *   flips to "Hide editor" while open so it doubles as a collapse
 *   control.
 * - "Apply changes" and "Download scenario JSON" remain visible
 *   regardless of edit/preview state, but are disabled until a
 *   scenario has been loaded.
 */
export function ScenarioEditorPanel({
  scenarioText = '',
  onScenarioTextChange,
  onApplyScenario,
  onDownloadScenario,
  disabledReason,
  errorMessage,
  expanded = false,
  onExpandedChange,
}: Readonly<ScenarioEditorPanelProps>) {
  const [isEditing, setIsEditing] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const hasScenario = scenarioText.length > 0
  const lockedByParent =
    typeof disabledReason === 'string' && disabledReason.length > 0
  const allActionsDisabled = lockedByParent || !hasScenario
  const expandDisabled = !hasScenario
  const expandLabel = expanded
    ? 'Collapse scenario editor'
    : 'Expand scenario editor'

  const handleTextChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onScenarioTextChange?.(event.target.value)
  }

  const handleEditClick = () => {
    if (allActionsDisabled) return
    setIsEditing((prev) => !prev)
  }

  const handleApplyClick = () => {
    if (allActionsDisabled) return
    onApplyScenario?.(scenarioText)
  }

  const handleDownloadClick = () => {
    if (allActionsDisabled) return
    onDownloadScenario?.(scenarioText)
  }

  const handleCopyClick = async () => {
    if (copyTimeoutRef.current !== null) {
      clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = null
    }
    try {
      if (!navigator?.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(scenarioText)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopyStatus('idle')
      copyTimeoutRef.current = null
    }, 2000)
  }

  const handleExpandClick = () => {
    if (expandDisabled) return
    onExpandedChange?.(!expanded)
  }

  const editButtonTitle = pickButtonTitle({
    lockedByParent,
    hasScenario,
    disabledReason,
    enabledTitle: isEditing
      ? 'Collapse the editor'
      : 'Open the editor textarea',
  })
  const applyButtonTitle = pickButtonTitle({
    lockedByParent,
    hasScenario,
    disabledReason,
    enabledTitle: 'Validate the JSON and reload the simulation',
  })
  const downloadButtonTitle = pickButtonTitle({
    lockedByParent,
    hasScenario,
    disabledReason,
    enabledTitle: 'Download the current editor contents as a .json file',
  })

  const sectionClassName = expanded
    ? 'panel scenario-editor-panel scenario-editor-panel--expanded'
    : 'panel scenario-editor-panel'

  return (
    <section
      className={sectionClassName}
      aria-label="Scenario Editor"
    >
      <div className="scenario-editor-header">
        <h2>Scenario Editor</h2>
        <button
          type="button"
          className="scenario-editor-expand-button"
          onClick={handleExpandClick}
          disabled={expandDisabled}
          aria-pressed={expanded}
          aria-label={expandLabel}
          title={expandDisabled ? 'Load a scenario first' : expandLabel}
          data-testid="scenario-editor-expand"
        >
          <span aria-hidden="true">{expanded ? '\u2921' : '\u2922'}</span>
        </button>
      </div>
      {hasScenario ? (
        <div className="scenario-editor-preview-shell">
          {!isEditing && !lockedByParent && (
            <button
              type="button"
              className="scenario-editor-copy-button"
              onClick={handleCopyClick}
              aria-label={
                copyStatus === 'idle'
                  ? 'Copy scenario JSON to clipboard'
                  : copyStatus === 'copied'
                    ? 'Copied to clipboard'
                    : 'Copy failed'
              }
              title={
                copyStatus === 'idle'
                  ? 'Copy'
                  : copyStatus === 'copied'
                    ? 'Copied'
                    : 'Copy failed'
              }
              data-testid="scenario-editor-copy"
            >
              {copyStatus === 'idle'
                ? ICON_COPY
                : copyStatus === 'copied'
                  ? ICON_CHECK
                  : ICON_X}
            </button>
          )}
          <pre
            className="scenario-editor-preview"
            data-testid="scenario-editor-preview"
            hidden={isEditing}
          >
            {scenarioText}
          </pre>
        </div>
      ) : (
        <p className="scenario-editor-empty">Load a scenario to edit it.</p>
      )}
      {hasScenario && isEditing && (
        <textarea
          className="scenario-editor-textarea"
          value={scenarioText}
          onChange={handleTextChange}
          spellCheck={false}
          aria-label="Scenario JSON"
          data-testid="scenario-editor-textarea"
          disabled={lockedByParent}
        />
      )}
      <div className="scenario-editor-actions">
        <button
          type="button"
          onClick={handleEditClick}
          disabled={allActionsDisabled}
          title={editButtonTitle}
          data-testid="scenario-editor-toggle"
        >
          {isEditing ? 'Hide editor' : 'Edit scenario'}
        </button>
        <button
          type="button"
          onClick={handleApplyClick}
          disabled={allActionsDisabled}
          title={applyButtonTitle}
          data-testid="scenario-editor-apply"
        >
          Apply changes
        </button>
        <button
          type="button"
          onClick={handleDownloadClick}
          disabled={allActionsDisabled}
          title={downloadButtonTitle}
          data-testid="scenario-editor-download"
        >
          Download
        </button>
      </div>
      {errorMessage && (
        <p className="error" role="alert" data-testid="scenario-editor-error">
          {errorMessage}
        </p>
      )}
      {lockedByParent && (
        <p className="scenario-editor-hint">{disabledReason}</p>
      )}
    </section>
  )
}

function pickButtonTitle({
  lockedByParent,
  hasScenario,
  disabledReason,
  enabledTitle,
}: {
  lockedByParent: boolean
  hasScenario: boolean
  disabledReason: string | undefined
  enabledTitle: string
}): string {
  if (lockedByParent) return disabledReason ?? ''
  if (!hasScenario) return 'Load a scenario first'
  return enabledTitle
}
