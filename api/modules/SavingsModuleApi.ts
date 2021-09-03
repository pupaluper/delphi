import {
  BehaviorSubject,
  Observable,
  of,
  timer,
  combineLatest,
  throwError,
} from "rxjs";
import { map, shareReplay, switchMap } from "rxjs/operators";
import * as R from "ramda";
import BN from "bn.js";
import {
  IToBN,
  TokenAmount,
  AllCoinsToken,
  LiquidityAmount,
  denormolizeAmount,
  isEqualHex,
  Token,
  min,
  decimalsToWei,
} from "@akropolis-web/primitives";

import {
  createSavingsModule,
  createDefiProtocol,
  createSavingsPoolToken,
} from "../../generated/contracts";
import { memoize } from "../../utils/decorators";
import { getCurrentValueOrThrow, awaitFirst } from "../../utils/rxjs";

import { Contracts } from "../types";
import { Web3Manager } from "./Web3Manager";
import { getAmount } from "../../utils";
import { SavingsPool } from "../../types";

const SAVINGS_MODULE_ADDRESS = "0x73fC3038B4cD8FfD07482b92a52Ea806505e5748";

export class SavingsModuleApi {
  private readonlyContract: Contracts["savingsModule"];
  private txContract = new BehaviorSubject<null | Contracts["savingsModule"]>(
    null
  );

  constructor(private web3Manager: Web3Manager) {
    this.readonlyContract = createSavingsModule(
      this.web3Manager.web3,
      SAVINGS_MODULE_ADDRESS
    );

    this.web3Manager.txWeb3$
      .pipe(
        map(
          (txWeb3) =>
            txWeb3 && createSavingsModule(txWeb3, SAVINGS_MODULE_ADDRESS)
        )
      )
      .subscribe(this.txContract);
  }

  @memoize()
  public getProducts$() {
    return of(savingsPools);
  }

  @memoize(R.identity)
  public getProduct$(address: string) {
    const pool = savingsPools.find((p) => isEqualHex(p.address, address));

    return pool ? of(pool) : throwError(`Savings pool ${address} not found`);
  }

  @memoize((...args) => R.toString(args))
  public getUserBalance$(
    poolAddress: string,
    account: string | null
  ): Observable<LiquidityAmount> {
    if (!account) {
      return of(getAmount(0, "$"));
    }

    return toLiquidityAmount$(
      this.getProduct$(poolAddress).pipe(
        switchMap((pool) => {
          const poolTokenContract = this.getPoolTokenReadonlyContract(
            pool.lpToken.address
          );

          return poolTokenContract.methods.fullBalanceOf({ account }, [
            poolTokenContract.events.Transfer({ filter: { from: account } }),
            poolTokenContract.events.Transfer({ filter: { to: account } }),
            poolTokenContract.events.DistributionCreated(),
          ]);
        }),
        shareReplay(1)
      )
    );
  }

  @memoize(R.identity)
  public getProductTVL$(poolAddress: string): Observable<LiquidityAmount> {
    return toLiquidityAmount$(
      timer(0, 15 * 60 * 1000).pipe(
        switchMap(() =>
          this.getProtocolReadonlyContract(
            poolAddress
          ).methods.normalizedBalance.read(undefined, { from: poolAddress }, [
            this.readonlyContract.events.Deposit({
              filter: { protocol: poolAddress },
            }),
            this.readonlyContract.events.Withdraw({
              filter: { protocol: poolAddress },
            }),
          ])
        )
      )
    );
  }

  @memoize(R.identity)
  public getPoolBalances$(poolAddress: string): Observable<TokenAmount[]> {
    const contract = this.getProtocolReadonlyContract(poolAddress);
    return combineLatest([
      this.getProduct$(poolAddress),
      contract.methods.supportedTokens(),
      timer(0, 15 * 60 * 1000).pipe(
        switchMap(() =>
          contract.methods.balanceOfAll.read(undefined, { from: poolAddress }, [
            this.readonlyContract.events.Withdraw(),
            this.readonlyContract.events.Deposit(),
          ])
        )
      ),
    ]).pipe(
      map(([pool, tokens, balances]) => {
        return tokens.map((tokenAddress, index) => {
          const token = pool?.depositTokens.find((x) =>
            isEqualHex(x.address, tokenAddress)
          );
          if (!token) throw new Error("Token not found");

          return new TokenAmount(
            balances[index],
            new Token(token.address, token.symbol, token.decimals, "eth")
          );
        });
      })
    ) as any;
  }

  @memoize((...args) => R.toString(args))
  public getMaxWithdrawAmount$(
    from: string,
    poolAddress: string,
    tokenAddress: string
  ): Observable<TokenAmount> {
    const token = savingsPools
      .find((p) => isEqualHex(p.address, poolAddress))
      ?.depositTokens.find((t) => isEqualHex(t.address, tokenAddress));

    if (!token) {
      return throwError(`Token ${tokenAddress} not found in ${poolAddress}`);
    }

    return this.getUserBalance$(poolAddress, from).pipe(
      map((balance) =>
        denormolizeAmount(
          balance,
          new Token(token.address, token.symbol, token.decimals, "eth")
        )
      ),
      switchMap((balance) =>
        calcMaxWithdrawAmount({
          from,
          poolAddress,
          userPoolBalance: balance,
          allowedRemainingBalance: decimalsToWei(balance.currency.decimals),
          getWithdrawFee$: (...args) => this.getWithdrawFee$(...args),
        })
      )
    );
  }

