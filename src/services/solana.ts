import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/error';

export class SolanaService {
  private connection: Connection;
  private wallet: Wallet;
  private provider: AnchorProvider;

  constructor() {
    this.connection = new Connection(config.solana.rpcUrl, 'confirmed');
    
    // Create wallet from private key
    const secretKey = bs58.decode(config.solana.privateKey);
    const keypair = Keypair.fromSecretKey(secretKey);
    this.wallet = new Wallet(keypair);
    
    // Create provider
    this.provider = new AnchorProvider(this.connection, this.wallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      const version = await this.connection.getVersion();
      logger.info('Connected to Solana', {
        rpcUrl: config.solana.rpcUrl,
        version: version['solana-core'],
        publicKey: this.wallet.publicKey.toString()
      });

      // Check wallet balance
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      logger.info('Wallet balance', {
        balance: balance / 1e9, // Convert lamports to SOL
        publicKey: this.wallet.publicKey.toString()
      });

      if (balance < 1e8) { // Less than 0.1 SOL
        logger.warn('Low wallet balance detected', {
          balance: balance / 1e9,
          recommendation: 'Consider adding more SOL for transaction fees'
        });
      }
    } catch (error) {
      logger.error('Failed to initialize Solana service', { error: getErrorMessage(error) });
      throw error;
    }
  }

  getConnection(): Connection {
    return this.connection;
  }

  getWallet(): Wallet {
    return this.wallet;
  }

  getProvider(): AnchorProvider {
    return this.provider;
  }

  getPublicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  async getBalance(): Promise<number> {
    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      logger.error('Failed to get wallet balance', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async sendTransaction(transaction: Transaction): Promise<string> {
    try {
      // Set recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;

      // Sign and send transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet.payer],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed',
        }
      );

      logger.info('Transaction sent successfully', {
        signature,
        publicKey: this.wallet.publicKey.toString()
      });

      return signature;
    } catch (error) {
      logger.error('Failed to send transaction', {
        error: getErrorMessage(error),
        publicKey: this.wallet.publicKey.toString()
      });
      throw error;
    }
  }

  async simulateTransaction(transaction: Transaction): Promise<any> {
    try {
      // Set recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;

      // Simulate transaction
      const result = await this.connection.simulateTransaction(transaction);
      
      if (result.value.err) {
        throw new Error(`Transaction simulation failed: ${JSON.stringify(result.value.err)}`);
      }

      return result.value;
    } catch (error) {
      logger.error('Failed to simulate transaction', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async getTokenBalance(tokenMint: PublicKey): Promise<number> {
    try {
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: tokenMint }
      );

      if (tokenAccounts.value.length === 0) {
        return 0;
      }

      const tokenAccount = tokenAccounts.value[0];
      const accountInfo = await this.connection.getTokenAccountBalance(tokenAccount.pubkey);
      
      return parseFloat(String(accountInfo.value.uiAmount || '0'));
    } catch (error) {
      logger.error('Failed to get token balance', {
        error: getErrorMessage(error),
        tokenMint: tokenMint.toString()
      });
      throw error;
    }
  }

  async getTokenAccountAddress(tokenMint: PublicKey): Promise<PublicKey | null> {
    try {
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        this.wallet.publicKey,
        { mint: tokenMint }
      );

      if (tokenAccounts.value.length === 0) {
        return null;
      }

      return tokenAccounts.value[0].pubkey;
    } catch (error) {
      logger.error('Failed to get token account address', {
        error: getErrorMessage(error),
        tokenMint: tokenMint.toString()
      });
      throw error;
    }
  }

  async waitForConfirmation(signature: string, timeout: number = 60000): Promise<boolean> {
    try {
      const start = Date.now();
      
      while (Date.now() - start < timeout) {
        const status = await this.connection.getSignatureStatus(signature);
        
        if (status.value?.confirmationStatus === 'confirmed' || 
            status.value?.confirmationStatus === 'finalized') {
          return true;
        }
        
        if (status.value?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        }
        
        // Wait 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      throw new Error('Transaction confirmation timeout');
    } catch (error) {
      logger.error('Failed to wait for transaction confirmation', {
        error: getErrorMessage(error),
        signature
      });
      throw error;
    }
  }

  async getRecentPerformanceSamples(): Promise<any[]> {
    try {
      const samples = await this.connection.getRecentPerformanceSamples(10);
      return samples;
    } catch (error) {
      logger.error('Failed to get performance samples', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async getSlot(): Promise<number> {
    try {
      return await this.connection.getSlot();
    } catch (error) {
      logger.error('Failed to get current slot', { error: getErrorMessage(error) });
      throw error;
    }
  }

  async getBlockTime(slot: number): Promise<number | null> {
    try {
      return await this.connection.getBlockTime(slot);
    } catch (error) {
      logger.error('Failed to get block time', { error: getErrorMessage(error), slot });
      throw error;
    }
  }

  async getHealth(): Promise<string> {
    try {
      // Try to get recent blockhash as a health check
      await this.connection.getLatestBlockhash();
      return 'healthy';
    } catch (error) {
      logger.error('Solana health check failed', { error: getErrorMessage(error) });
      return 'unhealthy';
    }
  }

  async estimateTransactionFee(transaction: Transaction): Promise<number> {
    try {
      // Set recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.wallet.publicKey;

      // Get fee for transaction
      const fee = await this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      );

      return fee.value || 5000; // Default to 5000 lamports if unable to estimate
    } catch (error) {
      logger.error('Failed to estimate transaction fee', { error: getErrorMessage(error) });
      return 5000; // Default fee
    }
  }

  // Utility methods
  isValidPublicKey(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  createPublicKey(address: string): PublicKey {
    try {
      return new PublicKey(address);
    } catch (error) {
      throw new Error(`Invalid public key: ${address}`);
    }
  }

  async airdropSol(amount: number): Promise<string> {
    try {
      const signature = await this.connection.requestAirdrop(
        this.wallet.publicKey,
        amount * 1e9 // Convert SOL to lamports
      );

      await this.waitForConfirmation(signature);
      
      logger.info('Airdrop successful', {
        amount,
        signature,
        publicKey: this.wallet.publicKey.toString()
      });

      return signature;
    } catch (error) {
      logger.error('Failed to airdrop SOL', {
        error: getErrorMessage(error),
        amount,
        publicKey: this.wallet.publicKey.toString()
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    // No explicit cleanup needed for Solana connection
    logger.info('Solana service closed');
  }

  async cleanup(): Promise<void> {
    await this.close();
  }
}