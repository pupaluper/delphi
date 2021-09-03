import Web3 from "web3";
import { BehaviorSubject, Observable, EMPTY, of } from "rxjs";
import { switchMap } from "rxjs/operators";
import { autobind } from "core-decorators";
import { ConnectResult, Web3WalletsManager } from "@web3-wallets-kit/core";

import type { WalletType } from "./types";
import { ethConnectors } from "./constants";
import { INFURA_API_KEY } from "../../../env";

export class Web3Manager {
  public connectedWallet$ = new BehaviorSubject<WalletType | null>(null);

  private manager = new Web3WalletsManager<Web3>({
    defaultProvider: {
      infuraAccessToken: INFURA_API_KEY,
      network: "mainnet",
    },
    makeWeb3: (provider) => {
      const web3 = new Web3(provider);
      web3.eth.transactionBlockTimeout = Infinity;
      return web3;
    },
  });

  private ethConnectors = ethConnectors;

  web3 = this.manager.web3;
  txWeb3$ = this.manager.txWeb3;
  account$ = this.manager.account;

  withAccount$<T, F = T>(
    switchFunction: (account: string) => Observable<T>,
    fallback: Observable<F> = EMPTY
  ): Observable<T | F> {
    return this.account$.pipe(
      switchMap((account) => (account ? switchFunction(account) : fallback))
    );
  }

  get chainId$() {
    return this.manager.chainId;
  }

  get status$() {
    return this.manager.status;
  }

  @autobind
  async disconnect() {
    this.connectedWallet$.next(null);
    await this.manager.disconnect();
  }

  @autobind
  async connect(walletType: WalletType): Promise<ConnectResult> {
    const connector = this.ethConnectors[walletType];

    const payload = await this.manager.connect(connector);
    this.connectedWallet$.next(walletType);

    return payload;
  }
}
