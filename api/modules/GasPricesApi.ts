/* eslint-disable class-methods-use-this */
import { Observable, ReplaySubject, throwError, timer } from "rxjs";
import { fromFetch } from "rxjs/fetch";
import { switchMap, map, catchError } from "rxjs/operators";
import * as R from "ramda";

import { memoize } from "../../utils/decorators";
import { FeesPerGasData, GasPricesData } from "../../types";

interface GasNowResponse {
  type: string;
  data: Data;
}
interface Data {
  gasPrices: GasPrices;
  cumulativeCounts?: CumulativeCountsEntity[] | null;
  timestamp: number;
}
interface GasPrices {
  rapid: number;
  fast: number;
  standard: number;
  slow: number;
}
interface CumulativeCountsEntity {
  gwei: string;
  cumulativeCount: number;
}

type MetamaskGasPricesData = {
  suggestedMaxPriorityFeePerGas: string;
  suggestedMaxFeePerGas: string;
  minWaitTimeEstimate: number;
  maxWaitTimeEstimate: number;
};

type MetamaskSuggestedFees = {
  low: MetamaskGasPricesData;
  medium: MetamaskGasPricesData;
  high: MetamaskGasPricesData;
  estimatedBaseFee: string;
};

const FETCH_RESPONSE_TIMEOUT = 8000;
const metamaskSuggestedFeesUrl = `https://gas-api.metaswap.codefi.network/networks/1/suggestedGasFees`;

export class GasPricesApi {
  private gasPrices$ = new ReplaySubject<GasPricesData>();
  private ws = new WebSocket("wss://www.gasnow.org/ws");

  constructor() {
    this.connect();
  }

  private connect() {
    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const {
          data: { gasPrices },
        } = JSON.parse(event.data) as GasNowResponse;

        this.gasPrices$.next({
          slow: gasPrices.slow,
          standard: gasPrices.standard,
          fast: gasPrices.fast,
          slowWaitTime: 10,
          standardWaitTime: 3,
          fastWaitTime: 1,
        });
      } catch (err) {
        this.gasPrices$.error(err);
      }
    };

    this.ws.onclose = () => {
      setTimeout(() => {
        this.connect();
      }, 1000);
    };

    this.ws.onerror = (err) => {
      console.error("GasNow socket encountered error: ", err, "Closing socket");
      this.ws.close();
    };
  }

  @memoize(R.identity)
  public getGasPricesData$(): Observable<GasPricesData> {
    return this.gasPrices$;
  }

  @memoize(R.identity)
  public getFeesPerGasData$(): Observable<FeesPerGasData> {
    return timer(0, FETCH_RESPONSE_TIMEOUT).pipe(
      switchMap(() => fromFetch(metamaskSuggestedFeesUrl)),
      switchMap((response) => response.json()),
      map((data: MetamaskSuggestedFees) => {
        const getWeiFromGweiString = (value: string) =>
          Math.round(Number.parseFloat(value) * 10 ** 9);

        const convertFees = (key: "low" | "medium" | "high") => ({
          maxPriorityFeePerGas: getWeiFromGweiString(
            data[key].suggestedMaxPriorityFeePerGas
          ),
          maxFeePerGas: getWeiFromGweiString(data[key].suggestedMaxFeePerGas),
        });

        return {
          slow: convertFees("low"),
          standard: convertFees("medium"),
          fast: convertFees("high"),
          slowWaitTime: 5, // use hard coded values because Metamask returns wrong values
          standardWaitTime: 1,
          fastWaitTime: 0.5,
          baseFeePerGas: getWeiFromGweiString(data.estimatedBaseFee),
        };
      }),
      catchError((error) => {
        console.warn(
          `GasPriceApi: impossible to load suggested feePerFas for Ethereum Mainnet (id: 1)`
        );
        return throwError(error);
      })
    );
  }
}
