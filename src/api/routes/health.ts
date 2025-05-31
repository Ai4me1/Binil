import { Router } from 'express';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/error';

export const healthRoutes = Router();

/**
 * Health check endpoint
 */
healthRoutes.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error(`Health check failed: ${getErrorMessage(error)}`);
    res.status(500).json({
      success: false,
      error: 'Health check failed'
    });
  }
});

/**
 * Detailed system status
 */
healthRoutes.get('/status', async (req, res) => {
  try {
    const status = {
      api: 'healthy',
      database: 'healthy', // TODO: Add actual database health check
      solana: 'healthy',   // TODO: Add actual Solana connection check
      strategies: 'healthy', // TODO: Add strategy health check
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error(`Status check failed: ${getErrorMessage(error)}`);
    res.status(500).json({
      success: false,
      error: 'Status check failed'
    });
  }
});