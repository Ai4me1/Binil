import dotenv from 'dotenv';
import Joi from 'joi';
import { BotConfig } from '../types';
import { getErrorMessage } from '../utils/error';

// Load environment variables
dotenv.config();

// Configuration schema validation
const configSchema = Joi.object({
  SOLANA_RPC_URL: Joi.string().uri().required(),
  SOLANA_PRIVATE_KEY: Joi.string().min(32).required(),
  DATABASE_URL: Joi.string().default('./data/bot.sqlite'),
  API_PORT: Joi.number().port().default(3000),
  API_SECRET: Joi.string().min(16).required(),
  MAX_PORTFOLIO_SIZE: Joi.number().positive().default(500000),
  MAX_POSITION_SIZE: Joi.number().positive().default(50000),
  IL_WARNING_THRESHOLD: Joi.number().min(0).max(1).default(0.02),
  IL_ACTION_THRESHOLD: Joi.number().min(0).max(1).default(0.05),
  IL_CRITICAL_THRESHOLD: Joi.number().min(0).max(1).default(0.10),
  IL_EMERGENCY_THRESHOLD: Joi.number().min(0).max(1).default(0.20),
  MAX_VOLATILITY_THRESHOLD: Joi.number().min(0).max(1).default(0.50),
  MAX_DRAWDOWN_THRESHOLD: Joi.number().min(0).max(1).default(0.20),
  BALANCED_LIQUIDITY_ENABLED: Joi.boolean().default(true),
  DCA_STRATEGY_ENABLED: Joi.boolean().default(true),
  MARKET_MAKING_ENABLED: Joi.boolean().default(false),
  ENABLE_ALERTS: Joi.boolean().default(true),
  SLACK_WEBHOOK_URL: Joi.string().uri().optional().allow(''),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  TARGET_POOLS: Joi.string().optional().allow(''),
  TARGET_APY: Joi.number().min(0).default(0.20),
  MIN_LIQUIDITY_USD: Joi.number().positive().default(10000),
  MAX_SPREAD_PERCENTAGE: Joi.number().min(0).max(1).default(0.05),
});

// Validate configuration
const { error, value: envVars } = configSchema.validate(process.env, {
  allowUnknown: true,
  stripUnknown: true,
});

if (error) {
  throw new Error(`Config validation error: ${getErrorMessage(error)}`);
}

// Parse target pools
const parseTargetPools = (poolsString: string): string[] => {
  if (!poolsString || poolsString.trim() === '') {
    return [];
  }
  return poolsString.split(',').map(pool => pool.trim()).filter(pool => pool.length > 0);
};

// Export validated configuration
export const config: BotConfig = {
  solana: {
    rpcUrl: envVars.SOLANA_RPC_URL,
    privateKey: envVars.SOLANA_PRIVATE_KEY,
  },
  database: {
    url: envVars.DATABASE_URL,
  },
  api: {
    port: envVars.API_PORT,
    secret: envVars.API_SECRET,
  },
  bot: {
    maxPortfolioSize: envVars.MAX_PORTFOLIO_SIZE,
    maxPositionSize: envVars.MAX_POSITION_SIZE,
  },
  risk: {
    ilWarningThreshold: envVars.IL_WARNING_THRESHOLD,
    ilActionThreshold: envVars.IL_ACTION_THRESHOLD,
    ilCriticalThreshold: envVars.IL_CRITICAL_THRESHOLD,
    ilEmergencyThreshold: envVars.IL_EMERGENCY_THRESHOLD,
    maxVolatilityThreshold: envVars.MAX_VOLATILITY_THRESHOLD,
    maxDrawdownThreshold: envVars.MAX_DRAWDOWN_THRESHOLD,
  },
  strategies: {
    balancedLiquidityEnabled: envVars.BALANCED_LIQUIDITY_ENABLED,
    dcaStrategyEnabled: envVars.DCA_STRATEGY_ENABLED,
    marketMakingEnabled: envVars.MARKET_MAKING_ENABLED,
  },
  monitoring: {
    enableAlerts: envVars.ENABLE_ALERTS,
    slackWebhookUrl: envVars.SLACK_WEBHOOK_URL,
    logLevel: envVars.LOG_LEVEL,
  },
  pools: {
    targetPools: parseTargetPools(envVars.TARGET_POOLS || ''),
  },
  performance: {
    targetApy: envVars.TARGET_APY,
    minLiquidityUsd: envVars.MIN_LIQUIDITY_USD,
    maxSpreadPercentage: envVars.MAX_SPREAD_PERCENTAGE,
  },
};

// Configuration validation helpers
export const validateConfig = (): boolean => {
  try {
    // Additional runtime validations
    if (config.risk.ilWarningThreshold >= config.risk.ilActionThreshold) {
      throw new Error('IL warning threshold must be less than action threshold');
    }
    
    if (config.risk.ilActionThreshold >= config.risk.ilCriticalThreshold) {
      throw new Error('IL action threshold must be less than critical threshold');
    }
    
    if (config.risk.ilCriticalThreshold >= config.risk.ilEmergencyThreshold) {
      throw new Error('IL critical threshold must be less than emergency threshold');
    }
    
    if (config.bot.maxPositionSize > config.bot.maxPortfolioSize) {
      throw new Error('Max position size cannot exceed max portfolio size');
    }
    
    return true;
  } catch (error) {
    throw new Error(`Configuration validation failed: ${getErrorMessage(error)}`);
  }
};

// Validate configuration on load
validateConfig();

export default config;