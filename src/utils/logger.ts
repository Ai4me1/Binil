import winston from 'winston';
import { config } from '../config';
import { getErrorMessage } from './error';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta
    });
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: config.monitoring.logLevel,
  format: logFormat,
  defaultMeta: { service: 'meteora-dlmm-bot' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Performance logging helper
export const logPerformance = (operation: string, duration: number, metadata?: any) => {
  logger.info('Performance metric', {
    operation,
    duration,
    ...metadata
  });
};

// Trade logging helper
export const logTrade = (action: string, poolAddress: string, amount: string, metadata?: any) => {
  logger.info('Trade executed', {
    action,
    poolAddress,
    amount,
    ...metadata
  });
};

// Risk logging helper
export const logRisk = (level: string, message: string, metadata?: any) => {
  logger.warn('Risk alert', {
    level,
    message,
    ...metadata
  });
};

// Error logging helper
export const logError = (error: Error, context?: string, metadata?: any) => {
  logger.error('Error occurred', {
    error: getErrorMessage(error),
    stack: error.stack,
    context,
    ...metadata
  });
};

// Create logs directory if it doesn't exist
import { mkdirSync } from 'fs';
try {
  mkdirSync('logs', { recursive: true });
} catch (error) {
  // Directory already exists or permission error
}

export default logger;