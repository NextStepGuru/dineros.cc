import bankersRounding from "bankers-rounding";
import { Prisma } from "@prisma/client";

/**
 * Bankers Rounding Utility for Financial Calculations
 *
 * This module provides utilities for performing all monetary calculations
 * using bankers rounding (round half to even) with fixed 2 decimal precision.
 *
 * All monetary values in the system should use this utility to ensure
 * consistent and accurate financial calculations.
 */

export type MonetaryValue = number | string | Prisma.Decimal;

/**
 * Rounds a monetary value using bankers rounding to 2 decimal places
 * @param value - The value to round
 * @returns The rounded value as a number with 2 decimal places
 */
export function roundToCents(value: MonetaryValue): number {
  const numericValue =
    typeof value === "number" ? value : parseFloat(value.toString());

  if (isNaN(numericValue)) {
    throw new Error(`Invalid monetary value: ${value}`);
  }

  return bankersRounding(numericValue, 2);
}

/**
 * Converts a monetary value to a Decimal with fixed 2 decimal precision
 * @param value - The value to convert
 * @returns A Decimal with 2 decimal places
 */
export function toMonetaryDecimal(value: MonetaryValue): Prisma.Decimal {
  const rounded = roundToCents(value);
  return new Prisma.Decimal(rounded.toFixed(2));
}

/**
 * Adds two monetary values using bankers rounding
 * @param a - First value
 * @param b - Second value
 * @returns The sum rounded to 2 decimal places
 */
export function addMoney(a: MonetaryValue, b: MonetaryValue): number {
  const sum = parseFloat(a.toString()) + parseFloat(b.toString());
  return roundToCents(sum);
}

/**
 * Subtracts two monetary values using bankers rounding
 * @param a - First value (minuend)
 * @param b - Second value (subtrahend)
 * @returns The difference rounded to 2 decimal places
 */
export function subtractMoney(a: MonetaryValue, b: MonetaryValue): number {
  const difference = parseFloat(a.toString()) - parseFloat(b.toString());
  return roundToCents(difference);
}

/**
 * Multiplies two monetary values using bankers rounding
 * @param a - First value
 * @param b - Second value
 * @returns The product rounded to 2 decimal places
 */
export function multiplyMoney(a: MonetaryValue, b: MonetaryValue): number {
  const product = parseFloat(a.toString()) * parseFloat(b.toString());
  return roundToCents(product);
}

/**
 * Divides two monetary values using bankers rounding
 * @param a - Dividend
 * @param b - Divisor
 * @returns The quotient rounded to 2 decimal places
 */
export function divideMoney(a: MonetaryValue, b: MonetaryValue): number {
  const divisor = parseFloat(b.toString());
  if (divisor === 0) {
    throw new Error("Division by zero in monetary calculation");
  }

  const quotient = parseFloat(a.toString()) / divisor;
  return roundToCents(quotient);
}

/**
 * Calculates a percentage of a monetary value using bankers rounding
 * @param principal - The base amount
 * @param percentage - The percentage (e.g., 0.05 for 5%)
 * @returns The calculated percentage rounded to 2 decimal places
 */
export function calculatePercentage(
  principal: MonetaryValue,
  percentage: MonetaryValue
): number {
  return multiplyMoney(principal, percentage);
}

/**
 * Calculates compound interest using bankers rounding
 * @param principal - The principal amount
 * @param rate - The interest rate (e.g., 0.05 for 5%)
 * @param periods - The number of compounding periods
 * @returns The compound interest amount rounded to 2 decimal places
 */
export function calculateCompoundInterest(
  principal: MonetaryValue,
  rate: MonetaryValue,
  periods: number
): number {
  const p = parseFloat(principal.toString());
  const r = parseFloat(rate.toString());

  // A = P(1 + r)^n - P
  const amount = p * Math.pow(1 + r, periods);
  const interest = amount - p;

  return roundToCents(interest);
}

/**
 * Calculates simple interest using bankers rounding
 * @param principal - The principal amount
 * @param rate - The interest rate (e.g., 0.05 for 5%)
 * @param time - The time period
 * @returns The simple interest amount rounded to 2 decimal places
 */
export function calculateSimpleInterest(
  principal: MonetaryValue,
  rate: MonetaryValue,
  time: number
): number {
  // I = P * r * t
  const interest =
    parseFloat(principal.toString()) * parseFloat(rate.toString()) * time;
  return roundToCents(interest);
}

/**
 * Ensures a monetary value is formatted to exactly 2 decimal places
 * @param value - The value to format
 * @returns String representation with exactly 2 decimal places
 */
export function formatMoney(value: MonetaryValue): string {
  const rounded = roundToCents(value);
  return rounded.toFixed(2);
}

/**
 * Validates that a value is a valid monetary amount
 * @param value - The value to validate
 * @returns True if valid, false otherwise
 */
export function isValidMonetaryValue(value: any): value is MonetaryValue {
  if (value === null || value === undefined) return false;

  const numericValue =
    typeof value === "number" ? value : parseFloat(value.toString());
  return !isNaN(numericValue) && isFinite(numericValue);
}

/**
 * Converts various input types to a consistent monetary number
 * @param value - The input value
 * @returns A properly rounded monetary number
 */
export function normalizeMonetaryValue(value: MonetaryValue): number {
  if (!isValidMonetaryValue(value)) {
    throw new Error(`Invalid monetary value: ${value}`);
  }

  return roundToCents(value);
}

/**
 * Compares two monetary values for equality (considering rounding)
 * @param a - First value
 * @param b - Second value
 * @returns True if the values are equal when rounded to 2 decimal places
 */
export function isMonetaryEqual(a: MonetaryValue, b: MonetaryValue): boolean {
  return roundToCents(a) === roundToCents(b);
}

/**
 * Returns the absolute value of a monetary amount
 * @param value - The monetary value
 * @returns The absolute value rounded to 2 decimal places
 */
export function absoluteMoney(value: MonetaryValue): number {
  return roundToCents(Math.abs(parseFloat(value.toString())));
}

/**
 * Returns the maximum of two monetary values
 * @param a - First value
 * @param b - Second value
 * @returns The maximum value rounded to 2 decimal places
 */
export function maxMoney(a: MonetaryValue, b: MonetaryValue): number {
  return Math.max(roundToCents(a), roundToCents(b));
}

/**
 * Returns the minimum of two monetary values
 * @param a - First value
 * @param b - Second value
 * @returns The minimum value rounded to 2 decimal places
 */
export function minMoney(a: MonetaryValue, b: MonetaryValue): number {
  return Math.min(roundToCents(a), roundToCents(b));
}

/**
 * Sums an array of monetary values using bankers rounding
 * @param values - Array of monetary values
 * @returns The sum rounded to 2 decimal places
 */
export function sumMoney(values: MonetaryValue[]): number {
  const sum = values.reduce(
    (acc: number, value) => acc + parseFloat(value.toString()),
    0
  );
  return roundToCents(sum);
}
