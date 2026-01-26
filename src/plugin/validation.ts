/**
 * Plugin State Validation
 *
 * Utilities for validating plugin state readiness.
 */

import type { SyncEngine } from '../sync/engine/index.js';
import type { PluginState } from './types.js';
import type { SyncConfig } from '../types/index.js';

/** State with config and engine guaranteed to be present */
export interface ReadyState {
  config: SyncConfig;
  engine: SyncEngine;
}

/** State with config guaranteed to be present */
export interface ConfiguredState {
  config: SyncConfig;
}

/**
 * Check if plugin state has config.
 * Type guard that narrows state.config to SyncConfig.
 */
export function hasConfig(state: PluginState): state is PluginState & ConfiguredState {
  return state.config !== null;
}

/**
 * Check if plugin state is ready for sync operations.
 * Type guard that narrows state.config and state.engine.
 */
export function isPluginReady(state: PluginState): state is PluginState & ReadyState {
  return state.config !== null && state.engine !== null;
}

/**
 * Check if plugin is ready for continuous sync.
 * Requires config.continuousSync enabled and engine initialized.
 */
export function isContinuousSyncReady(state: PluginState): state is PluginState & ReadyState {
  return state.config?.continuousSync === true && state.engine !== null;
}

/**
 * Check if plugin is fully initialized.
 * Requires isInitialized flag and engine.
 */
export function isFullyInitialized(state: PluginState): state is PluginState & ReadyState {
  return state.isInitialized && state.engine !== null && state.config !== null;
}
