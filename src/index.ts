import { config } from './config';
import { logger } from './utils/logger';
import { DatabaseService } from './services/database';
import { SolanaService } from './services/solana';
import { MarketDataService } from './services/market-data';
import { OrderExecutionService } from './services/order-execution';
import { BalancedLiquidityStrategy } from './strategies/balanced-liquidity';
import { strategyRegistry } from './strategies/registry';
import { ApiServer } from './api';
import { getErrorMessage } from './utils/error';

// ASCII Art Banner
const banner = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║    🌟 METEORA DLMM AUTOMATION BOT 🌟                                        ║
║                                                                              ║
║    Advanced Institution-Grade Trading Bot for Meteora DLMM Pools            ║
║    ⚡ Real-time IL Management | 🎯 Multi-Strategy Framework                  ║
║    🛡️ Enterprise Risk Controls | 📊 Performance Analytics                   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`;

class MeteoraDLMMBot {
  private databaseService: DatabaseService;
  private solanaService: SolanaService;
  private marketDataService: MarketDataService;
  private orderExecutionService: OrderExecutionService;
  private apiServer: ApiServer;
  private isRunning = false;

  constructor() {
    this.databaseService = new DatabaseService();
    this.solanaService = new SolanaService();
    this.marketDataService = new MarketDataService(this.solanaService);
    this.orderExecutionService = new OrderExecutionService(
      this.solanaService,
      this.marketDataService,
      this.databaseService
    );
    this.apiServer = new ApiServer();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('🚀 Initializing Meteora DLMM Automation Bot...');

      // Initialize services
      await this.databaseService.initialize();
      await this.solanaService.initialize();
      await this.marketDataService.initialize();
      await this.orderExecutionService.initialize();

      // Register strategies
      this.registerStrategies();

      // Start API server
      await this.apiServer.start();

      logger.info('✅ Bot initialization completed successfully');
    } catch (error) {
      logger.error(`❌ Bot initialization failed: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  private registerStrategies(): void {
    try {
      // Register available strategies
      const balancedStrategy = new BalancedLiquidityStrategy();
      strategyRegistry.register(balancedStrategy);

      logger.info(`📋 Registered ${strategyRegistry.count()} strategies`);
    } catch (error) {
      logger.error(`Failed to register strategies: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      if (this.isRunning) {
        logger.warn('⚠️ Bot is already running');
        return;
      }

      await this.initialize();
      this.isRunning = true;

      logger.info('🎯 Meteora DLMM Automation Bot started successfully');
      logger.info('📊 Monitoring markets and managing positions...');
      logger.info(`🌐 API server running on port ${config.api.port}`);

      // Keep the process running
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

    } catch (error) {
      logger.error(`❌ Failed to start bot: ${getErrorMessage(error)}`);
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    try {
      logger.info('🛑 Shutting down Meteora DLMM Automation Bot...');
      this.isRunning = false;

      // Cleanup services
      await this.apiServer.stop();
      await this.orderExecutionService.cleanup();
      await this.marketDataService.cleanup();
      await this.solanaService.cleanup();
      await this.databaseService.cleanup();

      logger.info('✅ Bot shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error(`❌ Error during shutdown: ${getErrorMessage(error)}`);
      process.exit(1);
    }
  }
}

// Main execution
async function main(): Promise<void> {
  console.log(banner);
  
  logger.info('🌟 Starting Meteora DLMM Automation Bot...');
  logger.info(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 Solana RPC: ${config.solana.rpcUrl}`);
  logger.info(`💾 Database: ${config.database.url}`);
  logger.info(`🌐 API Port: ${config.api.port}`);
  
  const bot = new MeteoraDLMMBot();
  await bot.start();
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${getErrorMessage(error)}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${getErrorMessage(reason)}`);
  process.exit(1);
});

// Start the bot
if (require.main === module) {
  main().catch((error) => {
    logger.error(`❌ Fatal error: ${getErrorMessage(error)}`);
    process.exit(1);
  });
}