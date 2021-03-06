/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable class-methods-use-this */
import { Token, TokenAmount } from "@akropolis-web/primitives";
import { combineLatest, Observable, timer } from "rxjs";
import * as R from "ramda";
import { map, switchMap } from "rxjs/operators";

import { createVestedAkro } from "../../generated/contracts";
import { memoize } from "../../utils/decorators";

import { Erc20Api } from "./Erc20Api";
import { Contracts } from "../types";
import { Web3Manager } from "./Web3Manager";
import { TransactionsApi } from "./TransactionsApi";

const WEB3_LONG_POOLING_TIMEOUT = 15 * 60 * 1000;

export class SwapApi {
  private vestedAkroReadonlyContract: Contracts["vestedAkro"];

  constructor(
    private web3Manager: Web3Manager,
    private transactions: TransactionsApi,
    private erc20: Erc20Api
  ) {
    this.vestedAkroReadonlyContract = createVestedAkro(
      this.web3Manager.web3,
      vAkroToken.address
    );
  }

  @memoize()
  public getSwapDates$() {
    return combineLatest([
      this.vestedAkroReadonlyContract.methods.vestingPeriod(),
      this.vestedAkroReadonlyContract.methods.vestingStart(),
      this.vestedAkroReadonlyContract.methods.vestingCliff(),
    ]).pipe(
      map(([vestingPeriodBN, vestingStartBN, vestingCliffBN]) => {
        const vestingStart = new Date(vestingStartBN.toNumber() * 1000);
        const vestingStop = new Date(
          vestingStartBN.toNumber() * 1000 + vestingPeriodBN.toNumber() * 1000
        );
        const claimingStart = new Date(
          vestingStartBN.toNumber() * 1000 + vestingCliffBN.toNumber() * 1000
        );

        return {
          vestingStart,
          vestingStop,
          claimingStart,
        };
      })
    );
  }

  @memoize(R.identity)
  public getUserAvailableToClaimAkro$(
    account: string
  ): Observable<TokenAmount> {
    return this.erc20.toTokenAmount$(
      vAkroToken,
      timer(0, WEB3_LONG_POOLING_TIMEOUT).pipe(
        switchMap(() =>
          this.vestedAkroReadonlyContract.methods.unlockAndRedeemAll.read(
            undefined,
            { from: account },
            [
              this.vestedAkroReadonlyContract.events.Transfer({
                filter: { from: account },
              }),
            ]
          )
        )
      )
    );
  }

  @memoize(R.identity)
  public getUserVAkroBalance$(account: string): Observable<TokenAmount> {
    return this.erc20.getBalance$(vAkroToken, account);
  }

  @memoize(R.identity)
  public getUserDueToUnlockAkro$(account: string): Observable<TokenAmount> {
    return combineLatest([
      this.erc20.getBalance$(vAkroToken, account),
      this.getUserAvailableToClaimAkro$(account),
    ]).pipe(map(([balance, claimable]) => balance.sub(claimable)));
  }

  public claim = async () => {
    return this.transactions.send(
      this.vestedAkroReadonlyContract.methods.unlockAndRedeemAll.getTransaction(
        undefined
      )
    );
  };
}

const vAkroToken = new Token(
  "0x5593143eAE5000983bB015b2E0AC35C125B3376C",
  "vAKRO",
  18,
  "eth"
);
