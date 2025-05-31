import Big from 'big.js';
import { 
  Strategy, 
  StrategyConfig, 
  StrategyAction, 
  ExecutionResult, 
  MarketData, 
  RiskLevel,
  ActionType,
  RiskParameters
} from '../types';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/error';

export abstract class BaseStrategy implements Strategy {
  public abstract name: string;
  public abstract description: string;
  public abstract riskLevel: RiskLevel;
  
  protected config: StrategyConfig;
  protected isInitialized: boolean = false;

  constructor() {}

  async initialize(config: StrategyConfig): Promise<void> {
    try {
      this.config = config;
      await this.validateConfig(config);
      await this.onInitialize();
      this.isInitialized = true;
      
      logger.info('Strategy initialized', { 
        strategy: this.name,
        poolAddress: config.poolAddress 
      });
    } catch (error) {
      logger.error('Failed to initialize strategy', { 
        strategy: this.name,
        error: getErrorMessage(error) 
      });
      throw error;
    }
  }

  async analyze(marketData: MarketData): Promise<StrategyAction[]> {
    if (!this.isInitialized) {
      throw new Error(`Strategy ${this.name} not initialized`);
    }

    try {
      const actions = await this.onAnalyze(marketData);
      
      // Apply risk filters
      const filteredActions = await this.applyRiskFilters(actions, marketData);
      
      // Sort by priority
      filteredActions.sort((a, b) => b.priority - a.priority);
      
      logger.debug('Strategy analysis completed', {
        strategy: this.name,
        actionsGenerated: actions.length,
        actionsAfterFiltering: filteredActions.length
      });
      
      return filteredActions;
    } catch (error) {
      logger.error('Strategy analysis failed', {
        strategy: this.name,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }

  async execute(action: StrategyAction): Promise<ExecutionResult> {
    if (!this.isInitialized) {
      throw new Error(`Strategy ${this.name} not initialized`);
    }

    try {
      logger.info('Executing strategy action', {
        strategy: this.name,
        action: action.type,
        poolAddress: action.poolAddress
      });

      const result = await this.onExecute(action);
      
      // Log execution result
      if (result.success) {
        logger.info('Strategy action executed successfully', {
          strategy: this.name,
          action: action.type,
          transactionId: result.transactionId,
          actualReturn: result.actualReturn?.toString()
        });
      } else {
        logger.error('Strategy action execution failed', {
          strategy: this.name,
          action: action.type,
          error: result.error
        });
      }
      
      return result;
    } catch (error) {
      logger.error('Strategy execution error', {
        strategy: this.name,
        action: action.type,
        error: getErrorMessage(error)
      });
      
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.onCleanup();
      this.isInitialized = false;
      
      logger.info('Strategy cleaned up', { strategy: this.name });
    } catch (error) {
      logger.error('Strategy cleanup failed', {
        strategy: this.name,
        error: getErrorMessage(error)
      });
      throw error;
    }
  }

  // Abstract methods to be implemented by concrete strategies
  protected abstract onInitialize(): Promise<void>;
  protected abstract onAnalyze(marketData: MarketData): Promise<StrategyAction[]>;
  protected abstract onExecute(action: StrategyAction): Promise<ExecutionResult>;
  protected abstract onCleanup(): Promise<void>;

  // Validation methods
  protected async validateConfig(config: StrategyConfig): Promise<void> {
    if (!config.poolAddress) {
      throw new Error('Pool address is required');
    }

    if (!config.maxPositionSize || config.maxPositionSize.lte(0)) {
      throw new Error('Max position size must be greater than 0');
    }

    if (!config.riskParameters) {
      throw new Error('Risk parameters are required');
    }

    await this.validateStrategySpecificConfig(config);
  }

  protected async validateStrategySpecificConfig(config: StrategyConfig): Promise<void> {
    // Override in concrete strategies for specific validation
  }

  // Risk management methods
  protected async applyRiskFilters(
    actions: StrategyAction[], 
    marketData: MarketData
  ): Promise<StrategyAction[]> {
    const filteredActions: StrategyAction[] = [];

    for (const action of actions) {
      if (await this.isActionSafe(action, marketData)) {
        filteredActions.push(action);
      } else {
        logger.warn('Action filtered out by risk management', {
          strategy: this.name,
          action: action.type,
          poolAddress: action.poolAddress
        });
      }
    }

    return filteredActions;
  }

  protected async isActionSafe(action: StrategyAction, marketData: MarketData): Promise<boolean> {
    try {
      // Check position size limits
      if (action.parameters.liquidityAmount) {
        const amount = new Big(action.parameters.liquidityAmount.toString());
        if (amount.gt(this.config.maxPositionSize)) {
          logger.warn('Action exceeds max position size', {
            strategy: this.name,
            amount: amount.toString(),
            maxSize: this.config.maxPositionSize.toString()
          });
          return false;
        }
      }

      // Check volatility limits
      const poolData = marketData.pools.find(p => p.address === action.poolAddress);
      if (poolData && poolData.volatility > this.config.riskParameters.volatilityThreshold) {
        logger.warn('Pool volatility exceeds threshold', {
          strategy: this.name,
          poolAddress: action.poolAddress,
          volatility: poolData.volatility,
          threshold: this.config.riskParameters.volatilityThreshold
        });
        return false;
      }

      // Check slippage limits
      if (action.parameters.slippage && action.parameters.slippage > this.config.riskParameters.maxSlippage) {
        logger.warn('Action slippage exceeds limit', {
          strategy: this.name,
          slippage: action.parameters.slippage,
          maxSlippage: this.config.riskParameters.maxSlippage
        });
        return false;
      }

      return await this.isStrategySpecificActionSafe(action, marketData);
    } catch (error) {
      logger.error('Error in risk assessment', {
        strategy: this.name,
        error: getErrorMessage(error)
      });
      return false;
    }
  }

  protected async isStrategySpecificActionSafe(
    action: StrategyAction, 
    marketData: MarketData
  ): Promise<boolean> {
    // Override in concrete strategies for specific risk checks
    return true;
  }

  // Utility methods
  protected calculatePriority(
    action: StrategyAction, 
    marketData: MarketData
  ): number {
    let priority = 50; // Base priority

    // Increase priority for emergency actions
    if (action.type === ActionType.EMERGENCY_EXIT) {
      priority += 50;
    }

    // Increase priority for fee collection
    if (action.type === ActionType.COLLECT_FEES) {
      priority += 30;
    }

    // Adjust based on expected return
    if (action.expectedReturn) {
      const returnBonus = Math.min(20, Number(action.expectedReturn.toString()) / 100);
      priority += returnBonus;
    }

    // Adjust based on pool conditions
    const poolData = marketData.pools.find(p => p.address === action.poolAddress);
    if (poolData) {
      // Lower priority for high volatility pools
      if (poolData.volatility > 0.3) {
        priority -= 20;
      }
      
      // Higher priority for high APR pools
      if (poolData.apr > 0.2) {
        priority += 15;
      }
    }

    return Math.max(0, Math.min(100, priority));
  }

  protected estimateGas(action: StrategyAction): number {
    // Base gas estimates for different action types
    const gasEstimates = {
      [ActionType.CREATE_POSITION]: 300000,
      [ActionType.CLOSE_POSITION]: 200000,
      [ActionType.REBALANCE]: 400000,
      [ActionType.COLLECT_FEES]: 150000,
      [ActionType.ADJUST_RANGE]: 350000,
      [ActionType.EMERGENCY_EXIT]: 250000
    };

    return gasEstimates[action.type] || 200000;
  }

  protected createAction(
    type: ActionType,
    poolAddress: string,
    parameters: any,
    expectedReturn?: Big
  ): StrategyAction {
    const action: StrategyAction = {
      type,
      poolAddress,
      parameters,
      priority: 50, // Will be calculated later
      estimatedGas: this.estimateGas({ type } as StrategyAction),
      expectedReturn
    };

    return action;
  }

  // Getters
  get isActive(): boolean {
    return this.isInitialized;
  }

  get poolAddress(): string {
    return this.config?.poolAddress || '';
  }

  get maxPositionSize(): Big {
    return this.config?.maxPositionSize || new Big(0);
  }

  get riskParameters(): RiskParameters {
    return this.config?.riskParameters || {
      maxPositionSize: new Big(0),
      maxSlippage: 0.01,
      volatilityThreshold: 0.5,
      concentrationLimit: 0.25
    };
  }
}