import { Token, TokenAmount } from "@akropolis-web/primitives";

export type SavingsPool = {
  address: string;
  lpToken: TokenType;
  depositTokens: TokenType[];
};

export type StakingPool = {
  address: string;
  depositToken: Token;
  name: string;
};

export type TokenType = {
  decimals: number;
  address: string;
  name: string;
  symbol: string;
};

export type PoolRewards = {
  pool: Product;
  rewards: SimplePoolReward[];
};

export type SimplePoolReward = {
  amount: TokenAmount;
  pool: Product;
};

export type Product = SavingsPool | StakingPool;

export type VestedReward = {
  amount: TokenAmount;
  fullUnlockDate: Date | null;
  unlocked: TokenAmount;
  distributed: TokenAmount;
};

export type VestedRewardsSource = "delphi" | "dex";
