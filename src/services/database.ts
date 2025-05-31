import 'reflect-metadata';
import { DataSource, Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Repository } from 'typeorm';
import { config } from '../config';
import { logger } from '../utils/logger';
import { DbPosition, DbTransaction, DbPerformance, Position, PositionStatus } from '../types';
import { getErrorMessage } from '../utils/error';
import Big from 'big.js';

// Database Entities
@Entity('positions')
export class PositionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  poolAddress: string;

  @Column()
  strategy: string;

  @Column()
  status: string;

  @Column()
  lowerBinId: number;

  @Column()
  upperBinId: number;

  @Column('text')
  liquidityX: string;

  @Column('text')
  liquidityY: string;

  @Column('text')
  totalLiquidity: string;

  @Column('text')
  entryPrice: string;

  @Column('text')
  currentPrice: string;

  @Column('text')
  unrealizedPnl: string;

  @Column('text')
  realizedPnl: string;

  @Column('text')
  feesCollected: string;

  @Column('text')
  impermanentLoss: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  lastRebalance?: Date;
}

@Entity('transactions')
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  positionId: string;

  @Column()
  type: string;

  @Column('text')
  amount: string;

  @Column('text')
  price: string;

  @Column('text')
  fees: string;

  @Column()
  gasUsed: number;

  @Column()
  transactionId: string;

  @CreateDateColumn()
  timestamp: Date;
}

@Entity('performance')
export class PerformanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  date: Date;

  @Column('text')
  portfolioValue: string;

  @Column('text')
  totalPnl: string;

  @Column('text')
  feesEarned: string;

  @Column('text')
  impermanentLoss: string;

  @Column()
  activePositions: number;

  @Column('text')
  dailyReturn: string;
}

@Entity('risk_alerts')
export class RiskAlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  level: string;

  @Column()
  type: string;

  @Column('text')
  message: string;

  @Column({ nullable: true })
  positionId?: string;

  @Column({ nullable: true })
  poolAddress?: string;

  @CreateDateColumn()
  timestamp: Date;

  @Column({ default: false })
  acknowledged: boolean;
}

// Database Service
export class DatabaseService {
  private dataSource: DataSource;
  private positionRepository: Repository<PositionEntity>;
  private transactionRepository: Repository<TransactionEntity>;
  private performanceRepository: Repository<PerformanceEntity>;
  private riskAlertRepository: Repository<RiskAlertEntity>;

