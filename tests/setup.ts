// Jest setup file for Meteora DLMM Automation Bot
import 'reflect-metadata';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
process.env.SOLANA_PRIVATE_KEY = 'test_private_key_placeholder_that_is_long_enough_for_validation';
process.env.DATABASE_URL = ':memory:';
process.env.API_SECRET = 'test_secret_key_for_testing_purposes_only';
process.env.TARGET_POOLS = '';

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test timeout
jest.setTimeout(30000);