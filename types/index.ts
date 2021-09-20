import { Token, TokenAmount } from "@akropolis-web/primitives";
export type { TransactionObject } from "../generated/contracts/utils/types";

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

export type FeesPerGas = {
  maxPriorityFeePerGas: number;
  maxFeePerGas: number;
};

export type GasPricesData = {
  slow: number;
  standard: number;
  fast: number;
  slowWaitTime: number;
  standardWaitTime: number;
  fastWaitTime: number;
};

export type FeesPerGasData = {
  slow: FeesPerGas;
  standard: FeesPerGas;
  fast: FeesPerGas;
  slowWaitTime: number;
  standardWaitTime: number;
  fastWaitTime: number;
  baseFeePerGas: number;
};
