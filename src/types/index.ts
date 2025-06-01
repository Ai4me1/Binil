import { PublicKey } from '@solana/web3.js';
import Big from 'big.js';

// Core Bot Configuration
export interface BotConfig {
  solana: {
    rpcUrl: string;
    privateKey: string;
  };
  database: {
    url: string;
  };
  api: {
    port: number;
    secret: string;
  };
  bot: {
    maxPortfolioSize: number;
    maxPositionSize: number;
  };
  risk: {
    ilWarningThreshold: number;
    ilActionThreshold: number;
    ilCriticalThreshold: number;
    ilEmergencyThreshold: number;
    maxVolatilityThreshold: number;
    maxDrawdownThreshold: number;
  };
  strategies: {
    balancedLiquidityEnabled: boolean;
    dcaStrategyEnabled: boolean;
    marketMakingEnabled: boolean;
  };
  monitoring: {
    enableAlerts: boolean;
    slackWebhookUrl?: string;
    logLevel: string;
  };
  pools: {
    targetPools: string[];
  };
  performance: {
    targetApy: number;
    minLiquidityUsd: number;
    maxSpreadPercentage: number;
  };
}

// Pool and Market Data
export interface PoolData {
  address: string;
  tokenX: TokenInfo;
  tokenY: TokenInfo;
  parameters: DLMMParameters;
  activeBin: {
    binId: number;
    price: Big;
    state: BinState;
  };
  binArrays: BinArrayState[];
  metrics: PoolMetrics;
  lastUpdated: Date;
}

export interface TokenMetadata {
  name: string;
  symbol: string;
  logoURI?: string;
  website?: string;
  description?: string;
  tags?: string[];
}

export interface TokenSupplyInfo {
  totalSupply: Big;
  circulatingSupply: Big;
  lastUpdate: Date;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  price: Big;
  supply: Big;
  metadata: TokenMetadata;
  supplyInfo: TokenSupplyInfo;
  priceHistory: {
    timestamp: Date;
    price: Big;
  }[];
}

export interface BinData {
  binId: number;
  price: Big;
  liquidityX: Big;
  liquidityY: Big;
  totalLiquidity: Big;
}

export interface LiquidityMetrics {
  concentrationIndex: number;  // 0-1, higher means more concentrated
  liquidityRatio: number;     // Ratio of Y to X liquidity
}

export interface DLMMParameters {
  binStep: number;
  baseFactor: number;
  maxVolatilityAccumulator: number;
  maxFee: number;
  protocolShare: number;
}

export interface BinState {
  amountX: Big;
  amountY: Big;
  price: Big;
  liquiditySupply: Big;
}

export interface BinArrayState {
  startBinId: number;
  totalBins: number;
  bins: {
    [binId: number]: BinState;
  };
}

// Updated metrics to match SDK data
export interface PoolMetrics {
  volume24h: Big;
  fees24h: Big;
  tvl: Big;
  apr: number;
  volatility: number;
  binUtilization: number;
  liquidityDistribution: {
    concentrationIndex: number;
    binCount: number;
  };
}

// Position Management
export interface Position {
  id: string;
  poolAddress: string;
  strategy: string;
  status: PositionStatus;
  lowerBinId: number;
  upperBinId: number;
  liquidityX: Big;
  liquidityY: Big;
  totalLiquidity: Big;
  entryPrice: Big;
  currentPrice: Big;
  unrealizedPnl: Big;
  realizedPnl: Big;
  feesCollected: Big;
  impermanentLoss: Big;
  createdAt: Date;
  updatedAt: Date;
  lastRebalance?: Date;
}

export enum PositionStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  REBALANCING = 'rebalancing',
  ERROR = 'error'
}

// Strategy Framework
export interface Strategy {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  initialize(config: StrategyConfig): Promise<void>;
  analyze(marketData: MarketData): Promise<StrategyAction[]>;
  execute(action: StrategyAction): Promise<ExecutionResult>;
  cleanup(): Promise<void>;
}

export interface StrategyConfig {
  poolAddress: string;
  maxPositionSize: Big;
  riskParameters: RiskParameters;
  [key: string]: any;
}

export interface StrategyAction {
  type: ActionType;
  poolAddress: string;
  parameters: ActionParameters;
  priority: number;
  estimatedGas: number;
  expectedReturn?: Big;
}

export enum ActionType {
  CREATE_POSITION = 'create_position',
  CLOSE_POSITION = 'close_position',
  REBALANCE = 'rebalance',
  COLLECT_FEES = 'collect_fees',
  ADJUST_RANGE = 'adjust_range',
  EMERGENCY_EXIT = 'emergency_exit'
}

export interface ActionParameters {
  positionId?: string;
  binRange?: [number, number];
  liquidityAmount?: Big;
  slippage?: number;
  [key: string]: any;
}