  constructor() {
    this.dataSource = new DataSource({
      type: 'sqlite',
      database: config.database.url,
      entities: [PositionEntity, TransactionEntity, PerformanceEntity, RiskAlertEntity],
      synchronize: true,
      logging: config.monitoring.logLevel === 'debug',
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.dataSource.initialize();
      
      this.positionRepository = this.dataSource.getRepository(PositionEntity);
      this.transactionRepository = this.dataSource.getRepository(TransactionEntity);
      this.performanceRepository = this.dataSource.getRepository(PerformanceEntity);
      this.riskAlertRepository = this.dataSource.getRepository(RiskAlertEntity);
      
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
      logger.info('Database connection closed');
    }
  }

  async cleanup(): Promise<void> {
    await this.close();
  }

  // Position operations
  async savePosition(position: Position): Promise<void> {
    try {
      const entity = this.convertPositionToEntity(position);
      await this.positionRepository.save(entity);
      logger.debug('Position saved', { positionId: position.id });
    } catch (error) {
      logger.error('Failed to save position', { error: getErrorMessage(error), positionId: position.id });
      throw error;
    }
  }

  async getPosition(id: string): Promise<Position | null> {
    try {
      const entity = await this.positionRepository.findOne({ where: { id } });
      return entity ? this.convertEntityToPosition(entity) : null;
    } catch (error) {
      logger.error('Failed to get position', { error: getErrorMessage(error), positionId: id });
      throw error;
    }
  }

  async getActivePositions(): Promise<Position[]> {
    try {
      const entities = await this.positionRepository.find({
        where: { status: PositionStatus.ACTIVE }
      });
      return entities.map(entity => this.convertEntityToPosition(entity));
    } catch (error) {
      logger.error('Failed to get active positions', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async getPositionsByPool(poolAddress: string): Promise<Position[]> {
    try {
      const entities = await this.positionRepository.find({
        where: { poolAddress }
      });
      return entities.map(entity => this.convertEntityToPosition(entity));
    } catch (error) {
      logger.error('Failed to get positions by pool', { error: getErrorMessage(error), poolAddress });
      throw error;
    }
  }

  async updatePosition(position: Position): Promise<void> {
    try {
      const entity = this.convertPositionToEntity(position);
      await this.positionRepository.save(entity);
      logger.debug('Position updated', { positionId: position.id });
    } catch (error) {
      logger.error('Failed to update position', { error: getErrorMessage(error), positionId: position.id });
      throw error;
    }
  }

  async deletePosition(id: string): Promise<void> {
    try {
      await this.positionRepository.delete(id);
      logger.debug('Position deleted', { positionId: id });
    } catch (error) {
      logger.error('Failed to delete position', { error: getErrorMessage(error), positionId: id });
      throw error;
    }
  }

  // Transaction operations
  async saveTransaction(transaction: DbTransaction): Promise<void> {
    try {
      const entity = this.transactionRepository.create(transaction);
      await this.transactionRepository.save(entity);
      logger.debug('Transaction saved', { transactionId: transaction.id });
    } catch (error) {
      logger.error('Failed to save transaction', { error: getErrorMessage(error), transactionId: transaction.id });
      throw error;
    }
  }

  async getTransactionsByPosition(positionId: string): Promise<DbTransaction[]> {
    try {
      const entities = await this.transactionRepository.find({
        where: { positionId },
        order: { timestamp: 'DESC' }
      });
      return entities;
    } catch (error) {
      logger.error('Failed to get transactions by position', { error: getErrorMessage(error), positionId });
      throw error;
    }
  }

  // Performance operations
  async savePerformance(performance: DbPerformance): Promise<void> {
    try {
      const entity = this.performanceRepository.create(performance);
      await this.performanceRepository.save(entity);
      logger.debug('Performance data saved', { date: performance.date });
    } catch (error) {
      logger.error('Failed to save performance data', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async getPerformanceHistory(days: number = 30): Promise<DbPerformance[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const entities = await this.performanceRepository.find({
        where: {
          date: startDate as any // TypeORM date comparison
        },
        order: { date: 'ASC' }
      });
      return entities;
    } catch (error) {
      logger.error('Failed to get performance history', { error: getErrorMessage(error), days });
      throw error;
    }
  }

  // Risk alert operations
  async saveRiskAlert(alert: any): Promise<void> {
    try {
      const entity = this.riskAlertRepository.create({
        level: alert.level,
        type: alert.type,
        message: alert.message,
        positionId: alert.positionId,
        poolAddress: alert.poolAddress,
        acknowledged: alert.acknowledged || false
      });
      await this.riskAlertRepository.save(entity);
      logger.debug('Risk alert saved', { alertId: entity.id });
    } catch (error) {
      logger.error('Failed to save risk alert', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async getUnacknowledgedAlerts(): Promise<any[]> {
    try {
      const entities = await this.riskAlertRepository.find({
        where: { acknowledged: false },
        order: { timestamp: 'DESC' }
      });
      return entities;
    } catch (error) {
      logger.error('Failed to get unacknowledged alerts', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async acknowledgeAlert(alertId: string): Promise<void> {
    try {
      await this.riskAlertRepository.update(alertId, { acknowledged: true });
      logger.debug('Risk alert acknowledged', { alertId });
    } catch (error) {
      logger.error('Failed to acknowledge alert', { error: getErrorMessage(error), alertId });
      throw error;
    }
  }

  // Utility methods for conversion
  private convertPositionToEntity(position: Position): PositionEntity {
    const entity = new PositionEntity();
    entity.id = position.id;
    entity.poolAddress = position.poolAddress;
    entity.strategy = position.strategy;
    entity.status = position.status;
    entity.lowerBinId = position.lowerBinId;
    entity.upperBinId = position.upperBinId;
    entity.liquidityX = position.liquidityX.toString();
    entity.liquidityY = position.liquidityY.toString();
    entity.totalLiquidity = position.totalLiquidity.toString();
    entity.entryPrice = position.entryPrice.toString();
    entity.currentPrice = position.currentPrice.toString();
    entity.unrealizedPnl = position.unrealizedPnl.toString();
    entity.realizedPnl = position.realizedPnl.toString();
    entity.feesCollected = position.feesCollected.toString();
    entity.impermanentLoss = position.impermanentLoss.toString();
    entity.createdAt = position.createdAt;
    entity.updatedAt = position.updatedAt;
    entity.lastRebalance = position.lastRebalance;
    return entity;
  }

  private convertEntityToPosition(entity: PositionEntity): Position {
    return {
      id: entity.id,
      poolAddress: entity.poolAddress,
      strategy: entity.strategy,
      status: entity.status as PositionStatus,
      lowerBinId: entity.lowerBinId,
      upperBinId: entity.upperBinId,
      liquidityX: new Big(entity.liquidityX),
      liquidityY: new Big(entity.liquidityY),
      totalLiquidity: new Big(entity.totalLiquidity),
      entryPrice: new Big(entity.entryPrice),
      currentPrice: new Big(entity.currentPrice),
      unrealizedPnl: new Big(entity.unrealizedPnl),
      realizedPnl: new Big(entity.realizedPnl),
      feesCollected: new Big(entity.feesCollected),
      impermanentLoss: new Big(entity.impermanentLoss),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      lastRebalance: entity.lastRebalance
    };
  }

  // Analytics queries
  async getPortfolioValue(): Promise<Big> {
    try {
      const positions = await this.getActivePositions();
      let totalValue = new Big(0);
      
      for (const position of positions) {
        totalValue = totalValue.add(position.totalLiquidity);
      }
      
      return totalValue;
    } catch (error) {
      logger.error('Failed to calculate portfolio value', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async getTotalPnL(): Promise<Big> {
    try {
      const positions = await this.getActivePositions();
      let totalPnL = new Big(0);
      
      for (const position of positions) {
        totalPnL = totalPnL.add(position.unrealizedPnl).add(position.realizedPnl);
      }
      
      return totalPnL;
    } catch (error) {
      logger.error('Failed to calculate total PnL', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async getTotalFeesCollected(): Promise<Big> {
    try {
      const positions = await this.getActivePositions();
      let totalFees = new Big(0);
      
      for (const position of positions) {
        totalFees = totalFees.add(position.feesCollected);
      }
      
      return totalFees;
    } catch (error) {
      logger.error('Failed to calculate total fees collected', { error: getErrorMessage(error) });
      throw error;
    }
  }
}