  @memoize((from: string, poolAddress: string, amount: TokenAmount) =>
    [from, poolAddress, amount.toString(), amount.currency.address].join()
  )
  public getWithdrawFee$(
    from: string,
    poolAddress: string,
    amount: TokenAmount
  ): Observable<TokenAmount> {
    return this.readonlyContract.methods.withdraw
      .read(
        {
          _protocol: poolAddress,
          token: amount.currency.address,
          dnAmount: amount.toBN(),
          maxNAmount: new BN(0),
        },
        {
          from,
        }
      )
      .pipe(
        map((nAmount) =>
          denormolizeAmount(
            new TokenAmount(nAmount, new AllCoinsToken()),
            amount.currency
          )
        ),
        map((dnAmount) => dnAmount.sub(amount))
      );
  }

  public async withdrawAllTokens({
    from,
    poolAddress,
  }: {
    from: string;
    poolAddress: string;
  }) {
    const userBalance = await awaitFirst(
      this.getUserBalance$(poolAddress, from)
    );

    return getCurrentValueOrThrow(this.txContract).methods.withdrawAll(
      {
        _protocol: poolAddress,
        nAmount: userBalance.toBN(),
      },
      { from }
    );
  }

  public async withdrawOneToken({
    from,
    poolAddress,
    tokenAddress,
  }: {
    from: string;
    poolAddress: string;
    tokenAddress: string;
  }) {
    const maxAmount = await awaitFirst(
      this.getMaxWithdrawAmount$(from, poolAddress, tokenAddress)
    );

    return getCurrentValueOrThrow(this.txContract).methods.withdraw(
      {
        _protocol: poolAddress,
        token: tokenAddress,
        dnAmount: maxAmount.toBN(),
        maxNAmount: new BN(0),
      },
      { from }
    );
  }

  private getProtocolReadonlyContract(
    address: string
  ): Contracts["defiProtocol"] {
    return createDefiProtocol(this.web3Manager.web3, address);
  }

  private getPoolTokenReadonlyContract(
    address: string
  ): Contracts["savingsPoolToken"] {
    return createSavingsPoolToken(this.web3Manager.web3, address);
  }
}

function toLiquidityAmount$(
  amount$: Observable<BN | IToBN>
): Observable<LiquidityAmount>;
function toLiquidityAmount$(
  amount$: Observable<Array<BN | IToBN>>
): Observable<LiquidityAmount[]>;
function toLiquidityAmount$(
  amount$: Observable<BN | IToBN | Array<BN | IToBN>>
): Observable<LiquidityAmount | LiquidityAmount[]> {
  return amount$.pipe(
    map((amounts) =>
      Array.isArray(amounts)
        ? amounts.map((amount) => getAmount(amount, "$"))
        : getAmount(amounts, "$")
    )
  );
}

export async function calcMaxWithdrawAmount({
  from,
  poolAddress,
  userPoolBalance,
  allowedRemainingBalance,
  getWithdrawFee$,
}: {
  from: string;
  poolAddress: string;
  userPoolBalance: TokenAmount;
  allowedRemainingBalance: BN;
  getWithdrawFee$: (
    from: string,
    poolAddress: string,
    amount: TokenAmount
  ) => Observable<TokenAmount>;
}): Promise<TokenAmount> {
  const fullAmountFee = await getExpectedFee(userPoolBalance);

  if (fullAmountFee !== null) {
    return userPoolBalance;
  }

  const zeroAmount = userPoolBalance.withValue(0);
  let fee = zeroAmount;
  let withdrawAmount = zeroAmount;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const remaining = userPoolBalance.sub(withdrawAmount).sub(fee);

    if (remaining.lt(allowedRemainingBalance)) {
      break;
    }

    try {
      const maxEstimatedFee = withdrawAmount.isZero()
        ? zeroAmount
        : userPoolBalance.mul(fee).div(withdrawAmount.add(fee));

      const nextWithdrawAmountBN = min(
        withdrawAmount.add(remaining.div(2)),
        userPoolBalance.sub(maxEstimatedFee)
      ).toBN(); // TODO inside the Fraction, we need to round the numerator and denominator, otherwise very large numbers can accumulate, which will lead to performance problems
      const nextWithdrawAmount = userPoolBalance.withValue(
        nextWithdrawAmountBN
      );

      // eslint-disable-next-line no-await-in-loop
      const nextFee = await getExpectedFee(nextWithdrawAmount);

      // fee is wrong, return prev withdrawAmount
      if (nextFee === null) {
        break;
      }

      fee = nextFee;
      withdrawAmount = nextWithdrawAmount;
    } catch {
      break;
    }
  }

  return withdrawAmount;

  async function getExpectedFee(amount: TokenAmount) {
    try {
      const expectedFee = await awaitFirst(
        getWithdrawFee$(from, poolAddress, amount)
      );

      const fullAmount = amount.add(expectedFee);
      const isValid = fullAmount.lte(userPoolBalance);

      return isValid ? expectedFee : null;
    } catch {
      return null;
    }
  }
}

