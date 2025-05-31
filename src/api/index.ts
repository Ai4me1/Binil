import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/error';

// Import route handlers
import { healthRoutes } from './routes/health';
import { strategyRoutes } from './routes/strategies';
import { positionRoutes } from './routes/positions';
import { riskRoutes } from './routes/risk';
import { metricsRoutes } from './routes/metrics';

export class ApiServer {
  private app: express.Application;
  private server: any;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
      next();
    });

    // API key authentication for protected routes
    this.app.use('/api', (req, res, next) => {
      // Skip auth for health checks
      if (req.path === '/health') {
        return next();
      }

      const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
      
      if (!apiKey || apiKey !== config.api.secret) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid or missing API key'
        });
      }

      next();
    });
  }

  private setupRoutes(): void {
    // Mount route handlers
    this.app.use('/api/health', healthRoutes);
    this.app.use('/api/strategies', strategyRoutes);
    this.app.use('/api/positions', positionRoutes);
    this.app.use('/api/risk', riskRoutes);
    this.app.use('/api/metrics', metricsRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Meteora DLMM Automation Bot API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('API Error:', {
        error: getErrorMessage(error),
        path: req.path,
        method: req.method,
        ip: req.ip,
        stack: error.stack
      });

      res.status(error.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : getErrorMessage(error),
        timestamp: new Date().toISOString()
      });
    });
  }

  public async start(): Promise<void> {
    try {
      this.server = this.app.listen(config.api.port, '0.0.0.0', () => {
        logger.info(`API server started on port ${config.api.port}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.stop());
      process.on('SIGINT', () => this.stop());

    } catch (error) {
      logger.error(`Failed to start API server: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.server) {
      logger.info('Shutting down API server...');
      this.server.close();
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

export default ApiServer;