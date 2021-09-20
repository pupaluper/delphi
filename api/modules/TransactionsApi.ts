import { ReplaySubject } from "rxjs";
import { concatMap } from "rxjs/operators";
import { TransactionReceipt } from "web3-core";
import { autobind } from "core-decorators";
import { numberToHex } from "web3-utils";
import Web3 from "web3";

import { TransactionObject } from "../../types";
import { awaitFirst, awaitFirstNonNullableOrThrow } from "../../utils/rxjs";
import { DeferredPromise } from "../../utils/js";
import { getErrorMsg } from "../../utils/getErrorMsg";

import { Web3Manager } from "./Web3Manager";
import { GasPricesApi } from "./GasPricesApi";

type PendingTransaction = {
  fromAddress: string;
  transaction: TransactionObject;
  onResolve: (value: TransactionReceipt) => void;
  onReject: (reason: any) => void;
};

export class TransactionsApi {
  private transactionQueue = new ReplaySubject<PendingTransaction>();

  constructor(
    private web3Manager: Web3Manager,
    private gasPricesApi: GasPricesApi
  ) {
    this.subscribeToTransactionsQueue();
  }

  async send(transaction: TransactionObject): Promise<TransactionReceipt> {
    const fromAddress = await awaitFirstNonNullableOrThrow(
      this.web3Manager.account$
    );

    return new Promise((resolve, reject) => {
      this.transactionQueue.next({
        transaction,
        fromAddress,
        onResolve: (value) => {
          resolve(value);
        },
        onReject: (reason) => {
          reject(reason);
        },
      });
    });
  }

  @autobind
  private subscribeToTransactionsQueue() {
    this.transactionQueue
      .pipe(
        concatMap(async ({ transaction, onResolve, onReject, fromAddress }) => {
          const txWeb3 = await awaitFirst(this.web3Manager.txWeb3$);

          if (!txWeb3) {
            onReject(new Error(`TransactionsApi: user is not connected`));
            return;
          }

          const web3NetworkID = await txWeb3.eth.getChainId();
          const expectedNetworkID = 1;

          if (expectedNetworkID !== web3NetworkID) {
            onReject(
              new Error(
                `TransactionsApi: not suited connected network. Expected ${expectedNetworkID} but received ${web3NetworkID}`
              )
            );
            return;
          }

          const canTakeNextQueueItem = new DeferredPromise<true>();

          const txHash = new DeferredPromise<string>();

          const receipt = new DeferredPromise<TransactionReceipt>();
          receipt.promise.then(onResolve).catch(onReject);

          const resolveTxHash = (hash: string) =>
            // Without timeout metamask can skip some approving windows and hide it
            setTimeout(() => {
              canTakeNextQueueItem.resolve(true);
              txHash.resolve(hash);
            }, 200);

          const rejectReceipt = (error: unknown) => {
            canTakeNextQueueItem.resolve(true);
            receipt.reject(error);
          };

          const { promiEvent } =
            (await this.sendUsingEip1559(
              txWeb3,
              transaction,
              fromAddress
            ).catch(() => null)) || {};

          !promiEvent && sendUsingLegacyGasPrice.call(this, txWeb3);

          promiEvent?.once("transactionHash", resolveTxHash);
          promiEvent?.once("receipt", (txReceipt) => {
            receipt.resolve(txReceipt);
          });

          promiEvent?.once("error", async (error) => {
            if (
              getErrorMsg(error).includes("1559") &&
              txHash.status === "pending"
            ) {
              sendUsingLegacyGasPrice.call(this, txWeb3);
            } else {
              rejectReceipt(error);
            }
          });

          async function sendUsingLegacyGasPrice(
            this: TransactionsApi,
            web3: Web3
          ) {
            const { promiEvent: fallbackPromiEvent } =
              (await this.sendUsingLegacyGasPrice(
                web3,
                transaction,
                fromAddress
              ).catch(rejectReceipt)) || {};

            fallbackPromiEvent?.once("transactionHash", resolveTxHash);
            fallbackPromiEvent?.once("receipt", (txReceipt) => {
              receipt.resolve(txReceipt);
            });
            fallbackPromiEvent?.once("error", rejectReceipt);
          }

          await canTakeNextQueueItem.promise;
        })
      )
      .subscribe();
  }

  private async sendUsingEip1559(
    web3: Web3,
    transaction: TransactionObject,
    from: string
  ) {
    console.log('>>> sendUsingEip1559');
    const gasPrice = (await awaitFirst(this.gasPricesApi.getFeesPerGasData$()))
      .standard;

    return {
      promiEvent: web3.eth.sendTransaction(
        transaction.send.request({
          from,
          maxFeePerGas: numberToHex(gasPrice.maxFeePerGas),
          maxPriorityFeePerGas: numberToHex(gasPrice.maxPriorityFeePerGas),
        }).params[0]
      ),
    };
  }

  private async sendUsingLegacyGasPrice(
    web3: Web3,
    transaction: TransactionObject,
    from: string
  ) {
    console.log('>>> sendUsingLegacyGasPrice');
    console.info("EIP-1559 not working, trying to use legacy gas price");

    const gasPrice = (await awaitFirst(this.gasPricesApi.getGasPricesData$()))
      .standard;

    return {
      promiEvent: web3.eth.sendTransaction(
        transaction.send.request({ gasPrice, from }).params[0]
      ),
    };
  }
}
