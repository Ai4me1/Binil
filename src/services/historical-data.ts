import Database from 'better-sqlite3';
import { Big } from 'big.js';
import { logger } from '../utils/logger';
import { config } from '../config';
import { HistoricalDataPoint, TimeFrame } from '../types';

export class HistoricalDataService {
  private db: Database.Database;
  
  constructor() {
    this.db = new Database(config.database.path);
    this.db.pragma('journal_mode = WAL');
  }

  async initialize(): Promise<void> {
    try {
      // Run migrations if needed
      const migrations = await import('../migrations/001_historical_data');
      await migrations.up(this.db);
      logger.info('Historical data service initialized');
    } catch (error) {
      logger.error('Failed to initialize historical data service', { error });
      throw error;
    }
  }

  async addDataPoint(
    poolAddress: string,
    dataPoint: HistoricalDataPoint,
    timeframe: TimeFrame
  ): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO historical_data_points (
          pool_address, timestamp, price, volume, fees,
          liquidity_x, liquidity_y, bin_id, timeframe
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        poolAddress,
        dataPoint.timestamp.getTime(),
        dataPoint.price.toString(),
        dataPoint.volume.toString(),
        dataPoint.fees.toString(),
        dataPoint.liquidityX.toString(),
        dataPoint.liquidityY.toString(),
        dataPoint.binId,
        timeframe
      );
    } catch (error) {
      logger.error('Failed to add historical data point', { error, poolAddress });
      throw error;
    }
  }

  async getHistoricalData(
    poolAddress: string,
    timeframe: TimeFrame,
    startTime: Date,
    endTime: Date
  ): Promise<HistoricalDataPoint[]> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM historical_data_points
        WHERE pool_address = ?
        AND timeframe = ?
        AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
      `);

      const rows = stmt.all(
        poolAddress,
        timeframe,
        startTime.getTime(),
        endTime.getTime()
      );

      return rows.map(row => ({
        timestamp: new Date(row.timestamp),
        price: new Big(row.price),
        volume: new Big(row.volume),
        fees: new Big(row.fees),
        liquidityX: new Big(row.liquidity_x),
        liquidityY: new Big(row.liquidity_y),
        binId: row.bin_id
      }));
    } catch (error) {
      logger.error('Failed to get historical data', { error, poolAddress, timeframe });
      throw error;
    }
  }

  async getLast24HourData(poolAddress: string): Promise<{
    volume: Big;
    fees: Big;
    priceHistory: Big[];
  }> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Get hourly price data for volatility calculation
      const priceStmt = this.db.prepare(`
        SELECT price
        FROM historical_data_points
        WHERE pool_address = ?
        AND timestamp >= ?
        AND timeframe = 'hourly'
        ORDER BY timestamp ASC
      `);
      
      const priceRows = priceStmt.all(poolAddress, oneDayAgo.getTime());
      const priceHistory = priceRows.map(row => new Big(row.price));

      // Get aggregated volume and fees
      const stmt = this.db.prepare(`
        SELECT 
          COALESCE(SUM(CAST(volume AS DECIMAL)), 0) as total_volume,
          COALESCE(SUM(CAST(fees AS DECIMAL)), 0) as total_fees
        FROM historical_data_points
        WHERE pool_address = ?
        AND timestamp >= ?
        AND timeframe = 'hourly'
      `);

      const { total_volume, total_fees } = stmt.get(poolAddress, oneDayAgo.getTime()) as { 
        total_volume: string;
        total_fees: string;
      } || { total_volume: '0', total_fees: '0' };

      return {
        volume: new Big(total_volume),
        fees: new Big(total_fees),
        priceHistory
      }; 
          SUM(CAST(volume AS DECIMAL)) as total_volume,
          SUM(CAST(fees AS DECIMAL)) as total_fees
        FROM historical_data_points
        WHERE pool_address = ?
        AND timestamp >= ?
        AND timeframe = 'hourly'
      `);

      const row = stmt.get(poolAddress, oneDayAgo.getTime());
      
      return {
        volume: new Big(row?.total_volume || 0),
        fees: new Big(row?.total_fees || 0)
      };
    } catch (error) {
      logger.error('Failed to get 24h data', { error, poolAddress });
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      // Remove data older than retention period
      const retentionPeriod = 90 * 24 * 60 * 60 * 1000; // 90 days
      const cutoff = Date.now() - retentionPeriod;

      const stmt = this.db.prepare(`
        DELETE FROM historical_data_points
        WHERE timestamp < ?
      `);

      stmt.run(cutoff);

      // Optimize database
      this.db.pragma('optimize');
      logger.info('Historical data cleanup completed');
    } catch (error) {
      logger.error('Failed to cleanup historical data', { error });
      throw error;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
