import { Observable, of, combineLatest, timer } from "rxjs";
import { switchMap, map, shareReplay } from "rxjs/operators";
import * as R from "ramda";
import BN from "bn.js";
import { max, min, Token, TokenAmount } from "@akropolis-web/primitives";

import { createStakingPool } from "../../generated/contracts";
import { memoize } from "../../utils/decorators";
import { getCurrentValueOrThrow } from "../../utils/rxjs";
import { Contracts } from "../types";
import { Web3Manager } from "./Web3Manager";
import { StakingPool, SimplePoolReward } from "../../types";
import { Erc20Api } from "./Erc20Api";

const WEB3_LONG_POOLING_TIMEOUT = 15 * 60 * 1000;

export class StakingModuleApi {
  constructor(private web3Manager: Web3Manager, private erc20: Erc20Api) {}

  @memoize((...args: string[]) => args.join())
  public getUserSimplePoolRewards$(
    userAddress: string
  ): Observable<SimplePoolReward[]> {
    return combineLatest(
      [akroStakingPool, adelStakingPool].map((pool) =>
        this.getUserRewardsByPool$(userAddress, pool.address).pipe(
          map((rewards) => rewards.filter((reward) => !reward.isZero())),
          map((rewards) => {
            return rewards.map((amount) => ({
              amount,
              pool,
            }));
          })
        )
      )
    ).pipe(map((amounts) => amounts.flat()));
  }

  @memoize((...args: string[]) => args.join())
  private getUserRewardsByPool$(userAddress: string, poolAddress: string) {
    const readonlyContract = this.getPoolReadonlyContract(poolAddress);

    return combineLatest([
      readonlyContract.methods.supportedRewardTokens(),
      readonlyContract.methods.withdrawRewards.read(
        undefined,
        {
          from: userAddress,
        },
        [
          readonlyContract.events.RewardWithdraw({
            filter: { user: userAddress },
          }),
        ]
      ),
    ]).pipe(
      switchMap(([tokensAddresses, rewards]) =>
        (tokensAddresses.length
          ? combineLatest(
              tokensAddresses.map((tokenAddress) =>
                this.erc20.getToken$(tokenAddress)
              )
            )
          : of([])
        ).pipe(
          map((tokens) =>
            tokens
              .map((token, index) => new TokenAmount(rewards[index], token))
              .filter((amount) => !amount.isZero())
          )
        )
      )
    );
  }

  @memoize()
  public getAdelStakingPool() {
    return adelStakingPool;
  }

  @memoize((...args) => R.toString(args))
  public getUserBalance$(account: string | null): Observable<TokenAmount> {
    if (!account) {
      return of(new TokenAmount(0, adelStakingPool.depositToken));
    }

    const poolContract = this.getPoolReadonlyContract(adelStakingPool.address);

    return poolContract.methods
      .getPersonalStakes(
        {
          _address: account,
        },
        [
          poolContract.events.Staked({ filter: { user: account } }),
          poolContract.events.Unstaked({ filter: { user: account } }),
        ]
      )
      .pipe(
        map(
          ([, amounts]) =>
            new TokenAmount(
              amounts.reduce((acc, cur) => acc.add(cur), new BN(0)),
              adelStakingPool.depositToken
            )
        ),
        shareReplay(1)
      );
  }

  @memoize((...args) => R.toString(args))
  public getDepositLimit$(
    account: string | null
  ): Observable<TokenAmount | null> {
    if (!account) {
      return of(null);
    }

    return combineLatest([
      this.getUserCap$(account),
      this.getIsVipUser$(account),
      this.getPoolCapacity$(),
      this.getProductTVL$(),
    ]).pipe(
      map(([userCap, isVipUser, poolCapacity, poolBalance]) => {
        // VIP user ignores pool capacity limit
        if (isVipUser) {
          return userCap;
        }

        const availableCapacity = poolCapacity
          ? max(poolCapacity.withValue(0), poolCapacity.sub(poolBalance))
          : null;
        if (userCap && availableCapacity) {
          return min(userCap, availableCapacity);
        }
        return userCap || availableCapacity;
      })
    );
  }

  @memoize((...args: string[]) => args.join())
  public getUserCap$(account: string): Observable<TokenAmount | null> {
    const poolContract = this.getPoolReadonlyContract(adelStakingPool.address);

    return combineLatest([
      this.getUserCapEnabled$(),
      this.getUserBalance$(account),
      poolContract.methods.defaultUserCap(undefined, [
        poolContract.events.DefaultUserCapChanged(),
      ]),
    ]).pipe(
      map(([enabled, balance, defaultUserCap]) => {
        const userCap = defaultUserCap.sub(balance.toBN());
        return enabled
          ? new TokenAmount(
              userCap,
              adelStakingPool.depositToken
            ).toSignificantValue()
          : null;
      })
    );
  }

