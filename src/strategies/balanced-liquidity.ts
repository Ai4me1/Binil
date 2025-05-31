import { StrategyType } from '@meteora-ag/dlmm';
import Big from 'big.js';
import { BaseStrategy } from './base';
import { 
  StrategyAction, 
  ExecutionResult, 
  MarketData, 
  RiskLevel,
  ActionType,
  StrategyConfig
} from '../types';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/error';
import { toBig, isGreaterThan, isLessThan, multiply, divide, subtract } from '../utils/math';

interface BalancedLiquidityConfig extends StrategyConfig {
  targetRange: number; // Number of bins on each side of active bin
  rebalanceThreshold: number; // Price movement threshold to trigger rebalance (%)
  minLiquidityAmount: Big;
  maxLiquidityAmount: Big;
  autoCompound: boolean;
  feeCollectionThreshold: Big; // Minimum fees to collect
}

export class BalancedLiquidityStrategy extends BaseStrategy {
  public name = 'balanced_liquidity';
  public description = 'Maintains balanced liquidity around the active bin with automatic rebalancing';
  public riskLevel = RiskLevel.MEDIUM;

  private balancedConfig: BalancedLiquidityConfig;
  private lastActiveBinId: number = 0;
  private lastRebalanceTime: Date = new Date(0);
  private minRebalanceInterval: number = 300000; // 5 minutes

  protected async onInitialize(): Promise<void> {
    this.balancedConfig = {
      targetRange: 10,
      rebalanceThreshold: 0.05, // 5%
      minLiquidityAmount: toBig(100),
      maxLiquidityAmount: toBig(10000),
      autoCompound: true,
      feeCollectionThreshold: toBig(10),
      ...this.config
    } as BalancedLiquidityConfig;

    logger.info('Balanced liquidity strategy initialized', {
      poolAddress: this.config.poolAddress,
      targetRange: this.balancedConfig.targetRange,
      rebalanceThreshold: this.balancedConfig.rebalanceThreshold
    });
  }

  protected async onAnalyze(marketData: MarketData): Promise<StrategyAction[]> {
    const actions: StrategyAction[] = [];
    
    try {
      const poolData = marketData.pools.find(p => p.address === this.config.poolAddress);
      if (!poolData) {
        logger.warn('Pool data not found', { poolAddress: this.config.poolAddress });
        return actions;
      }

      // Check for fee collection opportunities
      const feeActions = await this.analyzeFeeCollection(poolData);
      actions.push(...feeActions);

      // Check for rebalancing opportunities
      const rebalanceActions = await this.analyzeRebalancing(poolData);
      actions.push(...rebalanceActions);

      // Check for new position opportunities
      const positionActions = await this.analyzeNewPositions(poolData, marketData);
      actions.push(...positionActions);

      // Set priorities for all actions
      for (const action of actions) {
        action.priority = this.calculatePriority(action, marketData);
      }

      logger.debug('Balanced liquidity analysis completed', {
        poolAddress: this.config.poolAddress,
        actionsGenerated: actions.length,
        feeActions: feeActions.length,
        rebalanceActions: rebalanceActions.length,
        positionActions: positionActions.length
      });

    } catch (error) {
      logger.error('Error in balanced liquidity analysis', {
        poolAddress: this.config.poolAddress,
        error: getErrorMessage(error)
      });
    }

    return actions;
  }

  private async analyzeFeeCollection(poolData: any): Promise<StrategyAction[]> {
    const actions: StrategyAction[] = [];

    try {
      // Check if fees are above collection threshold
      if (isGreaterThan(poolData.fees24h, this.balancedConfig.feeCollectionThreshold)) {
        const expectedFees = poolData.fees24h;
        
        actions.push(this.createAction(
          ActionType.COLLECT_FEES,
          this.config.poolAddress,
          {
            autoCompound: this.balancedConfig.autoCompound
          },
          expectedFees
        ));

        logger.debug('Fee collection opportunity identified', {
          poolAddress: this.config.poolAddress,
          expectedFees: expectedFees.toString()
        });
      }
    } catch (error) {
      logger.error('Error analyzing fee collection', {
        poolAddress: this.config.poolAddress,
        error: getErrorMessage(error)
      });
    }

    return actions;
  }

