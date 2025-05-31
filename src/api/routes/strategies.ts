import { Router } from 'express';
import { strategyRegistry } from '../../strategies/registry';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../utils/error';

export const strategyRoutes = Router();

/**
 * Get all available strategies
 */
strategyRoutes.get('/', async (req, res) => {
  try {
    const strategies = strategyRegistry.getAll().map(strategy => ({
      name: strategy.name,
      description: strategy.description,
      riskLevel: strategy.riskLevel
    }));

    res.json({
      success: true,
      data: strategies
    });
  } catch (error) {
    logger.error(`Failed to get strategies: ${getErrorMessage(error)}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get strategies'
    });
  }
});

/**
 * Get specific strategy details
 */
strategyRoutes.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    if (!strategyRegistry.has(name)) {
      return res.status(404).json({
        success: false,
        error: `Strategy not found: ${name}`
      });
    }

    const strategy = strategyRegistry.get(name);
    
    return res.json({
      success: true,
      data: {
        name: strategy.name,
        description: strategy.description,
        riskLevel: strategy.riskLevel
      }
    });
  } catch (error) {
    logger.error(`Failed to get strategy: ${getErrorMessage(error)}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to get strategy'
    });
  }
});

/**
 * Activate a strategy
 */
strategyRoutes.post('/activate', async (req, res) => {
  try {
    const { strategy: strategyName, poolAddress, parameters } = req.body;

    if (!strategyName || !poolAddress) {
      return res.status(400).json({
        success: false,
        error: 'Strategy name and pool address are required'
      });
    }

    if (!strategyRegistry.has(strategyName)) {
      return res.status(404).json({
        success: false,
        error: `Strategy not found: ${strategyName}`
      });
    }

    // TODO: Implement actual strategy activation
    logger.info(`Activating strategy ${strategyName} for pool ${poolAddress}`, { parameters });

    return res.json({
      success: true,
      message: `Strategy ${strategyName} activated for pool ${poolAddress}`,
      data: {
        strategy: strategyName,
        poolAddress,
        parameters,
        activatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Failed to activate strategy: ${getErrorMessage(error)}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to activate strategy'
    });
  }
});

/**
 * Deactivate a strategy
 */
strategyRoutes.post('/deactivate', async (req, res) => {
  try {
    const { strategy: strategyName, poolAddress } = req.body;

    if (!strategyName || !poolAddress) {
      return res.status(400).json({
        success: false,
        error: 'Strategy name and pool address are required'
      });
    }

    // TODO: Implement actual strategy deactivation
    logger.info(`Deactivating strategy ${strategyName} for pool ${poolAddress}`);

    return res.json({
      success: true,
      message: `Strategy ${strategyName} deactivated for pool ${poolAddress}`,
      data: {
        strategy: strategyName,
        poolAddress,
        deactivatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error(`Failed to deactivate strategy: ${getErrorMessage(error)}`);
    return res.status(500).json({
      success: false,
      error: 'Failed to deactivate strategy'
    });
  }
});

/**
 * Get active strategies
 */
strategyRoutes.get('/active/list', async (req, res) => {
  try {
    // TODO: Implement actual active strategy tracking
    const activeStrategies = []; // Placeholder

    res.json({
      success: true,
      data: activeStrategies
    });
  } catch (error) {
    logger.error(`Failed to get active strategies: ${getErrorMessage(error)}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get active strategies'
    });
  }
});