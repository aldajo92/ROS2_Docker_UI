# Scenario Editor Filename Agent Prompt

Use this prompt when improving the Scenario Editor filename behavior.

This prompt assumes:

- `doc/Architecture.md` and `doc/Development_Guide.md` are the source of truth.
- `src/ui/scenario/ScenarioEditorPanel.tsx` owns the Scenario Editor UI chrome.
- `src/app/App.tsx` owns scenario load/apply/download state.
- `src/ui/scenario/ScenarioJsonUtils.ts` owns scenario JSON formatting and
  download filename helpers.

---

## Agent Role

You are an implementation agent for `angy_sim_ros2`.

Your task is to make the Scenario Editor preview toolbar show the correct
scenario file name, allow the user to edit that file name, and use the same
file name when downloading the scenario JSON.

---

## Current UI Context

The app has a Scenario Picker / Control Panel button for uploading local
scenario JSON files:

```text
Component: ControlPanel
Button test id: control-panel-upload-scenario
Label: Upload scenario JSON
```

The Scenario Editor preview has a toolbar with a file-name label:

```text
Component: ScenarioEditorPanel
File-name element test id: scenario-editor-preview-file-name
```

The toolbar currently derives a label from the scenario JSON `name`, for
example:

```text
simple-scenario.json
```

---

## Problem

When a scenario is uploaded from a local JSON file, the Scenario Editor preview
toolbar should reflect the uploaded file's actual name when available.

The displayed toolbar file name should also be the exact file name used when the
user clicks `Download`.

The user should be able to edit that file name directly from the Scenario
Editor toolbar.

---

## Key Decision

Treat the toolbar file name as UI/download metadata.

Editing the toolbar file name must **not** mutate `scenario.name` inside the
scenario JSON.

Rationale:

- `scenario.name` is semantic scenario metadata.
- the toolbar file name is a UI/download concern.
- renaming a file should not silently rewrite scenario contents.

---

## Desired UX

1. If a scenario is uploaded from a local file:
   - show the uploaded file name in the Scenario Editor toolbar, e.g.
     `warehouse-layout.json`.
2. If a bundled/default scenario is selected:
   - show a derived filename from `scenario.name`, e.g.
     `simple-scenario.json`.
3. If no filename is known:
   - fallback to `scenario.json`.
4. If the filename is too long for the toolbar:
   - truncate visually with ellipsis, e.g. `simple-scenar...`.
   - preserve the full filename in the `title` tooltip.
5. Add a small edit icon/button to the right side of the filename.
6. Clicking the edit icon should enable inline filename editing.
7. Pressing `Enter` commits the new filename.
8. Pressing `Escape` cancels and restores the previous filename.
9. Losing focus commits the new filename if it is non-empty.
10. Empty values must not overwrite the previous filename.
11. The filename should always keep a `.json` extension:
    - if the user enters `demo`, normalize to `demo.json`.
    - if the user enters `demo.json`, keep `demo.json`.

---

## Download Filename Requirement

The filename shown in the Scenario Editor toolbar must be the same filename used
when downloading the scenario.

If the toolbar shows:

```text
custom-map.json
```

then clicking `Download` must download exactly:

```text
custom-map.json
```

Do not append timestamps or extra suffixes when a toolbar filename is available.

Behavior examples:

1. Uploaded file:
   - Uploading `warehouse-layout.json` shows `warehouse-layout.json`.
   - Downloading later downloads `warehouse-layout.json`.
2. Edited filename:
   - If the user renames it to `warehouse-v2.json`, Download uses
     `warehouse-v2.json`.
3. Fallback/generated filename:
   - If no source filename is known, derive from `scenario.name`, e.g.
     `simple-scenario.json`.
   - Download should also use that derived filename.
4. Extension handling:
   - If the user enters `demo`, normalize to `demo.json`.
   - If the user enters `demo.json`, keep `demo.json`.
5. Scenario JSON `name`:
   - editing the toolbar filename must not mutate `scenario.name`.

---

## Implementation Guidance

### 1. Track Source Filename In App State

Add state in `App.tsx`, for example:

```ts
const [currentScenarioFileName, setCurrentScenarioFileName] = useState<string>()
```