export interface ExecutionResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  gasUsed?: number;
  actualReturn?: Big;
  newPosition?: Position;
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  EXTREME = 'extreme'
}

// Risk Management
export interface RiskParameters {
  maxPositionSize: Big;
  stopLoss?: number;
  takeProfit?: number;
  maxSlippage: number;
  volatilityThreshold: number;
  concentrationLimit: number;
}

export interface RiskMetrics {
  portfolioValue: Big;
  totalPnl: Big;
  maxDrawdown: number;
  sharpeRatio: number;
  volatility: number;
  concentrationRisk: number;
  liquidityRisk: number;
  impermanentLoss: Big;
  riskScore: number; // 0-100
}

export interface RiskAlert {
  level: AlertLevel;
  type: AlertType;
  message: string;
  positionId?: string;
  poolAddress?: string;
  timestamp: Date;
  acknowledged: boolean;
}

export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
  EMERGENCY = 'emergency'
}

export enum AlertType {
  IMPERMANENT_LOSS = 'impermanent_loss',
  POSITION_SIZE = 'position_size',
  VOLATILITY = 'volatility',
  LIQUIDITY = 'liquidity',
  DRAWDOWN = 'drawdown',
  SYSTEM_ERROR = 'system_error'
}

// Market Analysis
export interface MarketData {
  pools: PoolData[];
  trends: MarketTrend[];
  opportunities: TradingOpportunity[];
  timestamp: Date;
}

export interface MarketTrend {
  poolAddress: string;
  direction: TrendDirection;
  strength: number; // 0-1
  timeframe: string;
  confidence: number; // 0-1
}

export enum TrendDirection {
  BULLISH = 'bullish',
  BEARISH = 'bearish',
  SIDEWAYS = 'sideways'
}

export interface TradingOpportunity {
  poolAddress: string;
  type: OpportunityType;
  expectedReturn: Big;
  riskLevel: RiskLevel;
  confidence: number;
  timeframe: string;
  parameters: any;
}

export enum OpportunityType {
  ARBITRAGE = 'arbitrage',
  MEAN_REVERSION = 'mean_reversion',
  MOMENTUM = 'momentum',
  LIQUIDITY_PROVISION = 'liquidity_provision',
  FEE_COLLECTION = 'fee_collection'
}

// Performance Tracking
export interface PerformanceMetrics {
  totalReturn: Big;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  averageWin: Big;
  averageLoss: Big;
  totalTrades: number;
  feesEarned: Big;
  impermanentLoss: Big;
  netProfit: Big;
  period: {
    start: Date;
    end: Date;
  };
}

// API Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  version: string;
  services: ServiceStatus[];
  lastCheck: Date;
}

export interface ServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'error';
  latency?: number;
  lastCheck: Date;
  error?: string;
}

// Database Entities
export interface DbPosition {
  id: string;
  poolAddress: string;
  strategy: string;
  status: string;
  lowerBinId: number;
  upperBinId: number;
  liquidityX: string;
  liquidityY: string;
  totalLiquidity: string;
  entryPrice: string;
  currentPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
  feesCollected: string;
  impermanentLoss: string;
  createdAt: Date;
  updatedAt: Date;
  lastRebalance?: Date;
}

export interface DbTransaction {
  id: string;
  positionId: string;
  type: string;
  amount: string;
  price: string;
  fees: string;
  gasUsed: number;
  transactionId: string;
  timestamp: Date;
}

export interface DbPerformance {
  id: string;
  date: Date;
  portfolioValue: string;
  totalPnl: string;
  feesEarned: string;
  impermanentLoss: string;
  activePositions: number;
  dailyReturn: string;
}

// Historical data interfaces
export enum TimeFrame {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly'
}

export interface HistoricalDataPoint {
  timestamp: Date;
  price: Big;
  volume: Big;
  fees: Big;
  liquidityX: Big;
  liquidityY: Big;
  binId: number;
}

export interface PoolHistoricalData {
  hourly: HistoricalDataPoint[];
  daily: HistoricalDataPoint[];
  weekly: HistoricalDataPoint[];
}

// Utility Types
export type Awaitable<T> = T | Promise<T>;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Event Types
export interface BotEvent {
  type: string;
  data: any;
  timestamp: Date;
}

export interface PositionEvent extends BotEvent {
  type: 'position_created' | 'position_closed' | 'position_rebalanced';
  data: {
    positionId: string;
    poolAddress: string;
    strategy: string;
  };
}

export interface RiskEvent extends BotEvent {
  type: 'risk_alert' | 'emergency_stop' | 'risk_threshold_exceeded';
  data: {
    alert: RiskAlert;
    action?: string;
  };
}

export interface MarketEvent extends BotEvent {
  type: 'market_update' | 'opportunity_detected' | 'trend_change';
  data: {
    poolAddress: string;
    change: any;
  };
}