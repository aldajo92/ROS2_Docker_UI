import type { DisplayPlugin, DisplayVisualConfig } from './DisplayPlugin'
import { pathDisplayPlugin } from './plugins/PathDisplayPlugin'

/**
 * Registry of all active display plugins, keyed by plugin id.
 *
 * Production code uses defaultDisplayPluginRegistry. Tests may construct
 * their own registry to control which plugins are available.
 */
export class DisplayPluginRegistry {
  private readonly plugins = new Map<
    string,
    DisplayPlugin<unknown, DisplayVisualConfig>
  >()

  register<T, C extends DisplayVisualConfig>(plugin: DisplayPlugin<T, C>): void {
    this.plugins.set(
      plugin.id,
      plugin as unknown as DisplayPlugin<unknown, DisplayVisualConfig>,
    )
  }

  get(id: string): DisplayPlugin<unknown, DisplayVisualConfig> | undefined {
    return this.plugins.get(id)
  }

  has(id: string): boolean {
    return this.plugins.has(id)
  }
}

/**
 * Pre-populated registry for production use. Import this and pass it to
 * RosbridgeRenderableTopics via options when building the communication layer.
 */
export const defaultDisplayPluginRegistry: DisplayPluginRegistry =
  new DisplayPluginRegistry()

defaultDisplayPluginRegistry.register(pathDisplayPlugin)
