import request from 'supertest';
import { ApiServer } from '../../src/api';

// Mock the config module
jest.mock('../../src/config', () => ({
  config: {
    api: {
      port: 3000,
      secret: 'test-secret',
      corsOrigins: ['http://localhost:3000']
    },
    solana: {
      rpcUrl: 'https://api.devnet.solana.com',
      privateKey: 'test-key'
    },
    database: {
      url: ':memory:'
    },
    monitoring: {
      logLevel: 'info'
    },
    performance: {
      targetApy: 15
    },
    risk: {
      maxPositionSize: 50000,
      maxPortfolioSize: 500000,
      maxVolatility: 0.5,
      maxDrawdown: 0.2,
      maxConcentration: 0.25,
      ilThresholds: {
        warning: 0.02,
        action: 0.05,
        critical: 0.1,
        emergency: 0.2
      }
    },
    pools: {
      targets: []
    }
  }
}));

describe('API Integration Tests', () => {
  let apiServer: ApiServer;
  let app: any;

  beforeAll(async () => {
    // Set test environment variables
    process.env.NODE_ENV = 'test';
    
    apiServer = new ApiServer();
    app = apiServer.getApp();
  });

  afterAll(async () => {
    if (apiServer) {
      await apiServer.stop();
    }
  });

  describe('Health Endpoints', () => {
    it('should return health status from root endpoint', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.timestamp).toBeDefined();
    });

    it('should return system status', async () => {
      const response = await request(app)
        .get('/api/health/status')
        .set('x-api-key', 'test-secret')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.api).toBe('healthy');
      expect(response.body.data.timestamp).toBeDefined();
    });
  });

  describe('Strategy Endpoints', () => {
    it('should return available strategies', async () => {
      const response = await request(app)
        .get('/api/strategies')
        .set('x-api-key', 'test-secret')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return specific strategy details', async () => {
      const response = await request(app)
        .get('/api/strategies/balanced_liquidity')
        .set('x-api-key', 'test-secret')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Strategy not found: balanced_liquidity');
    });

    it('should handle strategy activation', async () => {
      const response = await request(app)
        .post('/api/strategies/activate')
        .set('x-api-key', 'test-secret')
        .send({
          strategy: 'balanced_liquidity',
          poolAddress: 'test-pool-address',
          parameters: { maxPositionSize: 1000 }
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Strategy not found: balanced_liquidity');
    });
  });

  describe('Position Endpoints', () => {
    it('should return positions list', async () => {
      const response = await request(app)
        .get('/api/positions')
        .set('x-api-key', 'test-secret')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should handle position closure', async () => {
      const response = await request(app)
        .post('/api/positions/test-position/close')
        .set('x-api-key', 'test-secret')
        .send({ percentage: 50 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('closed');
    });
  });

  describe('Risk Endpoints', () => {
    it('should return risk summary', async () => {
      const response = await request(app)
        .get('/api/risk/summary')
        .set('x-api-key', 'test-secret')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.portfolioRisk).toBeDefined();
      expect(response.body.data.calculatedAt).toBeDefined();
    });

    it('should return IL summary', async () => {
      const response = await request(app)
        .get('/api/risk/il/summary')
        .set('x-api-key', 'test-secret')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalIL).toBeDefined();
    });

    it('should handle emergency stop', async () => {
      const response = await request(app)
        .post('/api/risk/emergency/stop')
        .set('x-api-key', 'test-secret')
        .send({ reason: 'Test emergency stop' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Emergency stop initiated');
    });
  });

  describe('Metrics Endpoints', () => {
    it('should return performance metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/performance')
        .set('x-api-key', 'test-secret')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.portfolio).toBeDefined();
      expect(response.body.data.calculatedAt).toBeDefined();
    });

    it('should return system metrics', async () => {
      const response = await request(app)
        .get('/api/metrics/system')
        .set('x-api-key', 'test-secret')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.uptime).toBeDefined();
      expect(response.body.data.memory).toBeDefined();
    });
  });

  describe('Authentication', () => {
    it('should reject requests without API key', async () => {
      const response = await request(app)
        .get('/api/strategies')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Unauthorized');
    });

    it('should reject requests with invalid API key', async () => {
      const response = await request(app)
        .get('/api/strategies')
        .set('x-api-key', 'invalid-key')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Unauthorized');
    });

    it('should allow health checks without API key', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      const response = await request(app)
        .get('/api/nonexistent')
        .set('x-api-key', 'test-secret')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Endpoint not found');
    });

    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/strategies/activate')
        .set('x-api-key', 'test-secret')
        .send({}) // Missing required fields
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('required');
    });
  });
});