When loading a bundled scenario:

- set the filename from the bundled scenario metadata when available, or
- derive it from `scenario.name`, or
- fallback to `scenario.json`.

When uploading a local file:

- set the filename from `File.name`.

### 2. Pass Filename Into ScenarioEditorPanel

Add props to `ScenarioEditorPanel`:

```ts
scenarioFileName?: string
onScenarioFileNameChange?: (next: string) => void
```

`ScenarioEditorPanel` should:

- display `scenarioFileName` when provided.
- fallback to deriving from `scenarioText` when `scenarioFileName` is absent.
- call `onScenarioFileNameChange(next)` after a successful inline rename.

### 3. Normalize Filename

Add or reuse a helper that:

- trims whitespace.
- rejects empty values.
- ensures a `.json` extension.
- optionally sanitizes invalid filesystem characters.

Example behavior:

```ts
normalizeScenarioFileName('demo')      // 'demo.json'
normalizeScenarioFileName('demo.json') // 'demo.json'
normalizeScenarioFileName('   ')       // undefined or previous value
```

Keep this helper pure and unit-testable.

### 4. Use The Toolbar Filename For Download

Update `handleDownloadScenario` in `App.tsx` so `downloadScenarioJsonText`
receives the current toolbar filename as a full filename override.

Prefer `fileName` over `baseName`:

```ts
downloadScenarioJsonText(text, {
  fileName: currentScenarioFileName ?? deriveScenarioFileName(...),
})
```

Do not use the old timestamped naming path when a toolbar filename is available.

### 5. Update ScenarioEditorPanel UI

In the preview toolbar:

- display the filename on the left.
- display an edit icon/button next to the filename.
- keep the Copy button in the actions row before `Edit scenario`.

While editing:

- replace the filename span with an input.
- show the current filename in the input.
- commit on `Enter`.
- cancel on `Escape`.
- commit on blur if the value is valid.

CSS requirements:

```css
.scenario-editor-preview-file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

The edit icon/button should not prevent ellipsis from working.

### 6. Accessibility

- Edit button: `aria-label="Edit scenario file name"`.
- Input: `aria-label="Scenario file name"`.
- Preserve full filename in `title`.
- Keyboard behavior:
  - `Enter` commits.
  - `Escape` cancels.

---

## Do Not Change

- Do not change scenario parsing behavior.
- Do not mutate `scenario.name` when editing the toolbar filename.
- Do not change simulation state.
- Do not change replay behavior.
- Do not change renderer behavior.
- Do not introduce new dependencies.

---

## Tests To Add Or Update

### Upload / Load Behavior

- Uploading `custom-file.json` causes `ScenarioEditorPanel` to display
  `custom-file.json`.
- Bundled scenario fallback still derives `simple-scenario.json` from JSON
  `name`.
- If no name can be read, fallback to `scenario.json`.

### Toolbar UI

- Filename span includes full filename in `title`.
- Long filenames use CSS ellipsis rules.
- Clicking the edit icon shows an input with the current filename.
- Typing `renamed` and pressing `Enter` commits `renamed.json`.
- Typing `renamed.json` and pressing `Enter` commits `renamed.json`.
- Pressing `Escape` cancels and restores the previous filename.
- Blurring the input commits a non-empty value.
- Empty input does not overwrite the previous filename.
- Editing the filename does not mutate the scenario JSON text.

### Download Behavior

- When uploaded filename is `custom-file.json`, clicking Download calls
  `downloadScenarioJsonText` with `{ fileName: 'custom-file.json' }`.
- When filename is edited to `renamed.json`, clicking Download uses
  `renamed.json`.
- When edited to `renamed`, it normalizes and downloads `renamed.json`.
- Download does not append a timestamp when `fileName` is provided.

---

## Validation

Run:

```bash
node_modules/.bin/vitest run src/ui/scenario/ScenarioEditorPanel.test.tsx
node_modules/.bin/vitest run
npx tsc --noEmit
```

---

## Report Back

After implementing, report:

1. How uploaded file names are captured.
2. How filename editing is stored.
3. Confirm whether editing filename mutates scenario JSON `name`.
4. How downloads use the edited filename.
5. Tests added or updated.
6. Typecheck and test results.

