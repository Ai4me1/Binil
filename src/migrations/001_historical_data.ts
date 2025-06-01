import Database from 'better-sqlite3';
import { logger } from '../utils/logger';

export async function up(db: Database.Database): Promise<void> {
  try {
    // Create historical data points table
    db.exec(`
      CREATE TABLE IF NOT EXISTS historical_data_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pool_address TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        price TEXT NOT NULL,
        volume TEXT NOT NULL,
        fees TEXT NOT NULL,
        liquidity_x TEXT NOT NULL,
        liquidity_y TEXT NOT NULL,
        bin_id INTEGER NOT NULL,
        timeframe TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create indexes for efficient querying
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_historical_data_pool_timestamp 
      ON historical_data_points(pool_address, timestamp);

      CREATE INDEX IF NOT EXISTS idx_historical_data_timeframe 
      ON historical_data_points(timeframe);
    `);

    logger.info('Historical data migration completed successfully');
  } catch (error) {
    logger.error('Failed to run historical data migration', { error });
    throw error;
  }
}
