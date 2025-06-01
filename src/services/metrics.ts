import { Big } from 'big.js';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/error';
import { HistoricalDataPoint, FeeInfo, BinMetrics, ExtendedPoolMetrics } from '../types';

export class MetricsService {
  constructor() {}

  calculateVolume24h(hourlyData: HistoricalDataPoint[]): Big {
    try {
      if (hourlyData.length === 0) {
        return new Big(0);
      }

      return hourlyData.reduce((total, point) => total.add(point.volume), new Big(0));
    } catch (error) {
      logger.error('Failed to calculate 24h volume', { error: getErrorMessage(error) });
      return new Big(0);
    }
  }

  calculateFees24h(hourlyData: HistoricalDataPoint[]): Big {
    try {
      if (hourlyData.length === 0) {
        return new Big(0);
      }

      return hourlyData.reduce((total, point) => total.add(point.fees), new Big(0));
    } catch (error) {
      logger.error('Failed to calculate 24h fees', { error: getErrorMessage(error) });
      return new Big(0);
    }
  }

  calculateAPR(fees24h: Big, totalLiquidity: Big): number {
    try {
      if (totalLiquidity.eq(0)) {
        return 0;
      }

      // Calculate daily rate
      const dailyRate = fees24h.div(totalLiquidity);
      
      // Annualize and convert to percentage
      return Number(dailyRate.mul(365).mul(100).toString());
    } catch (error) {
      logger.error('Failed to calculate APR', { error: getErrorMessage(error) });
      return 0;
    }
  }

  calculateCompoundedAPR(dailyFee: Big, totalLiquidity: Big, daysPerYear: number = 365): number {
    try {
      if (totalLiquidity.eq(0)) {
        return 0;
      }

      // Daily rate calculation
      const dailyRate = dailyFee.div(totalLiquidity);
      
      // Compound effect calculation: (1 + r)^n - 1
      const compoundedReturn = Math.pow(1 + Number(dailyRate), daysPerYear) - 1;
      
      return compoundedReturn * 100; // Convert to percentage
    } catch (error) {
      logger.error('Failed to calculate compounded APR', { error: getErrorMessage(error) });
      return 0;
    }
  }

