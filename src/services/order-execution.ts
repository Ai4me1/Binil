import DLMM, { StrategyType, autoFillYByStrategy } from '@meteora-ag/dlmm';
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import Big from 'big.js';
import { SolanaService } from './solana';
import { MarketDataService } from './market-data';
import { DatabaseService } from './database';
import { logger, logTrade } from '../utils/logger';
import { config } from '../config';
import { getErrorMessage } from '../utils/error';
import { 
  Position, 
  PositionStatus, 
  StrategyAction, 
  ActionType, 
  ExecutionResult, 
  ActionParameters 
} from '../types';

export class OrderExecutionService {
  private solanaService: SolanaService;
  private marketDataService: MarketDataService;
  private databaseService: DatabaseService;
  private connection: Connection;

  constructor(
    solanaService: SolanaService,
    marketDataService: MarketDataService,
    databaseService: DatabaseService
  ) {
    this.solanaService = solanaService;
    this.marketDataService = marketDataService;
    this.databaseService = databaseService;
    this.connection = solanaService.getConnection();
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing order execution service');
      // Service is ready to execute orders
      logger.info('Order execution service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize order execution service', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async executeAction(action: StrategyAction): Promise<ExecutionResult> {
    try {
      logger.info('Executing strategy action', { 
        type: action.type, 
        poolAddress: action.poolAddress,
        priority: action.priority 
      });

      switch (action.type) {
        case ActionType.CREATE_POSITION:
          return await this.createPosition(action);
        case ActionType.CLOSE_POSITION:
          return await this.closePosition(action);
        case ActionType.REBALANCE:
          return await this.rebalancePosition(action);
        case ActionType.COLLECT_FEES:
          return await this.collectFees(action);
        case ActionType.ADJUST_RANGE:
          return await this.adjustRange(action);
        case ActionType.EMERGENCY_EXIT:
          return await this.emergencyExit(action);
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }
    } catch (error) {
      logger.error('Failed to execute action', { 
        error: getErrorMessage(error), 
        action: action.type,
        poolAddress: action.poolAddress 
      });
      
      return {
        success: false,
        error: getErrorMessage(error)
      };
    }
  }

  private async createPosition(action: StrategyAction): Promise<ExecutionResult> {
    try {
      const { poolAddress, parameters } = action;
      const dlmm = this.marketDataService.getDLMMInstance(poolAddress);
      
      if (!dlmm) {
        throw new Error(`DLMM instance not found for pool: ${poolAddress}`);
      }

      // Refresh DLMM state
      await dlmm.refetchStates();
      
      // Get active bin
      const activeBin = await dlmm.getActiveBin();
      
      // Extract parameters
      const {
        liquidityAmount = new Big(1000), // Default $1000
        binRange = [activeBin.binId - 10, activeBin.binId + 10],
        strategyType = StrategyType.Spot,
        slippage = 0.01
      } = parameters;

      const [minBinId, maxBinId] = binRange;
      
      // Calculate token amounts
      const totalXAmount = new BN(liquidityAmount.mul(0.5).mul(Math.pow(10, dlmm.tokenX.mint.decimals)).toString());
      
      // Auto-fill Y amount based on strategy
      const totalYAmount = autoFillYByStrategy(
        activeBin.binId,
        dlmm.lbPair.binStep,
        totalXAmount,
        new BN(0), // activeBin.xAmount - would need to get from bin data
        new BN(0), // activeBin.yAmount - would need to get from bin data
        minBinId,
        maxBinId,
        strategyType
      );

      // Create new position keypair
      const newPosition = new Keypair();
      
      // Create position transaction
      const createPositionTx = await dlmm.initializePositionAndAddLiquidityByStrategy({
        positionPubKey: newPosition.publicKey,
        user: this.solanaService.getPublicKey(),
        totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId,
          minBinId,
          strategyType
        }
      });

      // Handle transaction array
      const transactions = Array.isArray(createPositionTx) ? createPositionTx : [createPositionTx];
      const signatures: string[] = [];

      for (const tx of transactions) {
        const signature = await sendAndConfirmTransaction(
          this.connection,
          tx,
          [this.solanaService.getWallet().payer, newPosition],
          { 
            skipPreflight: false, 
            preflightCommitment: 'confirmed' 
          }
        );
        signatures.push(signature);
      }

      // Create position object
      const position: Position = {
        id: newPosition.publicKey.toString(),
        poolAddress,
        strategy: strategyType.toString(),
        status: PositionStatus.ACTIVE,
        lowerBinId: minBinId,
        upperBinId: maxBinId,
        liquidityX: new Big(totalXAmount.toString()),
        liquidityY: new Big(totalYAmount.toString()),
        totalLiquidity: liquidityAmount,
        entryPrice: new Big(activeBin.price),
        currentPrice: new Big(activeBin.price),
        unrealizedPnl: new Big(0),
        realizedPnl: new Big(0),
        feesCollected: new Big(0),
        impermanentLoss: new Big(0),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Save position to database
      await this.databaseService.savePosition(position);

      logTrade('CREATE_POSITION', poolAddress, liquidityAmount.toString(), {
        positionId: position.id,
        binRange: [minBinId, maxBinId],
        strategyType,
        signatures
      });

      return {
        success: true,
        transactionId: signatures[0],
        newPosition: position,
        actualReturn: liquidityAmount
      };
    } catch (error) {
      logger.error('Failed to create position', { error: getErrorMessage(error) });
      throw error;
    }
  }

  private async closePosition(action: StrategyAction): Promise<ExecutionResult> {
    try {
      const { poolAddress, parameters } = action;
      const { positionId } = parameters;
      
      if (!positionId) {
        throw new Error('Position ID is required for close position action');
      }

      const dlmm = this.marketDataService.getDLMMInstance(poolAddress);
      if (!dlmm) {
        throw new Error(`DLMM instance not found for pool: ${poolAddress}`);
      }

      const position = await this.databaseService.getPosition(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      // Get user positions to find the actual position object
      const { userPositions } = await dlmm.getPositionsByUserAndLbPair(
        this.solanaService.getPublicKey()
      );

      const userPosition = userPositions.find(p => 
        p.publicKey.equals(new PublicKey(positionId))
      );

      if (!userPosition) {
        throw new Error(`User position not found: ${positionId}`);
      }

      // Close position transaction
      const closePositionTx = await dlmm.closePosition({
        owner: this.solanaService.getPublicKey(),
        position: userPosition
      });

      const signature = await sendAndConfirmTransaction(
        this.connection,
        closePositionTx,
        [this.solanaService.getWallet().payer],
        { 
          skipPreflight: false, 
          preflightCommitment: 'confirmed' 
        }
      );

      // Update position status
      position.status = PositionStatus.CLOSED;
      position.updatedAt = new Date();
      await this.databaseService.updatePosition(position);

      logTrade('CLOSE_POSITION', poolAddress, position.totalLiquidity.toString(), {
        positionId,
        signature
      });

      return {
        success: true,
        transactionId: signature,
        actualReturn: position.totalLiquidity
      };
    } catch (error) {
      logger.error('Failed to close position', { error: getErrorMessage(error) });
      throw error;
    }
  }

  private async rebalancePosition(action: StrategyAction): Promise<ExecutionResult> {
    try {
      const { poolAddress, parameters } = action;
      const { positionId } = parameters;
      
      if (!positionId) {
        throw new Error('Position ID is required for rebalance action');
      }

      const position = await this.databaseService.getPosition(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      // For rebalancing, we'll remove liquidity and add it back with new range
      // This is a simplified approach - in production, you might want more sophisticated rebalancing

      // First, remove current liquidity
      const removeResult = await this.executeAction({
        type: ActionType.CLOSE_POSITION,
        poolAddress,
        parameters: { positionId },
        priority: action.priority,
        estimatedGas: action.estimatedGas
      });

      if (!removeResult.success) {
        throw new Error(`Failed to remove liquidity for rebalancing: ${removeResult.error}`);
      }

      // Then create new position with updated range
      const createResult = await this.executeAction({
        type: ActionType.CREATE_POSITION,
        poolAddress,
        parameters: {
          liquidityAmount: position.totalLiquidity,
          ...parameters
        },
        priority: action.priority,
        estimatedGas: action.estimatedGas
      });

      if (!createResult.success) {
        throw new Error(`Failed to create new position for rebalancing: ${createResult.error}`);
      }

      // Update original position record
      position.lastRebalance = new Date();
      position.updatedAt = new Date();
      await this.databaseService.updatePosition(position);

      logTrade('REBALANCE', poolAddress, position.totalLiquidity.toString(), {
        oldPositionId: positionId,
        newPositionId: createResult.newPosition?.id,
        removeSignature: removeResult.transactionId,
        createSignature: createResult.transactionId
      });

      return {
        success: true,
        transactionId: createResult.transactionId,
        newPosition: createResult.newPosition,
        actualReturn: position.totalLiquidity
      };
    } catch (error) {
      logger.error('Failed to rebalance position', { error: getErrorMessage(error) });
      throw error;
    }
  }

  private async collectFees(action: StrategyAction): Promise<ExecutionResult> {
    try {
      const { poolAddress, parameters } = action;
      const { positionId } = parameters;

      const dlmm = this.marketDataService.getDLMMInstance(poolAddress);
      if (!dlmm) {
        throw new Error(`DLMM instance not found for pool: ${poolAddress}`);
      }

      let signatures: string[] = [];
      let totalFeesCollected = new Big(0);

      if (positionId) {
        // Collect fees for specific position
        const position = await this.databaseService.getPosition(positionId);
        if (!position) {
          throw new Error(`Position not found: ${positionId}`);
        }

        // Get user positions to find the actual position object
        const { userPositions } = await dlmm.getPositionsByUserAndLbPair(
          this.solanaService.getPublicKey()
        );

        const userPosition = userPositions.find(p => 
          p.publicKey.equals(new PublicKey(positionId))
        );

        if (!userPosition) {
          throw new Error(`User position not found: ${positionId}`);
        }

        const claimFeeTx = await dlmm.claimSwapFee({
          owner: this.solanaService.getPublicKey(),
          position: userPosition
        });

        if (claimFeeTx) {
          const signature = await sendAndConfirmTransaction(
            this.connection,
            claimFeeTx,
            [this.solanaService.getWallet().payer]
          );
          signatures.push(signature);
        }

        // Update position with collected fees (would need to calculate actual amount)
        position.feesCollected = position.feesCollected.add(new Big(100)); // Mock amount
        position.updatedAt = new Date();
        await this.databaseService.updatePosition(position);

        totalFeesCollected = new Big(100); // Mock amount
      } else {
        // Collect fees for all positions in the pool
        const { userPositions } = await dlmm.getPositionsByUserAndLbPair(
          this.solanaService.getPublicKey()
        );

        if (userPositions.length > 0) {
          const claimFeeTxs = await dlmm.claimAllSwapFee({
            owner: this.solanaService.getPublicKey(),
            positions: userPositions
          });

          for (const claimFeeTx of claimFeeTxs) {
            const signature = await sendAndConfirmTransaction(
              this.connection,
              claimFeeTx,
              [this.solanaService.getWallet().payer]
            );
            signatures.push(signature);
          }

          totalFeesCollected = new Big(userPositions.length * 100); // Mock calculation
        }
      }

      logTrade('COLLECT_FEES', poolAddress, totalFeesCollected.toString(), {
        positionId,
        signatures,
        feesCollected: totalFeesCollected.toString()
      });

      return {
        success: true,
        transactionId: signatures[0],
        actualReturn: totalFeesCollected
      };
    } catch (error) {
      logger.error('Failed to collect fees', { error: getErrorMessage(error) });
      throw error;
    }
  }

  private async adjustRange(action: StrategyAction): Promise<ExecutionResult> {
    try {
      const { poolAddress, parameters } = action;
      const { positionId, binRange } = parameters;
      
      if (!positionId || !binRange) {
        throw new Error('Position ID and bin range are required for adjust range action');
      }

      // For range adjustment, we'll use the rebalance mechanism with new range
      return await this.rebalancePosition({
        ...action,
        type: ActionType.REBALANCE,
        parameters: {
          ...parameters,
          binRange
        }
      });
    } catch (error) {
      logger.error('Failed to adjust range', { error: getErrorMessage(error) });
      throw error;
    }
  }

  private async emergencyExit(action: StrategyAction): Promise<ExecutionResult> {
    try {
      const { poolAddress, parameters } = action;
      const { positionId } = parameters;

      logger.warn('Executing emergency exit', { poolAddress, positionId });

      if (positionId) {
        // Emergency exit for specific position
        return await this.closePosition(action);
      } else {
        // Emergency exit for all positions in pool
        const positions = await this.databaseService.getPositionsByPool(poolAddress);
        const results: ExecutionResult[] = [];

        for (const position of positions) {
          if (position.status === PositionStatus.ACTIVE) {
            const result = await this.closePosition({
              ...action,
              parameters: { positionId: position.id }
            });
            results.push(result);
          }
        }

        const successCount = results.filter(r => r.success).length;
        const totalValue = results.reduce((sum, r) => 
          sum.add(r.actualReturn || new Big(0)), new Big(0)
        );

        logTrade('EMERGENCY_EXIT', poolAddress, totalValue.toString(), {
          positionsCount: positions.length,
          successCount,
          results: results.map(r => r.transactionId).filter(Boolean)
        });

        return {
          success: successCount === results.length,
          transactionId: results[0]?.transactionId,
          actualReturn: totalValue,
          error: successCount < results.length ? 'Some positions failed to close' : undefined
        };
      }
    } catch (error) {
      logger.error('Failed emergency exit', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async addLiquidityToPosition(
    positionId: string, 
    poolAddress: string, 
    amount: Big,
    strategyType: StrategyType = StrategyType.Spot
  ): Promise<ExecutionResult> {
    try {
      const dlmm = this.marketDataService.getDLMMInstance(poolAddress);
      if (!dlmm) {
        throw new Error(`DLMM instance not found for pool: ${poolAddress}`);
      }

      const position = await this.databaseService.getPosition(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      // Refresh DLMM state
      await dlmm.refetchStates();
      const activeBin = await dlmm.getActiveBin();

      // Calculate amounts
      const totalXAmount = new BN(amount.mul(0.5).mul(Math.pow(10, dlmm.tokenX.mint.decimals)).toString());
      const totalYAmount = autoFillYByStrategy(
        activeBin.binId,
        dlmm.lbPair.binStep,
        totalXAmount,
        new BN(0),
        new BN(0),
        position.lowerBinId,
        position.upperBinId,
        strategyType
      );

      // Add liquidity transaction
      const addLiquidityTx = await dlmm.addLiquidityByStrategy({
        positionPubKey: new PublicKey(positionId),
        user: this.solanaService.getPublicKey(),
        totalXAmount,
        totalYAmount,
        strategy: {
          maxBinId: position.upperBinId,
          minBinId: position.lowerBinId,
          strategyType
        }
      });

      const transactions = Array.isArray(addLiquidityTx) ? addLiquidityTx : [addLiquidityTx];
      const signatures: string[] = [];

      for (const tx of transactions) {
        const signature = await sendAndConfirmTransaction(
          this.connection,
          tx,
          [this.solanaService.getWallet().payer]
        );
        signatures.push(signature);
      }

      // Update position
      position.liquidityX = position.liquidityX.add(new Big(totalXAmount.toString()));
      position.liquidityY = position.liquidityY.add(new Big(totalYAmount.toString()));
      position.totalLiquidity = position.totalLiquidity.add(amount);
      position.updatedAt = new Date();
      await this.databaseService.updatePosition(position);

      logTrade('ADD_LIQUIDITY', poolAddress, amount.toString(), {
        positionId,
        signatures
      });

      return {
        success: true,
        transactionId: signatures[0],
        actualReturn: amount
      };
    } catch (error) {
      logger.error('Failed to add liquidity to position', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async removeLiquidityFromPosition(
    positionId: string,
    poolAddress: string,
    percentage: number = 100
  ): Promise<ExecutionResult> {
    try {
      const dlmm = this.marketDataService.getDLMMInstance(poolAddress);
      if (!dlmm) {
        throw new Error(`DLMM instance not found for pool: ${poolAddress}`);
      }

      const position = await this.databaseService.getPosition(positionId);
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      // Get user positions to find bin data
      const { userPositions } = await dlmm.getPositionsByUserAndLbPair(
        this.solanaService.getPublicKey()
      );

      const userPosition = userPositions.find(p => 
        p.publicKey.equals(new PublicKey(positionId))
      );

      if (!userPosition) {
        throw new Error(`User position not found: ${positionId}`);
      }

      const binIdsToRemove = userPosition.positionData.positionBinData.map(bin => bin.binId);
      const bpsToRemove = Math.floor(percentage * 100); // Convert percentage to basis points

      const removeLiquidityTx = await dlmm.removeLiquidity({
        position: new PublicKey(positionId),
        user: this.solanaService.getPublicKey(),
        fromBinId: binIdsToRemove[0],
        toBinId: binIdsToRemove[binIdsToRemove.length - 1],
        bps: new BN(bpsToRemove),
        shouldClaimAndClose: percentage >= 100
      });

      const transactions = Array.isArray(removeLiquidityTx) ? removeLiquidityTx : [removeLiquidityTx];
      const signatures: string[] = [];

      for (const tx of transactions) {
        const signature = await sendAndConfirmTransaction(
          this.connection,
          tx,
          [this.solanaService.getWallet().payer],
          { 
            skipPreflight: false, 
            preflightCommitment: 'confirmed' 
          }
        );
        signatures.push(signature);
      }

      // Update position
      const removedAmount = position.totalLiquidity.mul(percentage / 100);
      position.totalLiquidity = position.totalLiquidity.sub(removedAmount);
      position.liquidityX = position.liquidityX.mul((100 - percentage) / 100);
      position.liquidityY = position.liquidityY.mul((100 - percentage) / 100);
      
      if (percentage >= 100) {
        position.status = PositionStatus.CLOSED;
      }
      
      position.updatedAt = new Date();
      await this.databaseService.updatePosition(position);

      logTrade('REMOVE_LIQUIDITY', poolAddress, removedAmount.toString(), {
        positionId,
        percentage,
        signatures
      });

      return {
        success: true,
        transactionId: signatures[0],
        actualReturn: removedAmount
      };
    } catch (error) {
      logger.error('Failed to remove liquidity from position', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async close(): Promise<void> {
    logger.info('Order execution service closed');
  }

  async cleanup(): Promise<void> {
    await this.close();
  }
}