import Big from 'big.js';

// Configure Big.js for financial calculations
Big.DP = 18; // 18 decimal places
Big.RM = Big.roundHalfUp; // Round half up

// Mathematical constants
export const ZERO = new Big(0);
export const ONE = new Big(1);
export const HUNDRED = new Big(100);

// Utility functions for Big.js operations
export const toBig = (value: string | number | Big): Big => {
  if (value instanceof Big) return value;
  return new Big(value);
};

export const toNumber = (value: Big): number => {
  return parseFloat(value.toString());
};

export const toString = (value: Big, decimals: number = 6): string => {
  return value.toFixed(decimals);
};

// Mathematical operations
export const add = (a: Big | string | number, b: Big | string | number): Big => {
  return toBig(a).add(toBig(b));
};

export const subtract = (a: Big | string | number, b: Big | string | number): Big => {
  return toBig(a).sub(toBig(b));
};

export const multiply = (a: Big | string | number, b: Big | string | number): Big => {
  return toBig(a).mul(toBig(b));
};

export const divide = (a: Big | string | number, b: Big | string | number): Big => {
  const divisor = toBig(b);
  if (divisor.eq(ZERO)) {
    throw new Error('Division by zero');
  }
  return toBig(a).div(divisor);
};

export const power = (base: Big | string | number, exponent: number): Big => {
  return toBig(base).pow(exponent);
};

export const sqrt = (value: Big | string | number): Big => {
  return toBig(value).sqrt();
};

export const abs = (value: Big | string | number): Big => {
  return toBig(value).abs();
};

// Comparison operations
export const isEqual = (a: Big | string | number, b: Big | string | number): boolean => {
  return toBig(a).eq(toBig(b));
};

export const isGreaterThan = (a: Big | string | number, b: Big | string | number): boolean => {
  return toBig(a).gt(toBig(b));
};

export const isLessThan = (a: Big | string | number, b: Big | string | number): boolean => {
  return toBig(a).lt(toBig(b));
};

export const isGreaterThanOrEqual = (a: Big | string | number, b: Big | string | number): boolean => {
  return toBig(a).gte(toBig(b));
};

export const isLessThanOrEqual = (a: Big | string | number, b: Big | string | number): boolean => {
  return toBig(a).lte(toBig(b));
};

export const isZero = (value: Big | string | number): boolean => {
  return toBig(value).eq(ZERO);
};

export const isPositive = (value: Big | string | number): boolean => {
  return toBig(value).gt(ZERO);
};

export const isNegative = (value: Big | string | number): boolean => {
  return toBig(value).lt(ZERO);
};

// Min/Max operations
export const min = (a: Big | string | number, b: Big | string | number): Big => {
  const bigA = toBig(a);
  const bigB = toBig(b);
  return bigA.lt(bigB) ? bigA : bigB;
};

export const max = (a: Big | string | number, b: Big | string | number): Big => {
  const bigA = toBig(a);
  const bigB = toBig(b);
  return bigA.gt(bigB) ? bigA : bigB;
};

// Percentage calculations
export const percentage = (value: Big | string | number, percent: Big | string | number): Big => {
  return multiply(toBig(value), divide(toBig(percent), HUNDRED));
};

export const percentageChange = (oldValue: Big | string | number, newValue: Big | string | number): Big => {
  const old = toBig(oldValue);
  const newVal = toBig(newValue);
  
  if (old.eq(ZERO)) {
    return ZERO;
  }
  
  return multiply(divide(subtract(newVal, old), old), HUNDRED);
};

// Financial calculations
export const calculatePnL = (entryPrice: Big, currentPrice: Big, quantity: Big): Big => {
  return multiply(subtract(currentPrice, entryPrice), quantity);
};

export const calculateReturn = (initialValue: Big, finalValue: Big): Big => {
  if (initialValue.eq(ZERO)) {
    return ZERO;
  }
  return divide(subtract(finalValue, initialValue), initialValue);
};

export const calculateAnnualizedReturn = (totalReturn: Big, days: number): Big => {
  if (days <= 0) {
    return ZERO;
  }
  const dailyReturn = add(totalReturn, ONE);
  const annualizedReturn = power(dailyReturn, 365 / days);
  return subtract(annualizedReturn, ONE);
};

