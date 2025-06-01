import DLMM from '@meteora-ag/dlmm';
import { Connection, PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import Big from 'big.js';
import { SolanaService } from './solana';
import { HistoricalDataService } from './historical-data';
import { MetricsService } from './metrics';
import { logger } from '../utils/logger';
import { config } from '../config';
import { getErrorMessage } from '../utils/error';
import { 
  PoolData, 
  TokenInfo, 
  BinData, 
  MarketData, 
  MarketTrend, 
  TradingOpportunity, 
  TrendDirection, 
  OpportunityType, 
  RiskLevel,
  HistoricalDataPoint,
  TimeFrame,
  PoolMetrics,
  BinLiquidity
} from '../types';

export class MarketDataService {
  private solanaService: SolanaService;
  private connection: Connection;
  private poolCache: Map<string, PoolData> = new Map();
  private dlmmInstances: Map<string, DLMM> = new Map();
  private historicalService: HistoricalDataService;
  private metricsService: MetricsService;
  private lastUpdate: Date = new Date(0);
  private updateInterval: number = 30000; // 30 seconds

  constructor(solanaService: SolanaService) {
    this.solanaService = solanaService;
    this.connection = solanaService.getConnection();
    this.historicalService = new HistoricalDataService();
    this.metricsService = new MetricsService();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing market data service');
      
      // Initialize DLMM instances for target pools
      if (config.pools.targetPools.length > 0) {
        await this.initializePools(config.pools.targetPools);
      }
      
      // Start periodic updates
      this.startPeriodicUpdates();
      
      logger.info('Market data service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize market data service', { error: getErrorMessage(error) });
      throw error;
    }
  }

  private async initializePools(poolAddresses: string[]): Promise<void> {
    try {
      const publicKeys = poolAddresses.map(addr => new PublicKey(addr));
      const dlmmPools = await DLMM.createMultiple(this.connection, publicKeys);
      
      for (let i = 0; i < poolAddresses.length; i++) {
        const address = poolAddresses[i];
        const dlmm = dlmmPools[i];
        this.dlmmInstances.set(address, dlmm);
        
        // Initial data fetch
        await this.updatePoolData(address, dlmm);
      }
      
      logger.info('Initialized DLMM pools', { count: poolAddresses.length });
    } catch (error) {
      logger.error('Failed to initialize pools', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async addPool(poolAddress: string): Promise<void> {
    try {
      if (this.dlmmInstances.has(poolAddress)) {
        logger.warn('Pool already exists', { poolAddress });
        return;
      }

      const publicKey = new PublicKey(poolAddress);
      const dlmm = await DLMM.create(this.connection, publicKey);
      
      this.dlmmInstances.set(poolAddress, dlmm);
      await this.updatePoolData(poolAddress, dlmm);
      
      logger.info('Added new pool', { poolAddress });
    } catch (error) {
      logger.error('Failed to add pool', { error: getErrorMessage(error), poolAddress });
      throw error;
    }
  }

  async removePool(poolAddress: string): Promise<void> {
    this.dlmmInstances.delete(poolAddress);
    this.poolCache.delete(poolAddress);
    logger.info('Removed pool', { poolAddress });
  }

  private async updateHistoricalData(poolAddress: string, dlmm: DLMM): Promise<void> {
    try {
      const currentData = await this.getCurrentDataPoint(poolAddress, dlmm);
      await this.historicalService.addDataPoint(poolAddress, currentData, TimeFrame.HOURLY);
    } catch (error) {
      logger.error('Failed to update historical data', { error: getErrorMessage(error), poolAddress });
    }
  }

  private async getCurrentDataPoint(poolAddress: string, dlmm: DLMM): Promise<HistoricalDataPoint> {
    const activeBin = await dlmm.getActiveBin();
    const bins = await dlmm.getBinsAroundActiveBin(1, 1);
    const currentBin = bins.bins.find(bin => bin.binId === activeBin.binId);

    if (!currentBin) {
      throw new Error(`Bin not found: ${activeBin.binId}`);
    }

    const feeInfo = dlmm.getFeeInfo();
    const swapFee = new Big(feeInfo.swapFeeRate || 0);

    return {
      timestamp: new Date(),
      price: new Big(activeBin.price),
      volume: new Big(currentBin.xAmount).add(new Big(currentBin.yAmount)),
      fees: swapFee,
      liquidityX: new Big(currentBin.xAmount),
      liquidityY: new Big(currentBin.yAmount),
      binId: activeBin.binId
    };
  }

  private async calculatePoolMetrics(
    poolAddress: string,
    hourlyData: HistoricalDataPoint[],
    currentLiquidity: Big
  ): Promise<PoolMetrics> {
    const volume24h = this.metricsService.calculateVolume24h(hourlyData);
    const fees24h = this.metricsService.calculateFees24h(hourlyData);
    const apr = this.metricsService.calculateAPR(fees24h, currentLiquidity);
    
    // Get price history for volatility calculation
    const priceHistory = hourlyData.map(point => point.price);
    const volatility = this.metricsService.calculateVolatility(priceHistory);

    // Calculate IL from initial price to current (if we have enough history)
    const initialPrice = hourlyData[0]?.price || new Big(0);
    const currentPrice = hourlyData[hourlyData.length - 1]?.price || new Big(0);
    const impermanentLoss = this.metricsService.calculateImpermanentLoss(initialPrice, currentPrice);

    // Get liquidity distribution metrics
    const binData = hourlyData.map(point => ({
      liquidityX: point.liquidityX,
      liquidityY: point.liquidityY
    }));
    const liquidityMetrics = this.metricsService.getLiquidityDistribution(binData);

    return {
      volume24h,
      fees24h,
      apr,
      volatility,
      impermanentLoss,
      liquidityMetrics
    };
  }

  async getBinLiquidityData(poolAddress: string): Promise<BinLiquidity[]> {
    try {
      const dlmm = this.dlmmInstances.get(poolAddress);
      if (!dlmm) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      const binArrays = await dlmm.getBinArrays();
      const activeBin = await dlmm.getActiveBin();
      const binStep = await dlmm.getBinStep();

      const binLiquidityData: BinLiquidity[] = [];
      
      for (const binArray of binArrays) {
        for (const bin of binArray.account.bins) {
          if (!bin.liquidityX.isZero() || !bin.liquidityY.isZero()) {
            const priceX = this.metricsService.calculateBinPrice(
              bin.binId,
              binStep,
              new Big(activeBin.price)
            );

            binLiquidityData.push({
              liquidity: new Big(bin.liquidityX.add(bin.liquidityY).toString()),
              supplyX: new Big(bin.liquidityX.toString()),
              supplyY: new Big(bin.liquidityY.toString()),
              priceX,
              binId: bin.binId,
              isActive: bin.binId === activeBin.binId
            });
          }
        }
      }

      return binLiquidityData.sort((a, b) => a.binId - b.binId);
    } catch (error) {
      logger.error('Failed to get bin liquidity data', { error: getErrorMessage(error), poolAddress });
      return [];
    }
  }

  private async updatePoolData(poolAddress: string, dlmm: DLMM): Promise<void> {
    try {
      // Refresh all state data
      await dlmm.refetchStates();
      
      // Get pool parameters and state
      const parameters = await dlmm.getParameters();
      const activeBin = await dlmm.getActiveBin();
      const binArrayStates = await dlmm.getBinArrays();
      const feeInfo = await dlmm.getFeeInfo();
      
      // Get token information
      const [tokenXData, tokenYData] = await Promise.all([
        this.getTokenInfo(dlmm.tokenX),
        this.getTokenInfo(dlmm.tokenY)
      ]);
      
      // Calculate metrics using actual data from SDK
      const hourlyData = await this.historicalService.getLast24HourData(poolAddress);
      const volatilityAcc = await dlmm.getVolatilityAccumulator();

      const poolData: PoolData = {
        address: poolAddress,
        tokenX: {
          address: dlmm.tokenX.publicKey.toString(),
          symbol: 'TOKEN_X',
          decimals: dlmm.tokenX.mint.decimals,
          price: new Big(activeBin.price),
          supply: new Big(0)
        },
        tokenY: {
          address: dlmm.tokenY.publicKey.toString(),
          symbol: 'TOKEN_Y',
          decimals: dlmm.tokenY.mint.decimals,
          price: new Big(1),
          supply: new Big(0)
        },
        activeId: activeBin.binId,
        activeBin: {
          binId: activeBin.binId,
          price: new Big(activeBin.price),
          liquidityX: new Big(0),
          liquidityY: new Big(0),
          totalLiquidity: new Big(0)
        },
        liquidity: new Big(0),
        binArray: binLiquidityData,
        priceData: {
          activeId: activeBin.binId,
          activePrice: new Big(activeBin.price),
          binStep,
          compositePrice: new Big(compositePrices.composite)
        },
        metrics: await this.calculatePoolMetrics(
          poolAddress,
          hourlyData,
          binLiquidityData,
          feeData,
          volatilityAcc
        ),
        lastUpdated: new Date()
      };
      
      this.poolCache.set(poolAddress, poolData);
      
      logger.debug('Updated pool data', { 
        poolAddress, 
        activeBinId: activeBin.binId,
        price: activeBin.price,
        liquidity: totalLiquidity.toString(),
        metrics: {
          volume24h: metrics.volume24h.toString(),
          fees24h: metrics.fees24h.toString(),
          apr: metrics.apr,
          volatility: metrics.volatility
        }
      });
    } catch (error) {
      logger.error('Failed to update pool data', { error: getErrorMessage(error), poolAddress });
      throw error;
    }
  }

  async getPoolData(poolAddress: string): Promise<PoolData | null> {
    const cached = this.poolCache.get(poolAddress);
    if (cached && this.isCacheValid(cached.lastUpdated)) {
      return cached;
    }

    const dlmm = this.dlmmInstances.get(poolAddress);
    if (!dlmm) {
      logger.warn('Pool not found', { poolAddress });
      return null;
    }

    await this.updatePoolData(poolAddress, dlmm);
    return this.poolCache.get(poolAddress) || null;
  }

  async getAllPoolsData(): Promise<PoolData[]> {
    const pools: PoolData[] = [];
    
    for (const [address, dlmm] of this.dlmmInstances) {
      try {
        const poolData = await this.getPoolData(address);
        if (poolData) {
          pools.push(poolData);
        }
      } catch (error) {
        logger.error('Failed to get pool data', { error: getErrorMessage(error), address });
      }
    }
    
    return pools;
  }

  async getActiveBin(poolAddress: string): Promise<{ binId: number; price: string } | null> {
    try {
      const dlmm = this.dlmmInstances.get(poolAddress);
      if (!dlmm) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      await dlmm.refetchStates();
      return await dlmm.getActiveBin();
    } catch (error) {
      logger.error('Failed to get active bin', { error: getErrorMessage(error), poolAddress });
      return null;
    }
  }

  async getBinPrice(poolAddress: string, binId: number): Promise<string | null> {
    try {
      const dlmm = this.dlmmInstances.get(poolAddress);
      if (!dlmm) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      // Use the correct method name from DLMM SDK
      const binArrays = await dlmm.getBinArrays();
      const bin = binArrays.find(binArray => 
        binArray.account.bins.some(bin => bin.binId === binId)
      )?.account.bins.find(bin => bin.binId === binId);
      
      if (!bin) {
        throw new Error(`Bin not found: ${binId}`);
      }
      
      return bin.price;
    } catch (error) {
      const errorMessage = error instanceof Error ? getErrorMessage(error) : String(error);
      logger.error('Failed to get bin price', { error: errorMessage, poolAddress, binId });
      return null;
    }
  }

  async getBinIdFromPrice(poolAddress: string, price: number, roundDown: boolean = true): Promise<number | null> {
    try {
      const dlmm = this.dlmmInstances.get(poolAddress);
      if (!dlmm) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      return dlmm.getBinIdFromPrice(price, roundDown);
    } catch (error) {
      logger.error('Failed to get bin ID from price', { error: getErrorMessage(error), poolAddress, price });
      return null;
    }
  }

  async getBinsAroundActiveBin(poolAddress: string, count: number = 10): Promise<any | null> {
    try {
      const dlmm = this.dlmmInstances.get(poolAddress);
      if (!dlmm) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      await dlmm.refetchStates();
      return await dlmm.getBinsAroundActiveBin(count, count);
    } catch (error) {
      logger.error('Failed to get bins around active bin', { error: getErrorMessage(error), poolAddress });
      return null;
    }
  }

  async getFeeInfo(poolAddress: string): Promise<any | null> {
    try {
      const dlmm = this.dlmmInstances.get(poolAddress);
      if (!dlmm) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      return dlmm.getFeeInfo();
    } catch (error) {
      logger.error('Failed to get fee info', { error: getErrorMessage(error), poolAddress });
      return null;
    }
  }

  async getDynamicFee(poolAddress: string): Promise<any | null> {
    try {
      const dlmm = this.dlmmInstances.get(poolAddress);
      if (!dlmm) {
        throw new Error(`Pool not found: ${poolAddress}`);
      }

      return dlmm.getDynamicFee();
    } catch (error) {
      logger.error('Failed to get dynamic fee', { error: getErrorMessage(error), poolAddress });
      return null;
    }
  }

  async analyzeMarketTrends(): Promise<MarketTrend[]> {
    const trends: MarketTrend[] = [];
    
    try {
      const pools = await this.getAllPoolsData();
      
      for (const pool of pools) {
        // Simple trend analysis based on recent price movement
        // In production, this would use historical data
        const trend: MarketTrend = {
          poolAddress: pool.address,
          direction: TrendDirection.SIDEWAYS, // Default
          strength: 0.5,
          timeframe: '1h',
          confidence: 0.7
        };
        
        // Analyze volatility to determine trend strength
        if (pool.volatility > 0.1) {
          trend.strength = Math.min(pool.volatility, 1.0);
          trend.direction = pool.volatility > 0.2 ? TrendDirection.BULLISH : TrendDirection.BEARISH;
        }
        
        trends.push(trend);
      }
    } catch (error) {
      logger.error('Failed to analyze market trends', { error: getErrorMessage(error) });
    }
    
    return trends;
  }

  async identifyTradingOpportunities(): Promise<TradingOpportunity[]> {
    const opportunities: TradingOpportunity[] = [];
    
    try {
      const pools = await this.getAllPoolsData();
      
      for (const pool of pools) {
        // Identify liquidity provision opportunities
        if (pool.apr > config.performance.targetApy) {
          opportunities.push({
            poolAddress: pool.address,
            type: OpportunityType.LIQUIDITY_PROVISION,
            expectedReturn: new Big(pool.apr),
            riskLevel: pool.volatility > 0.3 ? RiskLevel.HIGH : RiskLevel.MEDIUM,
            confidence: 0.8,
            timeframe: '24h',
            parameters: {
              apr: pool.apr,
              volatility: pool.volatility,
              liquidity: pool.liquidity.toString()
            }
          });
        }
        
        // Identify fee collection opportunities
        if (pool.fees24h.gt(new Big(100))) { // $100+ in fees
          opportunities.push({
            poolAddress: pool.address,
            type: OpportunityType.FEE_COLLECTION,
            expectedReturn: pool.fees24h,
            riskLevel: RiskLevel.LOW,
            confidence: 0.9,
            timeframe: '1h',
            parameters: {
              fees24h: pool.fees24h.toString(),
              volume24h: pool.volume24h.toString()
            }
          });
        }
      }
    } catch (error) {
      logger.error('Failed to identify trading opportunities', { error: getErrorMessage(error) });
    }
    
    return opportunities;
  }

  async getMarketData(): Promise<MarketData> {
    const pools = await this.getAllPoolsData();
    const trends = await this.analyzeMarketTrends();
    const opportunities = await this.identifyTradingOpportunities();
    
    return {
      pools,
      trends,
      opportunities,
      timestamp: new Date()
    };
  }

  private isCacheValid(lastUpdate: Date): boolean {
    const now = new Date();
    return (now.getTime() - lastUpdate.getTime()) < this.updateInterval;
  }

  private startPeriodicUpdates(): void {
    setInterval(async () => {
      try {
        logger.debug('Starting periodic market data update');
        
        for (const [address, dlmm] of this.dlmmInstances) {
          await this.updatePoolData(address, dlmm);
        }
        
        this.lastUpdate = new Date();
        logger.debug('Completed periodic market data update');
      } catch (error) {
        logger.error('Failed periodic market data update', { error: getErrorMessage(error) });
      }
    }, this.updateInterval);
  }

  async calculateVolatility(poolAddress: string, periods: number = 24): Promise<number> {
    try {
      // In production, this would fetch historical price data
      // For now, return a mock volatility based on current market conditions
      const poolData = await this.getPoolData(poolAddress);
      if (!poolData) {
        return 0;
      }
      
      // Mock volatility calculation
      const baseVolatility = 0.1; // 10% base volatility
      const liquidityFactor = Math.max(0.5, Math.min(2.0, 1000000 / Number(poolData.liquidity.toString())));
      
      return baseVolatility * liquidityFactor;
    } catch (error) {
      logger.error('Failed to calculate volatility', { error: getErrorMessage(error), poolAddress });
      return 0;
    }
  }

  async calculateAPR(poolAddress: string): Promise<number> {
    try {
      const poolData = await this.getPoolData(poolAddress);
      if (!poolData) {
        return 0;
      }
      
      // Simple APR calculation based on fees and liquidity
      const dailyFees = poolData.fees24h;
      const totalLiquidity = poolData.liquidity;
      
      if (totalLiquidity.eq(0)) {
        return 0;
      }
      
      const dailyReturn = dailyFees.div(totalLiquidity);
      const annualReturn = dailyReturn.mul(365);
      
      return Number(annualReturn.toString()) * 100; // Convert to percentage
    } catch (error) {
      logger.error('Failed to calculate APR', { error: getErrorMessage(error), poolAddress });
      return 0;
    }
  }

  getDLMMInstance(poolAddress: string): DLMM | null {
    return this.dlmmInstances.get(poolAddress) || null;
  }

  async close(): Promise<void> {
    // Clear intervals and cleanup
    this.poolCache.clear();
    this.dlmmInstances.clear();
    logger.info('Market data service closed');
  }

  async cleanup(): Promise<void> {
    await this.historicalService.cleanup();
    await this.historicalService.close();
  }
}