  private async analyzeRebalancing(poolData: any): Promise<StrategyAction[]> {
    const actions: StrategyAction[] = [];

    try {
      const currentActiveBinId = poolData.activeId;
      const now = new Date();

      // Check if enough time has passed since last rebalance
      if (now.getTime() - this.lastRebalanceTime.getTime() < this.minRebalanceInterval) {
        return actions;
      }

      // Check if active bin has moved significantly
      if (this.lastActiveBinId !== 0) {
        const binMovement = Math.abs(currentActiveBinId - this.lastActiveBinId);
        const movementThreshold = Math.floor(this.balancedConfig.targetRange * this.balancedConfig.rebalanceThreshold);

        if (binMovement >= movementThreshold) {
          // Calculate new range around current active bin
          const newMinBinId = currentActiveBinId - this.balancedConfig.targetRange;
          const newMaxBinId = currentActiveBinId + this.balancedConfig.targetRange;

          actions.push(this.createAction(
            ActionType.REBALANCE,
            this.config.poolAddress,
            {
              binRange: [newMinBinId, newMaxBinId],
              strategyType: StrategyType.Spot,
              reason: 'Active bin movement'
            }
          ));

          logger.info('Rebalancing opportunity identified', {
            poolAddress: this.config.poolAddress,
            oldActiveBin: this.lastActiveBinId,
            newActiveBin: currentActiveBinId,
            binMovement,
            newRange: [newMinBinId, newMaxBinId]
          });
        }
      }

      this.lastActiveBinId = currentActiveBinId;
    } catch (error) {
      logger.error('Error analyzing rebalancing', {
        poolAddress: this.config.poolAddress,
        error: getErrorMessage(error)
      });
    }

    return actions;
  }

  private async analyzeNewPositions(poolData: any, marketData: MarketData): Promise<StrategyAction[]> {
    const actions: StrategyAction[] = [];

    try {
      // Check if pool conditions are favorable for new positions
      const isVolatilityAcceptable = poolData.volatility <= this.riskParameters.volatilityThreshold;
      const isAPRAttractive = poolData.apr >= 0.1; // 10% minimum APR
      const hasGoodLiquidity = isGreaterThan(poolData.liquidity, toBig(10000)); // $10k minimum liquidity

      if (isVolatilityAcceptable && isAPRAttractive && hasGoodLiquidity) {
        // Calculate optimal position size based on pool conditions
        const optimalSize = this.calculateOptimalPositionSize(poolData, marketData);
        
        if (isGreaterThan(optimalSize, this.balancedConfig.minLiquidityAmount) &&
            isLessThan(optimalSize, this.balancedConfig.maxLiquidityAmount)) {
          
          const activeBinId = poolData.activeId;
          const minBinId = activeBinId - this.balancedConfig.targetRange;
          const maxBinId = activeBinId + this.balancedConfig.targetRange;

          actions.push(this.createAction(
            ActionType.CREATE_POSITION,
            this.config.poolAddress,
            {
              liquidityAmount: optimalSize,
              binRange: [minBinId, maxBinId],
              strategyType: StrategyType.Spot,
              slippage: 0.01
            },
            multiply(optimalSize, toBig(poolData.apr / 365)) // Daily expected return
          ));

          logger.info('New position opportunity identified', {
            poolAddress: this.config.poolAddress,
            optimalSize: optimalSize.toString(),
            apr: poolData.apr,
            volatility: poolData.volatility,
            binRange: [minBinId, maxBinId]
          });
        }
      }
    } catch (error) {
      logger.error('Error analyzing new positions', {
        poolAddress: this.config.poolAddress,
        error: getErrorMessage(error)
      });
    }

    return actions;
  }

