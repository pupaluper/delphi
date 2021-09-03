import { combineLatest, of, Observable, BehaviorSubject } from "rxjs";
import { switchMap, map } from "rxjs/operators";
import { TokenAmount, isEqualHex } from "@akropolis-web/primitives";
import * as R from "ramda";

import { memoize } from "../../utils/decorators";
import { createRewardDistributionModule } from "../../generated/contracts";
import { Web3Manager } from "./Web3Manager";
import { PoolRewards, SimplePoolReward } from "../../types";
import { getCurrentValueOrThrow } from "../../utils/rxjs";

import { SavingsModuleApi } from "./SavingsModuleApi";
import { StakingModuleApi } from "./StakingModuleApi";
import { Contracts } from "../types";
import { Erc20Api } from "./Erc20Api";
import { isSavingsPool } from "../../utils";

const REWARD_DISTRIBUTION_MODULE_ADDRESS =
  "0x84056675382c851cf42FAAFCeC3FCa90E21AE645";

export class RewardsApi {
  private readonlyContract: Contracts["rewardDistributionModule"];
  private txContract = new BehaviorSubject<
    null | Contracts["rewardDistributionModule"]
  >(null);

  constructor(
    private web3Manager: Web3Manager,
    private savings: SavingsModuleApi,
    private staking: StakingModuleApi,
    private erc20: Erc20Api
  ) {
    this.readonlyContract = createRewardDistributionModule(
      this.web3Manager.web3,
      REWARD_DISTRIBUTION_MODULE_ADDRESS
    );

    this.web3Manager.txWeb3$
      .pipe(
        map(
          (txWeb3) =>
            txWeb3 &&
            createRewardDistributionModule(
              txWeb3,
              REWARD_DISTRIBUTION_MODULE_ADDRESS
            )
        )
      )
      .subscribe(this.txContract);
  }

  public async withdrawUserRewards(from: string, rewards: SimplePoolReward[]) {
    const res = rewards.reduce(
      (acc, poolsRewards) => {
        const poolTokens = isSavingsPool(poolsRewards.pool)
          ? poolsRewards.pool.lpToken.address
          : poolsRewards.pool.address;
        return {
          poolTokens: [...acc.poolTokens, poolTokens],
          rewardTokens: [
            ...acc.rewardTokens,
            poolsRewards.amount.currency.address,
          ],
        };
      },
      { poolTokens: [] as string[], rewardTokens: [] as string[] }
    );

    return getCurrentValueOrThrow(this.txContract).methods.withdrawReward(res, {
      from,
    });
  }

  @memoize(R.identity)
  public getAllUserSimpleRewardsByPool$(userAddress: string) {
    return combineLatest([
      this.getSimpleSavingsPoolsRewards$(userAddress),
      this.staking.getUserSimplePoolRewards$(userAddress),
    ]).pipe(
      map((rewards) =>
        rewards.flat().reduce<PoolRewards[]>((acc, current) => {
          const index = acc.findIndex((poolRewards) =>
            isEqualHex(poolRewards.pool.address, current.pool.address)
          );

          const currentPoolRewards = acc[index]?.rewards || [];

          const nextPoolReward = {
            pool: current.pool,
            rewards: currentPoolRewards.concat(current),
          };

          const nextAcc = [...acc];

          nextAcc.splice(index, index < 0 ? 0 : 1, nextPoolReward);

          return nextAcc;
        }, [])
      )
    );
  }

  @memoize(R.identity)
  public getAllUserSimpleRewards$(userAddress: string) {
    return combineLatest([
      this.getSimpleSavingsPoolsRewards$(userAddress),
      this.staking.getUserSimplePoolRewards$(userAddress),
    ]).pipe(map((rewards) => rewards.flat()));
  }

  @memoize(R.identity)
  public getSimpleSavingsPoolsRewards$(
    userAddress: string
  ): Observable<SimplePoolReward[]> {
    const poolTokens = this.readonlyContract.methods.supportedPoolTokens(
      undefined,
      [this.readonlyContract.events.ProtocolRegistered()]
    );

    const supportedRewardTokens = this.readonlyContract.methods
      .supportedRewardTokens(undefined, [
        this.readonlyContract.events.ProtocolRegistered(),
      ])
      .pipe(
        switchMap((t) =>
          combineLatest(t.map((tokenAddr) => this.erc20.getToken$(tokenAddr)))
        )
      );

    const savingsPools = this.savings.getProducts$();

    return combineLatest([
      poolTokens,
      supportedRewardTokens,
      savingsPools,
    ]).pipe(
      switchMap(([tokens, rewardTokens, allPools]) => {
        return tokens.length
          ? combineLatest(
              tokens.map((poolToken) =>
                this.readonlyContract.methods
                  .rewardBalanceOf(
                    {
                      user: userAddress,
                      poolToken,
                      rewardTokens: R.pluck("address", rewardTokens),
                    },
                    [
                      this.readonlyContract.events.RewardDistribution({
                        filter: { poolToken },
                      }),
                      this.readonlyContract.events.RewardWithdraw({
                        filter: { user: userAddress },
                      }),
                    ]
                  )
                  .pipe(
                    map((rewardsAmounts) => {
                      return rewardsAmounts
                        .map(
                          (rewardsAmount, index) =>
                            new TokenAmount(rewardsAmount, rewardTokens[index])
                        )
                        .filter((amount) => !amount.isZero());
                    }),
                    map((rewards) => {
                      const tokenPool = allPools.find((pool) =>
                        isEqualHex(pool.lpToken.address, poolToken)
                      );

                      if (!tokenPool) {
                        throw new Error("Pool with that token not found");
                      }

                      return rewards.map((amount) => ({
                        amount,
                        pool: tokenPool,
                      }));
                    })
                  )
              )
            ).pipe(
              map((data) => {
                return data.flat();
              })
            )
          : of([]);
      })
    );
  }
}
