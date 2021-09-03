import { LiquidityAmount, Value, Currency, Token, TokenAmount } from '@akropolis-web/primitives';

export function getAmount(amount: Value, currencySymbol: '$'): LiquidityAmount;
export function getAmount(amount: Value, currencySymbol: Token): TokenAmount;
export function getAmount(
  amount: Value,
  currencySymbol: '$' | Token,
): LiquidityAmount | TokenAmount;

export function getAmount(
  amount: Value,
  currencySymbol: '$' | Token,
): LiquidityAmount | TokenAmount {
  if (currencySymbol instanceof Token) {
    return new TokenAmount(amount, currencySymbol);
  }
  const options = { precisions: 2, symbolPosition: 'start' } as const;
  const currency = new Currency(currencySymbol, 18);
  return new LiquidityAmount(amount, currency, options);
}
