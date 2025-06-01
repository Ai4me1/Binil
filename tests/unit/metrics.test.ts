import { MetricsService } from '../../src/services/metrics';
import { Big } from 'big.js';
import { HistoricalDataPoint } from '../../src/types';

describe('MetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  describe('Volume and Fee Calculations', () => {
    const mockHourlyData: HistoricalDataPoint[] = [
      {
        timestamp: new Date(),
        price: new Big(100),
        volume: new Big(1000),
        fees: new Big(3),
        liquidityX: new Big(5000),
        liquidityY: new Big(5000),
        binId: 1
      },
      {
        timestamp: new Date(),
        price: new Big(101),
        volume: new Big(2000),
        fees: new Big(6),
        liquidityX: new Big(5100),
        liquidityY: new Big(4900),
        binId: 1
      }
    ];

    test('should calculate 24h volume correctly', () => {
      const volume = metricsService.calculateVolume24h(mockHourlyData);
      expect(volume.eq(new Big(3000))).toBe(true);
    });

    test('should calculate 24h fees correctly', () => {
      const fees = metricsService.calculateFees24h(mockHourlyData);
      expect(fees.eq(new Big(9))).toBe(true);
    });
  });

  describe('APR Calculations', () => {
    test('should calculate APR correctly', () => {
      const fees24h = new Big(100);
      const totalLiquidity = new Big(10000);
      
      const apr = metricsService.calculateAPR(fees24h, totalLiquidity);
      expect(apr).toBe(365); // (100/10000) * 365 * 100 = 365%
    });

    test('should handle zero liquidity', () => {
      const fees24h = new Big(100);
      const totalLiquidity = new Big(0);
      
      const apr = metricsService.calculateAPR(fees24h, totalLiquidity);
      expect(apr).toBe(0);
    });
  });

  describe('Volatility Calculations', () => {
    test('should calculate volatility correctly', () => {
      const priceHistory = [
        new Big(100),
        new Big(110),
        new Big(105),
        new Big(115)
      ];
      
      const volatility = metricsService.calculateVolatility(priceHistory);
      expect(volatility).toBeGreaterThan(0);
      expect(volatility).toBeLessThan(1);
    });

    test('should handle insufficient price history', () => {
      const volatility = metricsService.calculateVolatility([new Big(100)]);
      expect(volatility).toBe(0);
    });
  });

  describe('Impermanent Loss Calculations', () => {
    test('should calculate IL correctly', () => {
      const initialRatio = new Big(1);
      const currentRatio = new Big(1.5);
      
      const il = metricsService.calculateImpermanentLoss(initialRatio, currentRatio);
      expect(il).toBeLessThan(0); // Price change should result in negative IL
    });

    test('should handle zero price ratios', () => {
      const il = metricsService.calculateImpermanentLoss(new Big(0), new Big(1));
      expect(il).toBe(0);
    });
  });

  describe('Liquidity Distribution Analysis', () => {
    test('should calculate distribution metrics correctly', () => {
      const binData = [
        { liquidityX: new Big(1000), liquidityY: new Big(1000) },
        { liquidityX: new Big(2000), liquidityY: new Big(2000) },
        { liquidityX: new Big(1500), liquidityY: new Big(1500) }
      ];
      
      const { concentrationIndex, liquidityRatio } = metricsService.getLiquidityDistribution(binData);
      
      expect(concentrationIndex).toBeGreaterThanOrEqual(0);
      expect(concentrationIndex).toBeLessThanOrEqual(1);
      expect(liquidityRatio).toBe(1); // Equal X and Y liquidity
    });

    test('should handle empty bin data', () => {
      const { concentrationIndex, liquidityRatio } = metricsService.getLiquidityDistribution([]);
      expect(concentrationIndex).toBe(0);
      expect(liquidityRatio).toBe(0);
    });
  });

  describe('MetricsService - Fee Calculations', () => {
    let metricsService: MetricsService;

    beforeEach(() => {
      metricsService = new MetricsService();
    });

    test('calculateFeeInfo with high volume', () => {
      const volume = new Big('1500000'); // $1.5M volume
      const baseFee = 0.3;
      const feeInfo = metricsService.calculateFeeInfo(baseFee, volume);

      expect(feeInfo.baseFeePct).toBe(0.3);
      expect(feeInfo.variableFeePct).toBe(0.1); // Lowest variable fee due to high volume
      expect(feeInfo.totalFeePct).toBe(0.4);
      expect(feeInfo.feeRevenue.toString()).toBe('6000'); // $6000 (0.4% of $1.5M)
    });

    test('calculateFeeInfo with low volume', () => {
      const volume = new Big('50000'); // $50K volume
      const baseFee = 0.3;
      const feeInfo = metricsService.calculateFeeInfo(baseFee, volume);

      expect(feeInfo.baseFeePct).toBe(0.3);
      expect(feeInfo.variableFeePct).toBe(0.25); // Highest variable fee due to low volume
      expect(feeInfo.totalFeePct).toBe(0.55);
      expect(feeInfo.feeRevenue.toString()).toBe('275'); // $275 (0.55% of $50K)
    });

    test('calculateFeeInfo with zero volume', () => {
      const volume = new Big('0');
      const baseFee = 0.3;
      const feeInfo = metricsService.calculateFeeInfo(baseFee, volume);

      expect(feeInfo.baseFeePct).toBe(0.3);
      expect(feeInfo.variableFeePct).toBe(0.25);
      expect(feeInfo.totalFeePct).toBe(0.55);
      expect(feeInfo.feeRevenue.toString()).toBe('0');
    });
  });

  describe('MetricsService - Enhanced Calculations', () => {
    let metricsService: MetricsService;

    beforeEach(() => {
      metricsService = new MetricsService();
    });

    test('calculateCompoundedAPR', () => {
      const dailyFee = new Big('100');
      const totalLiquidity = new Big('10000');
      const apr = metricsService.calculateCompoundedAPR(dailyFee, totalLiquidity);
      
      expect(apr).toBeGreaterThan(0);
      expect(apr).toBeGreaterThan(metricsService.calculateAPR(dailyFee, totalLiquidity));
    });

    test('calculateFeeVolatility', () => {
      const feeHistory = [
        new Big('100'),
        new Big('110'),
        new Big('105'),
        new Big('115'),
        new Big('108')
      ];
      
      const volatility = metricsService.calculateFeeVolatility(feeHistory);
      expect(volatility).toBeGreaterThan(0);
      expect(volatility).toBeLessThan(1);
    });

    test('calculateBinMetrics', () => {
      const binMetrics = metricsService.calculateBinMetrics(
        1, // binId
        3600, // timeInRange (1 hour)
        new Big('1000'), // volumeInBin
        new Big('10000'), // totalVolume
        new Big('5000'), // liquidityInBin
        new Big('50000'), // totalLiquidity
        new Date()
      );

      expect(binMetrics.utilization).toBeGreaterThan(0);
      expect(binMetrics.volumeShare).toBe(0.1); // 1000/10000
      expect(binMetrics.liquidityConcentration).toBe(0.1); // 5000/50000
    });

    test('calculateYieldStability', () => {
      const aprHistory = [10, 11, 9.5, 10.2, 10.1];
      const stability = metricsService.calculateYieldStability(aprHistory);
      
      expect(stability).toBeGreaterThan(0);
      expect(stability).toBeLessThanOrEqual(1);
    });
  });
});
