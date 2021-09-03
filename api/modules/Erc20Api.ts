import { Observable, combineLatest, of } from "rxjs";
import { map } from "rxjs/operators";
import * as R from "ramda";
import { autobind } from "core-decorators";
import { Token, TokenAmount, Value } from "@akropolis-web/primitives";
import BN from "bn.js";

import { Contracts } from "../types";
import { Web3Manager } from "./Web3Manager";
import { memoize } from "../../utils/decorators";
import { createErc20 } from "../../generated/contracts/createErc20";
import { awaitFirst, getCurrentValueOrThrow } from "../../utils/rxjs";

export class Erc20Api {
  constructor(private web3Manager: Web3Manager) {}

  @memoize((...args) => R.toString(args))
  public getToken$(address: string): Observable<Token> {
    const contract = this.getErc20ReadonlyContract({ address });

    return combineLatest([
      contract.methods.symbol(),
      contract.methods.decimals(),
    ]).pipe(
      map(
        ([symbol, decimals]) =>
          new Token(address, symbol, decimals.toNumber(), "eth")
      )
    );
  }

  @autobind
  public toTokenAmount$(
    token: Token,
    amount$: Observable<Value>
  ): Observable<TokenAmount> {
    return combineLatest([this.getToken$(token.address), amount$]).pipe(
      map(([token, amount]) => new TokenAmount(amount, token))
    );
  }

  @memoize((...args) => R.toString(args))
  public getBalance$(
    token: Token,
    account: string | null
  ): Observable<TokenAmount> {
    if (!account) {
      return this.toTokenAmount$(token, of(0));
    }

    const contract = this.getErc20ReadonlyContract(token);

    return this.toTokenAmount$(
      token,
      contract.methods.balanceOf({ account }, [
        contract.events.Transfer({ filter: { from: account } }),
        contract.events.Transfer({ filter: { to: account } }),
      ])
    );
  }

  public async approve(
    fromAddress: string,
    spender: string,
    amount: TokenAmount
  ): Promise<void> {
    const allowance = await awaitFirst(
      this.getAllowance$(amount.currency, fromAddress, spender)
    );

    if (allowance.gte(amount.toBN())) {
      return;
    }

    this.approveBase(spender, amount);
  }

  @memoize((...args) => R.toString(args))
  public getAllowance$(
    token: Token,
    owner: string,
    spender: string
  ): Observable<BN> {
    const contract = this.getErc20ReadonlyContract(token);

    return contract.methods.allowance({ owner, spender }, [
      contract.events.Transfer({ filter: { from: owner } }),
      contract.events.Approval({ filter: { owner, spender } }),
    ]);
  }

  public approveBase = (spender: string, amount: TokenAmount) => {
    const txContract = this.getErc20TxContract(amount.currency.address);

    return txContract.methods.approve.getTransaction({
      spender,
      amount: amount.toBN(),
    });
  };

  private getErc20TxContract(address: string): Contracts["erc20"] {
    const txWeb3 = getCurrentValueOrThrow(this.web3Manager.txWeb3$);
    return createErc20(txWeb3, address);
  }

  private getErc20ReadonlyContract({
    address,
  }: Pick<Token, "address">): Contracts["erc20"] {
    return createErc20(this.web3Manager.web3, address);
  }
}
