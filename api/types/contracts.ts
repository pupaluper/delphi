import {
  createSavingsModule,
  createDefiProtocol,
  createSavingsPoolToken,
  createErc20,
  createStakingPool,
  createRewardDistributionModule,
  createVestedAkro,
} from "../../generated/contracts";

export type Contracts = {
  savingsModule: ReturnType<typeof createSavingsModule>;
  savingsPoolToken: ReturnType<typeof createSavingsPoolToken>;
  defiProtocol: ReturnType<typeof createDefiProtocol>;
  erc20: ReturnType<typeof createErc20>;
  stakingPool: ReturnType<typeof createStakingPool>;
  rewardDistributionModule: ReturnType<typeof createRewardDistributionModule>;
  vestedAkro: ReturnType<typeof createVestedAkro>;
};
