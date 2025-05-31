import { config } from '../../src/config';

describe('Configuration', () => {
  it('should load configuration successfully', () => {
    expect(config).toBeDefined();
    expect(config.solana).toBeDefined();
    expect(config.solana.rpcUrl).toBe('https://api.devnet.solana.com');
  });

  it('should have required configuration properties', () => {
    expect(config.solana.rpcUrl).toBeDefined();
    expect(config.solana.privateKey).toBeDefined();
    expect(config.database.url).toBeDefined();
    expect(config.api.secret).toBeDefined();
  });

  it('should handle empty target pools', () => {
    expect(config.pools.targetPools).toEqual([]);
  });

  it('should have default risk management settings', () => {
    expect(config.bot.maxPositionSize).toBeGreaterThan(0);
    expect(config.bot.maxPortfolioSize).toBeGreaterThan(0);
    expect(config.risk.maxDrawdownThreshold).toBeGreaterThan(0);
    expect(config.risk.maxDrawdownThreshold).toBeLessThanOrEqual(1);
  });
});