const savingsPools: SavingsPool[] = [
  {
    depositTokens: [
      {
        decimals: 18,
        address: "0x4fabb145d64652a948d72533023f6e7a623c7c53",
        name: "Binance USD",
        symbol: "BUSD",
      },
    ],
    address: "0x051e3a47724740d47042edc71c0ae81a35fdede9",
    lpToken: {
      decimals: 18,
      address: "0xb62b6b192524f6b220a08f0d5d0eb748a8cbaa1b",
      name: "Delphi Aave BUSD",
      symbol: "daBUSD",
    },
  },
  {
    depositTokens: [
      {
        decimals: 18,
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        name: "Dai Stablecoin",
        symbol: "DAI",
      },
    ],
    address: "0x08ddb58d31c08242cd444bb5b43f7d2c6bca0396",
    lpToken: {
      decimals: 18,
      address: "0x9fca734bb62c20d2cf654705b8fbf4f49ff5cc31",
      name: "Delphi Compound DAI",
      symbol: "dCDAI",
    },
  },
  {
    depositTokens: [
      {
        decimals: 18,
        address: "0x0000000000085d4780b73119b644ae5ecd22b376",
        name: "TrueUSD",
        symbol: "TUSD",
      },
      {
        decimals: 18,
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        name: "Dai Stablecoin",
        symbol: "DAI",
      },
      {
        decimals: 6,
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        name: "USD Coin",
        symbol: "USDC",
      },
      {
        decimals: 6,
        address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        name: "Tether USD",
        symbol: "USDT",
      },
    ],
    address: "0x7967ada2a32a633d5c055e2e075a83023b632b4e",
    lpToken: {
      decimals: 18,
      address: "0x2afa3c8bf33e65d5036cd0f1c3599716894b3077",
      name: "Delphi Curve yPool",
      symbol: "dyPool",
    },
  },
  {
    depositTokens: [
      {
        decimals: 18,
        address: "0x57ab1ec28d129707052df4df418d58a2d46d5f51",
        name: "Synth sUSD",
        symbol: "sUSD",
      },
      {
        decimals: 18,
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        name: "Dai Stablecoin",
        symbol: "DAI",
      },
      {
        decimals: 6,
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        name: "USD Coin",
        symbol: "USDC",
      },
      {
        decimals: 6,
        address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        name: "Tether USD",
        symbol: "USDT",
      },
    ],
    address: "0x91d7b9a8d2314110d4018c88dbfdcf5e2ba4772e",
    lpToken: {
      decimals: 18,
      address: "0x520d25b08080296db66fd9f268ae279b66a8effb",
      name: "Delphi Curve sUSD",
      symbol: "dsUSD",
    },
  },
  {
    depositTokens: [
      {
        decimals: 6,
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        name: "USD Coin",
        symbol: "USDC",
      },
    ],
    address: "0x9984d588ef2112894a0513663ba815310d383e3c",
    lpToken: {
      decimals: 18,
      address: "0x5ad76e93a3a852c9af760da3fdb7983c265d8997",
      name: "Delphi Compound USDC",
      symbol: "dCUSDC",
    },
  },
  {
    depositTokens: [
      {
        decimals: 18,
        address: "0x57ab1ec28d129707052df4df418d58a2d46d5f51",
        name: "Synth sUSD",
        symbol: "sUSD",
      },
    ],
    address: "0xbed50f08b8e68293bd7db742c4207f2f6e520cd2",
    lpToken: {
      decimals: 18,
      address: "0x8e2317458878b9223904bdd95173ee96d46fec77",
      name: "Delphi Aave sUSD",
      symbol: "daSUSD",
    },
  },
  {
    depositTokens: [
      {
        decimals: 18,
        address: "0x4fabb145d64652a948d72533023f6e7a623c7c53",
        name: "Binance USD",
        symbol: "BUSD",
      },
      {
        decimals: 18,
        address: "0x6b175474e89094c44da98b954eedeac495271d0f",
        name: "Dai Stablecoin",
        symbol: "DAI",
      },
      {
        decimals: 6,
        address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        name: "USD Coin",
        symbol: "USDC",
      },
      {
        decimals: 6,
        address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
        name: "Tether USD",
        symbol: "USDT",
      },
    ],
    address: "0xeae1a8206f68a7ef629e85fc69e82cfd36e83ba4",
    lpToken: {
      decimals: 18,
      address: "0x8367af78444c5b57bc1cf38ded331d03558e67bb",
      name: "Delphi Curve BUSD",
      symbol: "dBUSD",
    },
  },
];