// Risk calculations
export const calculateVolatility = (returns: Big[]): Big => {
  if (returns.length < 2) {
    return ZERO;
  }
  
  // Calculate mean
  const sum = returns.reduce((acc, ret) => add(acc, ret), ZERO);
  const mean = divide(sum, toBig(returns.length));
  
  // Calculate variance
  const squaredDiffs = returns.map(ret => power(subtract(ret, mean), 2));
  const variance = divide(
    squaredDiffs.reduce((acc, diff) => add(acc, diff), ZERO),
    toBig(returns.length - 1)
  );
  
  return sqrt(variance);
};

export const calculateSharpeRatio = (returns: Big[], riskFreeRate: Big = ZERO): Big => {
  if (returns.length < 2) {
    return ZERO;
  }
  
  const excessReturns = returns.map(ret => subtract(ret, riskFreeRate));
  const meanExcessReturn = divide(
    excessReturns.reduce((acc, ret) => add(acc, ret), ZERO),
    toBig(returns.length)
  );
  
  const volatility = calculateVolatility(excessReturns);
  
  if (volatility.eq(ZERO)) {
    return ZERO;
  }
  
  return divide(meanExcessReturn, volatility);
};

export const calculateMaxDrawdown = (values: Big[]): Big => {
  if (values.length < 2) {
    return ZERO;
  }
  
  let maxDrawdown = ZERO;
  let peak = values[0];
  
  for (let i = 1; i < values.length; i++) {
    const current = values[i];
    
    if (current.gt(peak)) {
      peak = current;
    } else {
      const drawdown = divide(subtract(peak, current), peak);
      if (drawdown.gt(maxDrawdown)) {
        maxDrawdown = drawdown;
      }
    }
  }
  
  return maxDrawdown;
};

// Liquidity calculations
export const calculateLiquidityValue = (
  liquidityX: Big,
  liquidityY: Big,
  priceX: Big,
  priceY: Big
): Big => {
  return add(multiply(liquidityX, priceX), multiply(liquidityY, priceY));
};

// Impermanent Loss calculation
export const calculateImpermanentLoss = (
  initialPriceRatio: Big,
  currentPriceRatio: Big
): Big => {
  // IL = 2 * sqrt(price_ratio) / (1 + price_ratio) - 1
  const ratio = divide(currentPriceRatio, initialPriceRatio);
  const sqrtRatio = sqrt(ratio);
  const numerator = multiply(toBig(2), sqrtRatio);
  const denominator = add(ONE, ratio);
  
  return subtract(divide(numerator, denominator), ONE);
};

// Fee calculations
export const calculateFeeAPR = (
  feesEarned: Big,
  liquidityValue: Big,
  days: number
): Big => {
  if (liquidityValue.eq(ZERO) || days <= 0) {
    return ZERO;
  }
  
  const dailyFeeRate = divide(feesEarned, liquidityValue);
  const annualizedRate = multiply(dailyFeeRate, toBig(365 / days));
  
  return multiply(annualizedRate, HUNDRED);
};

// Utility functions for formatting
export const formatCurrency = (value: Big, decimals: number = 2): string => {
  return `$${value.toFixed(decimals)}`;
};

export const formatPercentage = (value: Big, decimals: number = 2): string => {
  return `${multiply(value, HUNDRED).toFixed(decimals)}%`;
};

export const formatNumber = (value: Big, decimals: number = 6): string => {
  return value.toFixed(decimals);
};

// Array operations
export const sum = (values: Big[]): Big => {
  return values.reduce((acc, val) => add(acc, val), ZERO);
};

export const average = (values: Big[]): Big => {
  if (values.length === 0) {
    return ZERO;
  }
  return divide(sum(values), toBig(values.length));
};

export const median = (values: Big[]): Big => {
  if (values.length === 0) {
    return ZERO;
  }
  
  const sorted = [...values].sort((a, b) => {
    if (a.lt(b)) return -1;
    if (a.gt(b)) return 1;
    return 0;
  });
  
  const mid = Math.floor(sorted.length / 2);
  
  if (sorted.length % 2 === 0) {
    return divide(add(sorted[mid - 1], sorted[mid]), toBig(2));
  } else {
    return sorted[mid];
  }
};