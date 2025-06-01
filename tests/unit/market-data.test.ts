import { MarketDataService } from '../../src/services/market-data';
import { SolanaService } from '../../src/services/solana';
import DLMM from '@meteora-ag/dlmm';
import { PublicKey } from '@solana/web3.js';
import Big from 'big.js';

jest.mock('@meteora-ag/dlmm');
jest.mock('../../src/services/solana');

describe('MarketDataService', () => {
  let marketDataService: MarketDataService;
  let mockSolanaService: jest.Mocked<SolanaService>;
  
  const mockPoolAddress = '11111111111111111111111111111111';
  const mockConnection = {
    getAccountInfo: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    mockSolanaService = {
      getConnection: jest.fn().mockReturnValue(mockConnection)
    } as any;

    (DLMM as any).create = jest.fn().mockResolvedValue({
      refetchStates: jest.fn(),
      getActiveBin: jest.fn().mockResolvedValue({
        binId: 1,
        price: '1.5'
      }),
      getFeeInfo: jest.fn().mockReturnValue({
        fee: '0.003'
      }),
      tokenX: {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        mint: { decimals: 6 }
      },
      tokenY: {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        mint: { decimals: 6 }
      },
      getBinsAroundActiveBin: jest.fn().mockResolvedValue({
        bins: [
          { binId: 0, xAmount: '100', yAmount: '150' },
          { binId: 1, xAmount: '200', yAmount: '300' },
          { binId: 2, xAmount: '150', yAmount: '225' }
        ]
      })
    });

    marketDataService = new MarketDataService(mockSolanaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Pool Data Gathering', () => {
    test('should initialize and fetch pool data correctly', async () => {
      // Add pool and verify initialization
      await marketDataService.addPool(mockPoolAddress);
      
      // Get pool data and verify structure
      const poolData = await marketDataService.getPoolData(mockPoolAddress);
      
      expect(poolData).toBeTruthy();
      expect(poolData?.address).toBe(mockPoolAddress);
      expect(poolData?.activeId).toBe(1);
      expect(poolData?.liquidity).toBeTruthy();
      expect(poolData?.tokenX).toBeTruthy();
      expect(poolData?.tokenY).toBeTruthy();
    });

    test('should handle bin data correctly', async () => {
      await marketDataService.addPool(mockPoolAddress);
      
      // Test getting active bin
      const activeBin = await marketDataService.getActiveBin(mockPoolAddress);
      expect(activeBin).toBeTruthy();
      expect(activeBin?.binId).toBe(1);
      expect(activeBin?.price).toBe('1.5');
      
      // Test getting bins around active bin
      const bins = await marketDataService.getBinsAroundActiveBin(mockPoolAddress);
      expect(bins).toBeTruthy();
      expect(Array.isArray(bins.bins)).toBe(true);
      expect(bins.bins.length).toBe(3);
    });

    test('should calculate metrics correctly', async () => {
      await marketDataService.addPool(mockPoolAddress);
      
      // Test APR calculation
      const apr = await marketDataService.calculateAPR(mockPoolAddress);
      expect(typeof apr).toBe('number');
      expect(apr).toBeGreaterThanOrEqual(0);
      
      // Test volatility calculation
      const volatility = await marketDataService.calculateVolatility(mockPoolAddress);
      expect(typeof volatility).toBe('number');
      expect(volatility).toBeGreaterThanOrEqual(0);
      expect(volatility).toBeLessThanOrEqual(1);
    });

    test('should handle pool updates correctly', async () => {
      await marketDataService.addPool(mockPoolAddress);
      
      // Get initial data
      const initialData = await marketDataService.getPoolData(mockPoolAddress);
      
      // Simulate time passing for cache expiry
      jest.advanceTimersByTime(31000); // Move past 30s cache time
      
      // Get updated data
      const updatedData = await marketDataService.getPoolData(mockPoolAddress);
      
      expect(updatedData?.lastUpdated.getTime()).toBeGreaterThan(initialData?.lastUpdated.getTime() || 0);
    });

    test('should handle errors gracefully', async () => {
      // Test with invalid pool address
      const invalidPoolAddress = 'invalid-address';
      
      // Should not throw but return null
      const poolData = await marketDataService.getPoolData(invalidPoolAddress);
      expect(poolData).toBeNull();
      
      // Should handle DLMM errors
      (DLMM as any).mockImplementationOnce(() => {
        throw new Error('DLMM error');
      });
      
      await expect(marketDataService.addPool(mockPoolAddress)).rejects.toThrow();
    });

    test('should track historical data correctly', async () => {
      await marketDataService.addPool(mockPoolAddress);
      
      // Get initial data
      const initialData = await marketDataService.getPoolData(mockPoolAddress);
      expect(initialData).toBeTruthy();
      
      // Verify 24h metrics are initialized
      expect(initialData?.volume24h).toBeTruthy();
      expect(initialData?.fees24h).toBeTruthy();
      
      // Simulate time passing and updates
      for (let i = 0; i < 24; i++) {
        jest.advanceTimersByTime(3600000); // Advance 1 hour
        await marketDataService.getPoolData(mockPoolAddress); // Trigger update
      }
      
      // Get updated data after 24 hours
      const updatedData = await marketDataService.getPoolData(mockPoolAddress);
      expect(updatedData).toBeTruthy();
      
      // Verify metrics are accumulated
      expect(updatedData?.volume24h.gt(0)).toBe(true);
      expect(updatedData?.fees24h.gt(0)).toBe(true);
    });
  });
});
