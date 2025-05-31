import { BalancedLiquidityStrategy } from '../../src/strategies/balanced-liquidity';
import { StrategyRegistry } from '../../src/strategies/registry';
import { RiskLevel } from '../../src/types';

describe('Strategy System', () => {
  describe('BalancedLiquidityStrategy', () => {
    let strategy: BalancedLiquidityStrategy;

    beforeEach(() => {
      strategy = new BalancedLiquidityStrategy();
    });

    it('should be defined', () => {
      expect(strategy).toBeDefined();
    });

    it('should have correct name and risk level', () => {
      expect(strategy.name).toBe('balanced_liquidity');
      expect(strategy.riskLevel).toBe(RiskLevel.MEDIUM);
    });

    it('should have required methods', () => {
      expect(typeof strategy.analyze).toBe('function');
      expect(typeof strategy.execute).toBe('function');
      expect(typeof strategy.initialize).toBe('function');
      expect(typeof strategy.cleanup).toBe('function');
    });
  });

  describe('StrategyRegistry', () => {
    let registry: StrategyRegistry;

    beforeEach(() => {
      registry = new StrategyRegistry();
    });

    it('should be defined', () => {
      expect(registry).toBeDefined();
    });

    it('should register strategies', () => {
      const strategy = new BalancedLiquidityStrategy();
      registry.register(strategy);
      
      const retrieved = registry.get('balanced_liquidity');
      expect(retrieved).toBe(strategy);
    });

    it('should list registered strategies', () => {
      const strategy = new BalancedLiquidityStrategy();
      registry.register(strategy);
      
      const strategies = registry.list();
      expect(strategies).toContain('balanced_liquidity');
    });

    it('should throw error for unknown strategy', () => {
      expect(() => {
        registry.get('unknown_strategy');
      }).toThrow('Strategy not found: unknown_strategy');
    });
  });
});