  calculateVolatility(priceHistory: Big[]): number {
    try {
      if (priceHistory.length < 2) {
        return 0;
      }

      // Calculate returns
      const returns: number[] = [];
      for (let i = 1; i < priceHistory.length; i++) {
        const prevPrice = priceHistory[i - 1];
        const currentPrice = priceHistory[i];
        const returnValue = Number(currentPrice.div(prevPrice).minus(1).toString());
        returns.push(returnValue);
      }

      // Calculate standard deviation of returns
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);

      // Annualize volatility (assuming hourly data)
      return stdDev * Math.sqrt(24 * 365);
    } catch (error) {
      logger.error('Failed to calculate volatility', { error: getErrorMessage(error) });
      return 0;
    }
  }

  calculateImpermanentLoss(
    initialPriceRatio: Big,
    currentPriceRatio: Big
  ): number {
    try {
      if (initialPriceRatio.eq(0) || currentPriceRatio.eq(0)) {
        return 0;
      }

      // IL = 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
      const ratio = currentPriceRatio.div(initialPriceRatio);
      const sqrtRatio = new Big(Math.sqrt(Number(ratio.toString())));
      const numerator = new Big(2).mul(sqrtRatio);
      const denominator = new Big(1).add(ratio);
      
      return Number(numerator.div(denominator).minus(1).toString());
    } catch (error) {
      logger.error('Failed to calculate impermanent loss', { error: getErrorMessage(error) });
      return 0;
    }
  }

  getLiquidityDistribution(binData: { liquidityX: Big; liquidityY: Big }[]): {
    concentrationIndex: number;
    liquidityRatio: number;
  } {
    try {
      if (binData.length === 0) {
        return { concentrationIndex: 0, liquidityRatio: 0 };
      }

      // Calculate total liquidity
      const totalX = binData.reduce((sum, bin) => sum.add(bin.liquidityX), new Big(0));
      const totalY = binData.reduce((sum, bin) => sum.add(bin.liquidityY), new Big(0));

      // Calculate concentration index (0-1, higher means more concentrated)
      const liquidityShares = binData.map(bin => {
        const binTotal = bin.liquidityX.add(bin.liquidityY);
        return Number(binTotal.div(totalX.add(totalY)).toString());
      });

      const concentrationIndex = 1 - (liquidityShares.reduce((a, b) => a + b * b, 0));

      // Calculate X/Y liquidity ratio
      const liquidityRatio = totalX.eq(0) ? 0 : Number(totalY.div(totalX).toString());

      return {
        concentrationIndex,
        liquidityRatio
      };
    } catch (error) {
      logger.error('Failed to calculate liquidity distribution', { error: getErrorMessage(error) });
      return { concentrationIndex: 0, liquidityRatio: 0 };
    }
  }

  calculateFeeInfo(
    baseFactor: number,
    maxVolatilityFactor: number,
    volatilityAccumulator: Big,
    volumeX: Big,
    volumeY: Big,
    binStep: number
  ): FeeInfo {
    try {
      // Calculate volatility fee according to Meteora's formula
      const volatilityFee = this.calculateVolatilityFee(
        volatilityAccumulator,
        maxVolatilityFactor,
        binStep
      );

      // Base fee in basis points (1bp = 0.01%)
      const baseFeeBps = new Big(baseFactor).mul(100);
      
      // Total fee calculation according to SDK formula
      const totalFeesBps = baseFeeBps.add(volatilityFee);
      
      // Protocol share (30% as per documentation)
      const protocolShare = 0.3;
      
      // Calculate protocol fees
      const totalVolume = volumeX.add(volumeY);
      const protocolFees = totalVolume.mul(totalFeesBps).mul(protocolShare).div(10000);

      return {
        baseFactor,
        maxVolatilityFactor,
        maxFee: 100, // 1% as per documentation
        protocolShare,
        totalFeesBps,
        volatilityFee,
        protocolFees,
        lastFeeUpdate: new Date()
      };
    } catch (error) {
      logger.error('Failed to calculate fee info', { error: getErrorMessage(error) });
      return {
        baseFactor: 0,
        maxVolatilityFactor: 0,
        maxFee: 100,
        protocolShare: 0.3,
        totalFeesBps: new Big(0),
        volatilityFee: new Big(0),
        protocolFees: new Big(0),
        lastFeeUpdate: new Date()
      };
    }
  }

  private calculateVolatilityFee(
    volatilityAccumulator: Big,
    maxVolatilityFactor: number,
    binStep: number
  ): Big {
    try {
      // Meteora's volatility fee formula
      // volatilityFee = min(maxVolatilityFactor, volatilityAccumulator * binStep)
      const volatilityComponent = volatilityAccumulator.mul(binStep);
      const maxFee = new Big(maxVolatilityFactor);

      return volatilityComponent.gt(maxFee) ? maxFee : volatilityComponent;
    } catch (error) {
      logger.error('Failed to calculate volatility fee', { error: getErrorMessage(error) });
      return new Big(0);
    }
  }

  calculateBinPrice(binId: number, binStep: number, basePrice: Big): Big {
    try {
      // Meteora's bin price formula: price = basePrice * (1 + binStep)^binId
      const stepMultiplier = 1 + binStep / 10000; // binStep is in basis points
      const priceMultiplier = Math.pow(stepMultiplier, binId);
      return basePrice.mul(new Big(priceMultiplier));
    } catch (error) {
      logger.error('Failed to calculate bin price', { error: getErrorMessage(error) });
      return new Big(0);
    }
  }

  calculateBinMetrics(
    binId: number,
    timeInRange: number,
    volumeInBin: Big,
    totalVolume: Big,
    liquidityInBin: Big,
    totalLiquidity: Big,
    lastTransition: Date
  ): BinMetrics {
    try {
      return {
        utilization: Number(volumeInBin.div(liquidityInBin)),
        timeInRange,
        volumeShare: Number(volumeInBin.div(totalVolume)),
        liquidityConcentration: Number(liquidityInBin.div(totalLiquidity)),
        lastTransition
      };
    } catch (error) {
      logger.error('Failed to calculate bin metrics', { error: getErrorMessage(error) });
      return {
        utilization: 0,
        timeInRange: 0,
        volumeShare: 0,
        liquidityConcentration: 0,
        lastTransition: new Date()
      };
    }
  }

  calculateYieldStability(aprHistory: number[]): number {
    try {
      if (aprHistory.length < 2) {
        return 1; // Assume stable if not enough data
      }

      // Calculate coefficient of variation (CV)
      const mean = aprHistory.reduce((a, b) => a + b, 0) / aprHistory.length;
      const variance = aprHistory.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / aprHistory.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / mean;

      // Convert CV to stability score (0-1)
      // Lower CV means higher stability
      return 1 / (1 + cv);
    } catch (error) {
      logger.error('Failed to calculate yield stability', { error: getErrorMessage(error) });
      return 0;
    }
  }
}
