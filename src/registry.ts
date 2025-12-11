/**
 * Plugin Registry Module
 * 
 * This module provides a registry for plugins (metas, macros, etc.)
 */

export type PluginType = 'dictionary' | 'macro' | 'meta' | 'system' | 'command';

export interface Plugin<T = unknown> {
  pluginType: PluginType;
  name: string;
  obj: T;
}

/**
 * Plugin Registry
 */
class Registry {
  private plugins: Map<PluginType, Map<string, Plugin>> = new Map();

  constructor() {
    this.plugins.set('dictionary', new Map());
    this.plugins.set('macro', new Map());
    this.plugins.set('meta', new Map());
    this.plugins.set('system', new Map());
    this.plugins.set('command', new Map());
  }

  registerPlugin<T>(pluginType: PluginType, name: string, obj: T): Plugin<T> {
    const plugin: Plugin<T> = {
      pluginType,
      name,
      obj,
    };
    this.plugins.get(pluginType)!.set(name.toLowerCase(), plugin as Plugin);
    return plugin;
  }

  getPlugin<T = unknown>(pluginType: PluginType, name: string): T | null {
    const plugin = this.plugins.get(pluginType)?.get(name.toLowerCase()) as Plugin<T> | undefined;
    return plugin?.obj ?? null;
  }

  listPlugins(pluginType: PluginType): Plugin[] {
    const plugins = this.plugins.get(pluginType);
    if (!plugins) return [];
    return [...plugins.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Update the registry by loading built-in plugins
   */
  update(): void {
    // Register built-in metas
    this.registerBuiltinMetas();
    
    // Register built-in macros
    this.registerBuiltinMacros();
    
    // Register built-in systems
    this.registerBuiltinSystems();
  }

  private registerBuiltinMetas(): void {
    // These will be registered by the meta modules
  }

  private registerBuiltinMacros(): void {
    // These will be registered by the macro modules
  }

  private registerBuiltinSystems(): void {
    // These will be registered by the system modules
  }
}

// Global registry instance
export const registry = new Registry();