  private calculateOptimalPositionSize(poolData: any, marketData: MarketData): Big {
    try {
      // Base size calculation
      let optimalSize = this.config.maxPositionSize.mul(0.1); // Start with 10% of max

      // Adjust based on APR
      const aprMultiplier = Math.min(2.0, Math.max(0.5, poolData.apr / 0.2)); // Scale around 20% APR
      optimalSize = optimalSize.mul(aprMultiplier);

      // Adjust based on volatility (lower volatility = larger position)
      const volatilityMultiplier = Math.max(0.3, 1.0 - poolData.volatility);
      optimalSize = optimalSize.mul(volatilityMultiplier);

      // Adjust based on liquidity (more liquidity = can take larger position)
      const liquidityRatio = Number(poolData.liquidity.toString()) / 100000; // Scale around $100k
      const liquidityMultiplier = Math.min(1.5, Math.max(0.5, liquidityRatio));
      optimalSize = optimalSize.mul(liquidityMultiplier);

      // Ensure within bounds
      if (isLessThan(optimalSize, this.balancedConfig.minLiquidityAmount)) {
        optimalSize = this.balancedConfig.minLiquidityAmount;
      }
      if (isGreaterThan(optimalSize, this.balancedConfig.maxLiquidityAmount)) {
        optimalSize = this.balancedConfig.maxLiquidityAmount;
      }

      logger.debug('Calculated optimal position size', {
        poolAddress: this.config.poolAddress,
        baseSize: this.config.maxPositionSize.mul(0.1).toString(),
        aprMultiplier,
        volatilityMultiplier,
        liquidityMultiplier,
        finalSize: optimalSize.toString()
      });

      return optimalSize;
    } catch (error) {
      logger.error('Error calculating optimal position size', {
        poolAddress: this.config.poolAddress,
        error: getErrorMessage(error)
      });
      return this.balancedConfig.minLiquidityAmount;
    }
  }

  protected async onExecute(action: StrategyAction): Promise<ExecutionResult> {
    try {
      // Update last rebalance time for rebalance actions
      if (action.type === ActionType.REBALANCE) {
        this.lastRebalanceTime = new Date();
      }

      // The actual execution will be handled by the OrderExecutionService
      // This method would typically coordinate with that service
      logger.info('Balanced liquidity strategy executing action', {
        poolAddress: this.config.poolAddress,
        action: action.type,
        parameters: action.parameters
      });

      // Return a placeholder result - in practice, this would call the OrderExecutionService
      return {
        success: true,
        transactionId: 'placeholder',
        actualReturn: action.expectedReturn
      };
    } catch (error) {
      logger.error('Error executing balanced liquidity action', {
        poolAddress: this.config.poolAddress,
        action: action.type,
        error: getErrorMessage(error)
      });

      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  protected async onCleanup(): Promise<void> {
    logger.info('Cleaning up balanced liquidity strategy', {
      poolAddress: this.config.poolAddress
    });
    
    // Reset state
    this.lastActiveBinId = 0;
    this.lastRebalanceTime = new Date(0);
  }

  protected async validateStrategySpecificConfig(config: StrategyConfig): Promise<void> {
    const balancedConfig = config as BalancedLiquidityConfig;
    
    if (balancedConfig.targetRange && balancedConfig.targetRange < 1) {
      throw new Error('Target range must be at least 1 bin');
    }

    if (balancedConfig.rebalanceThreshold && 
        (balancedConfig.rebalanceThreshold < 0.01 || balancedConfig.rebalanceThreshold > 1.0)) {
      throw new Error('Rebalance threshold must be between 1% and 100%');
    }

    if (balancedConfig.minLiquidityAmount && 
        balancedConfig.maxLiquidityAmount &&
        isGreaterThan(balancedConfig.minLiquidityAmount, balancedConfig.maxLiquidityAmount)) {
      throw new Error('Minimum liquidity amount cannot be greater than maximum');
    }
  }

  protected async isStrategySpecificActionSafe(
    action: StrategyAction, 
    marketData: MarketData
  ): Promise<boolean> {
    try {
      const poolData = marketData.pools.find(p => p.address === action.poolAddress);
      if (!poolData) {
        return false;
      }

      // Don't create new positions if volatility is too high
      if (action.type === ActionType.CREATE_POSITION && poolData.volatility > 0.4) {
        logger.warn('Rejecting position creation due to high volatility', {
          poolAddress: action.poolAddress,
          volatility: poolData.volatility
        });
        return false;
      }

      // Don't rebalance too frequently
      if (action.type === ActionType.REBALANCE) {
        const timeSinceLastRebalance = new Date().getTime() - this.lastRebalanceTime.getTime();
        if (timeSinceLastRebalance < this.minRebalanceInterval) {
          logger.warn('Rejecting rebalance due to frequency limit', {
            poolAddress: action.poolAddress,
            timeSinceLastRebalance
          });
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Error in strategy-specific risk assessment', {
        strategy: this.name,
        error: getErrorMessage(error)
      });
      return false;
    }
  }

  // Getters for strategy-specific configuration
  get targetRange(): number {
    return this.balancedConfig?.targetRange || 10;
  }

  get rebalanceThreshold(): number {
    return this.balancedConfig?.rebalanceThreshold || 0.05;
  }

  get autoCompound(): boolean {
    return this.balancedConfig?.autoCompound || true;
  }
}