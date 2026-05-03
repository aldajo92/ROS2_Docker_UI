import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type JsonTreeValue =
  | null
  | boolean
  | number
  | string
  | JsonTreeValue[]
  | { readonly [key: string]: JsonTreeValue }

interface JsonTreeViewProps {
  value: unknown
}

const ROOT_PATH: readonly string[] = []

export function JsonTreeView({ value }: Readonly<JsonTreeViewProps>) {
  const tree = useMemo(() => normalizeJsonValue(value), [value])
  const expandablePaths = useMemo(() => collectExpandablePaths(tree), [tree])
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(
    () => new Set(),
  )

  const hasExpandableFields = expandablePaths.length > 0

  const expandAll = () => {
    setExpandedPaths(new Set(expandablePaths))
  }

  const collapseAll = () => {
    setExpandedPaths(new Set())
  }

  const togglePath = (path: readonly string[]) => {
    const key = pathKey(path)
    setExpandedPaths((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <div className="json-tree-view" data-testid="echo-card-message">
      <div className="json-tree-toolbar">
        <button
          type="button"
          onClick={expandAll}
          disabled={!hasExpandableFields}
          data-testid="json-tree-expand-all"
        >
          Expand all
        </button>
        <button
          type="button"
          onClick={collapseAll}
          disabled={!hasExpandableFields}
          data-testid="json-tree-collapse-all"
        >
          Collapse all
        </button>
      </div>

      <div className="json-tree-body" role="tree">
        {renderChildren(tree, ROOT_PATH, 0, expandedPaths, togglePath)}
      </div>
    </div>
  )
}

function renderChildren(
  value: JsonTreeValue,
  path: readonly string[],
  depth: number,
  expandedPaths: ReadonlySet<string>,
  togglePath: (path: readonly string[]) => void,
): ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) return <PrimitiveLine value="[]" depth={depth} />
    return value.map((child, index) =>
      renderNode(
        `[${index}]`,
        child,
        [...path, String(index)],
        depth,
        expandedPaths,
        togglePath,
      ),
    )
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return <PrimitiveLine value="{}" depth={depth} />
    return entries.map(([key, child]) =>
      renderNode(key, child, [...path, key], depth, expandedPaths, togglePath),
    )
  }

  return <PrimitiveLine value={formatPrimitive(value)} depth={depth} />
}

function renderNode(
  label: string,
  value: JsonTreeValue,
  path: readonly string[],
  depth: number,
  expandedPaths: ReadonlySet<string>,
  togglePath: (path: readonly string[]) => void,
): ReactNode {
  const expandable = isExpandable(value)
  const expanded = expandable && expandedPaths.has(pathKey(path))

  if (!expandable) {
    return (
      <div
        key={pathKey(path)}
        className="json-tree-row"
        role="treeitem"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        <span className="json-tree-spacer" aria-hidden="true" />
        <span className="json-tree-key">{label}</span>
        <span className="json-tree-value">{formatPrimitive(value)}</span>
      </div>
    )
  }

  return (
    <div key={pathKey(path)} className="json-tree-node">
      <button
        type="button"
        className="json-tree-row json-tree-row-button"
        role="treeitem"
        aria-expanded={expanded}
        onClick={() => togglePath(path)}
        style={{ paddingLeft: `${depth * 14}px` }}
        data-testid={`json-tree-toggle-${label}`}
      >
        <span className="json-tree-caret" aria-hidden="true">
          {expanded ? 'v' : '>'}
        </span>
        <span className="json-tree-key">{label}</span>
        <span className="json-tree-summary">
          {expanded ? openerFor(value) : collapsedSummary(value)}
        </span>
      </button>
      {expanded && (
        <div className="json-tree-children" role="group">
          {renderChildren(value, path, depth + 1, expandedPaths, togglePath)}
          <div
            className="json-tree-row json-tree-bracket"
            style={{ paddingLeft: `${depth * 14 + 18}px` }}
          >
            {closerFor(value)}
          </div>
        </div>
      )}
    </div>
  )
}

function PrimitiveLine({
  value,
  depth,
}: Readonly<{ value: string; depth: number }>) {
  return (
    <div
      className="json-tree-row"
      role="treeitem"
      style={{ paddingLeft: `${depth * 14}px` }}
    >
      <span className="json-tree-spacer" aria-hidden="true" />
      <span className="json-tree-value">{value}</span>
    </div>
  )
}

function collectExpandablePaths(
  value: JsonTreeValue,
  path: readonly string[] = ROOT_PATH,
): string[] {
  const paths: string[] = []
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      const childPath = [...path, String(index)]
      if (isExpandable(child)) paths.push(pathKey(childPath))
      paths.push(...collectExpandablePaths(child, childPath))
    })
    return paths
  }

  if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, child]) => {
      const childPath = [...path, key]
      if (isExpandable(child)) paths.push(pathKey(childPath))
      paths.push(...collectExpandablePaths(child, childPath))
    })
  }

  return paths
}

function normalizeJsonValue(value: unknown): JsonTreeValue {
  return normalize(value, new WeakSet<object>())
}

function normalize(value: unknown, seen: WeakSet<object>): JsonTreeValue {
  if (value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value)
  }
  if (typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'undefined') return '[undefined]'
  if (typeof value === 'symbol') return String(value)
  if (typeof value === 'function') return '[function]'

  if (value instanceof Uint8Array) {
    return Array.from(value)
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    const normalized = value.map((entry) => normalize(entry, seen))
    seen.delete(value)
    return normalized
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    const output: Record<string, JsonTreeValue> = {}
    Object.entries(value).forEach(([key, entry]) => {
      output[key] = normalize(entry, seen)
    })
    seen.delete(value)
    return output
  }

  return String(value)
}

function isPlainObject(
  value: JsonTreeValue,
): value is { readonly [key: string]: JsonTreeValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isExpandable(value: JsonTreeValue): boolean {
  return Array.isArray(value) || isPlainObject(value)
}

function formatPrimitive(value: JsonTreeValue): string {
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

function collapsedSummary(value: JsonTreeValue): string {
  if (Array.isArray(value)) return '[ ... ]'
  return '{ ... }'
}

function openerFor(value: JsonTreeValue): string {
  if (Array.isArray(value)) return '['
  return '{'
}

function closerFor(value: JsonTreeValue): string {
  if (Array.isArray(value)) return ']'
  return '}'
}

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path)
}
