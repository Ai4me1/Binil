import { percentageChange, calculateVolatility, formatCurrency, formatPercentage } from '../../src/utils/math';
import { getErrorMessage } from '../../src/utils/error';
import Big from 'big.js';

describe('Math Utilities', () => {
  describe('percentageChange', () => {
    it('should calculate positive percentage change', () => {
      const result = percentageChange(new Big(100), new Big(120));
      expect(result.toNumber()).toBe(20);
    });

    it('should calculate negative percentage change', () => {
      const result = percentageChange(new Big(120), new Big(100));
      expect(result.toNumber()).toBeCloseTo(-16.67, 1);
    });

    it('should handle zero old value', () => {
      const result = percentageChange(new Big(0), new Big(100));
      expect(result.toNumber()).toBe(0);
    });
  });

  describe('calculateVolatility', () => {
    it('should calculate volatility for price series', () => {
      const prices = [new Big(100), new Big(105), new Big(95), new Big(110), new Big(90)];
      const volatility = calculateVolatility(prices);
      expect(volatility.toNumber()).toBeGreaterThan(0);
    });

    it('should return zero for single price', () => {
      const prices = [new Big(100)];
      const volatility = calculateVolatility(prices);
      expect(volatility.toNumber()).toBe(0);
    });
  });

  describe('formatCurrency', () => {
    it('should format currency with default decimals', () => {
      const result = formatCurrency(new Big(1234.5678));
      expect(result).toBe('$1234.57');
    });

    it('should format currency with custom decimals', () => {
      const result = formatCurrency(new Big(1234.5678), 4);
      expect(result).toBe('$1234.5678');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage', () => {
      const result = formatPercentage(new Big(0.1234));
      expect(result).toBe('12.34%');
    });

    it('should format percentage with custom decimals', () => {
      const result = formatPercentage(new Big(0.1234), 1);
      expect(result).toBe('12.3%');
    });
  });
});

describe('Error Utilities', () => {
  describe('getErrorMessage', () => {
    it('should extract message from Error object', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('should handle string errors', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should handle unknown error types', () => {
      expect(getErrorMessage({ custom: 'error' })).toBe('[object Object]');
    });

    it('should handle null/undefined errors', () => {
      expect(getErrorMessage(null)).toBe('Unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('Unknown error occurred');
    });
  });
});