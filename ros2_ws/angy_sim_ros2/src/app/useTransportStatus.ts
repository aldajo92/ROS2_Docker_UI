import { useContext } from 'react'
import {
  CommunicationContext,
  type CommunicationContextValue,
} from './CommunicationContext'

/**
 * Hook for UI components to read live transport status. Returns a
 * snapshot — re-renders happen because the provider stores status in
 * React state and re-publishes a new context value on every change.
 */
export function useTransportStatus(): CommunicationContextValue {
  return useContext(CommunicationContext)
}
