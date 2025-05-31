import { Strategy } from '../types';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/error';

/**
 * Strategy Registry for managing and accessing trading strategies
 */
export class StrategyRegistry {
  private strategies: Map<string, Strategy> = new Map();

  /**
   * Register a new strategy
   */
  register(strategy: Strategy): void {
    try {
      if (this.strategies.has(strategy.name)) {
        logger.warn(`Strategy ${strategy.name} is already registered. Overwriting.`);
      }
      
      this.strategies.set(strategy.name, strategy);
      logger.info(`Strategy registered: ${strategy.name}`);
    } catch (error) {
      logger.error(`Failed to register strategy ${strategy.name}: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Get a strategy by name
   */
  get(name: string): Strategy {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new Error(`Strategy not found: ${name}`);
    }
    return strategy;
  }

  /**
   * Check if a strategy is registered
   */
  has(name: string): boolean {
    return this.strategies.has(name);
  }

  /**
   * List all registered strategy names
   */
  list(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get all registered strategies
   */
  getAll(): Strategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Unregister a strategy
   */
  unregister(name: string): boolean {
    const removed = this.strategies.delete(name);
    if (removed) {
      logger.info(`Strategy unregistered: ${name}`);
    }
    return removed;
  }

  /**
   * Clear all registered strategies
   */
  clear(): void {
    this.strategies.clear();
    logger.info('All strategies cleared from registry');
  }

  /**
   * Get strategies by risk level
   */
  getByRiskLevel(riskLevel: string): Strategy[] {
    return Array.from(this.strategies.values()).filter(
      strategy => strategy.riskLevel === riskLevel
    );
  }

  /**
   * Get strategy count
   */
  count(): number {
    return this.strategies.size;
  }
}

// Export singleton instance
export const strategyRegistry = new StrategyRegistry();