  @memoize((...args: string[]) => args.join())
  public getIsVipUser$(userAddress: string): Observable<boolean> {
    const poolContract = this.getPoolReadonlyContract(adelStakingPool.address);

    return combineLatest([
      poolContract.methods.isVipUser(
        {
          "": userAddress,
        },
        [
          poolContract.events.VipUserChanged({
            filter: { user: userAddress },
          }),
        ]
      ),
      this.getVipUsersEnabled$(),
    ]).pipe(map(([isVip, enabled]) => (enabled ? isVip : false)));
  }

  @memoize()
  public getPoolCapacity$(): Observable<TokenAmount | null> {
    const poolContract = this.getPoolReadonlyContract(adelStakingPool.address);

    return combineLatest([
      this.getPoolCapEnabled$(),
      poolContract.methods.stakingCap(undefined, [
        poolContract.events.StakingCapChanged(),
      ]),
    ]).pipe(
      map(([enabled, cap]) =>
        enabled ? new TokenAmount(cap, adelStakingPool.depositToken) : null
      )
    );
  }

  @memoize()
  private getPoolCapEnabled$(): Observable<boolean> {
    const poolContract = this.getPoolReadonlyContract(adelStakingPool.address);

    return poolContract.methods.stakingCapEnabled(undefined, [
      poolContract.events.StakingCapEnabledChange(),
    ]);
  }

  @memoize()
  private getUserCapEnabled$(): Observable<boolean> {
    const poolContract = this.getPoolReadonlyContract(adelStakingPool.address);

    return poolContract.methods.userCapEnabled(undefined, [
      poolContract.events.UserCapEnabledChange(),
    ]);
  }

  @memoize()
  private getVipUsersEnabled$(): Observable<boolean> {
    const poolContract = this.getPoolReadonlyContract(adelStakingPool.address);

    return poolContract.methods.vipUserEnabled(undefined, [
      poolContract.events.VipUserEnabledChange(),
    ]);
  }

  @memoize()
  public getProductTVL$(): Observable<TokenAmount> {
    const poolContract = this.getPoolReadonlyContract(adelStakingPool.address);

    return poolContract.methods
      .totalStaked(undefined, [
        poolContract.events.Staked(),
        poolContract.events.Unstaked(),
      ])
      .pipe(
        map((staked) => new TokenAmount(staked, adelStakingPool.depositToken))
      );
  }

  @memoize((...args) => R.toString(args))
  public getUnlockedUserBalance$(
    account: string | null
  ): Observable<TokenAmount> {
    if (!account) {
      return of(new TokenAmount(0, adelStakingPool.depositToken));
    }

    const poolContract = this.getPoolReadonlyContract(adelStakingPool.address);

    return timer(0, WEB3_LONG_POOLING_TIMEOUT)
      .pipe(
        switchMap(() =>
          poolContract.methods.unstakeAllUnlocked.read(
            {
              _data: "0x00",
            },
            { from: account },
            [
              poolContract.events.Staked({ filter: { user: account } }),
              poolContract.events.Unstaked({ filter: { user: account } }),
            ]
          )
        )
      )
      .pipe(
        map(
          (unlocked) => new TokenAmount(unlocked, adelStakingPool.depositToken)
        )
      );
  }

  public async deposit(amount: TokenAmount, account: string) {
    await this.erc20.approve(account, adelStakingPool.address, amount);

    return this.getPoolTxContract(adelStakingPool.address).methods.stake(
      {
        _amount: amount.toBN(),
        _data: "0x00",
      },
      {
        from: account,
      }
    );
  }

  public async withdraw(account: string) {
    return this.getPoolTxContract(
      adelStakingPool.address
    ).methods.unstakeAllUnlocked(
      {
        _data: "0x00",
      },
      {
        from: account,
      }
    );
  }

  private getPoolTxContract(address: string): Contracts["stakingPool"] {
    const txWeb3 = getCurrentValueOrThrow(this.web3Manager.txWeb3$);

    return createStakingPool(txWeb3, address);
  }

  private getPoolReadonlyContract(address: string): Contracts["stakingPool"] {
    return createStakingPool(this.web3Manager.web3, address);
  }
}

const adelStakingPool: StakingPool = {
  depositToken: new Token(
    "0x94d863173EE77439E4292284fF13fAD54b3BA182",
    "ADEL",
    18,
    "eth"
  ),
  address: "0x1a547c3dd03c39fb2b5aeafc524033879bd28f13",
  name: "ADEL Staking",
};

const akroStakingPool: StakingPool = {
  depositToken: new Token(
    "0x8ab7404063ec4dbcfd4598215992dc3f8ec853d7",
    "AKRO",
    18,
    "eth"
  ),
  address: "0x3501Ec11d205fa249f2C42f5470e137b529b35D0",
  name: "AKRO Staking",
};
