import { memoize } from "../../utils/decorators";
import { Observable, combineLatest, of, merge, throwError } from "rxjs";
import { fromFetch } from "rxjs/fetch";
import { map, switchMap, shareReplay, catchError } from "rxjs/operators";
import BN from "bn.js";
import {
  decimalsToWei,
  Fraction,
  isEqualHex,
  max,
  toFraction,
  Token,
  TokenAmount,
} from "@akropolis-web/primitives";
import { GoogleSheetsApi, SheetData } from "./GoogleSheetsApi";
import dayjs from "dayjs";
import { VestedReward, VestedRewardsSource } from "../../types";
import * as R from "ramda";
import { createRewardsClaiming } from "../../generated/contracts";
import { Web3Manager } from "./Web3Manager";
import { getAmount, getAmountsSum } from "../../utils";
import { awaitFirstNonNullableOrThrow } from "../../utils/rxjs";
import { fromWeb3DataEvent } from "../../generated/contracts/utils/fromWeb3DataEvent";
import { TransactionsApi } from "./TransactionsApi";

type ClaimingProofs = {
  snapshot: {
    total: string;
    balances: {
      delphi: string;
      dex: string;
      sparta?: string;
    };
  };
  merkleIndex: number;
  merkleProofs: string[];
};

const VESTINGS_REWARDS_TABLES = {
  sheetIds: {
    delphi: "1higH5erdzRpW2g28KzNAYGzky58kK69G5rBn6-xuPNc",
    dex: "1QyM6SXvaiZGmx4og4Gncc2yfWQyQGk70f5uW1WGhKvA",
  },
  config: {
    gid: 973194699,
    range: "B1:5",
    getLockDays: (sheet: SheetData): number | null => {
      const lockDate = sheet?.[0]?.[0];
      return lockDate ? Number(lockDate) : null;
    },
    getWaitingDistributionDays: (sheet: SheetData): number | null => {
      const lockDate = sheet?.[1]?.[0];
      return lockDate ? Number(lockDate) : null;
    },
    getWeeklyRewardsByProduct: (sheet: SheetData): Record<string, string> => {
      const [addresses = [], amounts = []] = sheet.slice(3);

      return Object.fromEntries<string>(
        addresses
          .map((address, index) =>
            address
              ? [(address as string).toLowerCase(), amounts[index] || "0"]
              : null
          )
          .filter((entry): entry is [string, string] => entry !== null)
      );
    },
  },
  snapshots: {
    gid: 0,
    lastSnapshotDateRange: "F1",
    usersList: "A:A",
    distributionDatesList: "1:1",
  },
  distributions: {
    gid: 243946206,
    lastDistributionDateRange: "B1",
  },
  amounts: {
    gid: 0,
    range: "A:D",
  },
  swapped: {
    gids: {
      delphi: 810699602,
    },
    range: "A3:B",
  },
};

const vestedRewardsSources = ["delphi", "dex"] as const;

const REWARDS_CLAIMING_ADDRESS = "0x0EB87250ce2C66a66269E09c3A7FCB7AebdB7Bb6";
const ADEL_TOKEN_ADDRESS = "0x94d863173EE77439E4292284fF13fAD54b3BA182";
const ADEL_TOKEN = new Token(ADEL_TOKEN_ADDRESS, "ADEL", 18, "eth");

export class VestedRewardsApi {
  constructor(
    private web3Manager: Web3Manager,
    private transactions: TransactionsApi,
    private googleSheets: GoogleSheetsApi
  ) {}

  @memoize((...args) => R.toString(args))
  public getUserVestedRewards$(userAddress: string): Observable<VestedReward> {
    const amountsFromTables$ = combineLatest(
      vestedRewardsSources.map((source) =>
        this.getAmountsFromTable$(source, userAddress)
      )
    );

    const fullUnlockDates$ = combineLatest(
      vestedRewardsSources.map((source) =>
        this.getFullUnlockDate$(userAddress, source)
      )
    );

    const amountsFromClaimingContract$ = this.getAmountsFromClaimingContract$(
      userAddress
    );
    const amountsFromProofs$ = this.getAmountsFromProofs$(userAddress);

    const zeroTokenAmount = makeTokenAmount(0);

    return combineLatest([
      amountsFromTables$,
      fullUnlockDates$,
      amountsFromClaimingContract$,
      amountsFromProofs$,
    ]).pipe(
      map(
        ([
          amountsFromTables,
          fullUnlockDates,
          amountsFromClaimingContract,
          amountsFromProofs,
        ]) => {
          const amount = getAmountsSum(
            R.pluck("vested", amountsFromTables),
            zeroTokenAmount
          ).sub(amountsFromClaimingContract.claimed);

          const unlockDates = fullUnlockDates.filter(
            (date): date is Date => !!date
          );

          const result: VestedReward = {
            amount,
            distributed: getAmountsSum(
              R.pluck("distributed", amountsFromTables),
              zeroTokenAmount
            ).add(amountsFromClaimingContract.claimed),
            unlocked: amountsFromProofs.totalClaimLimit.sub(
              amountsFromClaimingContract.claimed
            ),
            fullUnlockDate: unlockDates.length
              ? new Date(Math.max(...unlockDates.map((date) => date.getTime())))
              : null,
          };
          return result;
        }
      ),
      shareReplay(1)
    );
  }

  @memoize((...args: Array<string>) => args.join())
  private getAmountsFromTable$(type: VestedRewardsSource, userAddress: string) {
    return this.googleSheets
      .getSheetValues$(
        VESTINGS_REWARDS_TABLES.sheetIds[type],
        VESTINGS_REWARDS_TABLES.amounts.range,
        VESTINGS_REWARDS_TABLES.amounts.gid
      )
      .pipe(
        map((amountsData) => {
          const row = amountsData?.find((r) =>
            isEqualHex((r?.[0] as string) || "", userAddress)
          );

          const vested = makeTokenAmount(row?.[2] || "0");
          const nextDistribution = makeTokenAmount(row?.[1] || "0");
          const distributed = makeTokenAmount(row?.[3] || "0");

          const zero = makeTokenAmount("0");

          return {
            vested: max(zero, vested).toSignificantValue(4),
            unlocked: max(zero, nextDistribution),
            distributed: max(zero, distributed),
          };
        })
      );
  }

  @memoize((...args: Array<string>) => args.join())
  private getFullUnlockDate$(userAddress: string, source: VestedRewardsSource) {
    return source === "dex"
      ? of(null)
      : combineLatest([
          this.googleSheets.getSheetValues$(
            VESTINGS_REWARDS_TABLES.sheetIds[source],
            VESTINGS_REWARDS_TABLES.snapshots.usersList,
            VESTINGS_REWARDS_TABLES.snapshots.gid
          ),
          this.googleSheets.getSheetValues$(
            VESTINGS_REWARDS_TABLES.sheetIds[source],
            VESTINGS_REWARDS_TABLES.snapshots.distributionDatesList,
            VESTINGS_REWARDS_TABLES.snapshots.gid
          ),
          this.getRewardsConfig$(source),
        ]).pipe(
          switchMap(([users, distributionDates, config]) => {
            const userRow =
              users.findIndex((row) =>
                isEqualHex(String(row?.[0]) || "", userAddress)
              ) + 1;

            if (userRow < 1) {
              return of(null);
            }

            return this.googleSheets
              .getSheetValues$(
                VESTINGS_REWARDS_TABLES.sheetIds[source],
                `${userRow}:${userRow}`,
                VESTINGS_REWARDS_TABLES.snapshots.gid
              )
              .pipe(
                map((userDistributions) => {
                  const padding = 5;
                  const lastUserDistributionIndex = userDistributions[0]
                    ?.slice(padding)
                    .findIndex((row) => (parseInt(String(row), 10) || 0) >= 1);

                  const distributionDate =
                    lastUserDistributionIndex !== undefined &&
                    lastUserDistributionIndex >= 0 &&
                    distributionDates?.[0]?.slice(padding)[
                      lastUserDistributionIndex
                    ];

                  return distributionDate
                    ? addDays(new Date(distributionDate), config.lockDays)
                    : null;
                })
              );
          })
        );
  }

  @memoize((...args: Array<string>) => args.join())
  private getAmountsFromClaimingContract$(userAddress: string) {
    const contract = this.getReadonlyContract();
    return contract.methods
      .claimed({ account: userAddress }, [
        contract.events.Claimed({ filter: { receiver: userAddress } }),
      ])
      .pipe(
        map((claimed) => ({
          claimed: getAmount(claimed, ADEL_TOKEN),
        }))
      );
  }

  @memoize((...args: Array<string>) => args.join())
  private getAmountsFromProofs$(userAddress: string) {
    return this.getClaimingProofs$(userAddress).pipe(
      map((proofs) => ({
        totalClaimLimit: getAmount(proofs?.snapshot.total || 0, ADEL_TOKEN),
      }))
    );
  }

  @memoize((...args: string[]) => args.join())
  private getClaimingProofs$(
    userAddress: string
  ): Observable<ClaimingProofs | null> {
    const notFoundError = new Error();

    return this.getLastProofsDate$().pipe(
      switchMap((date) => {
        const baseUrl =
          "https://akropolisio.github.io/rewards-claiming-merkle-proofs/";
        const indexUrl = `${baseUrl}mainnet/${date}/adel/merkleIndexes.json`;
        const getProofsUrl = (merkleIndex: number) =>
          `${baseUrl}mainnet/${date}/adel/proofs/${merkleIndex}.json`;

        return fromFetch(indexUrl).pipe(
          switchMap((response) => response.json()),
          map((merkleIndexes: Record<string, number>) => {
            const userAddressKey = Object.keys(merkleIndexes).find((key) =>
              isEqualHex(key, userAddress)
            );
            if (!userAddressKey) {
              throw notFoundError;
            }
            return merkleIndexes[userAddressKey];
          }),
          switchMap((merkleIndex) => fromFetch(getProofsUrl(merkleIndex))),
          switchMap((response) => response.json()),
          map((proofs: Record<string, ClaimingProofs>) => {
            const userAddressKey = Object.keys(proofs).find((key) =>
              isEqualHex(key, userAddress)
            );
            if (!userAddressKey) {
              throw notFoundError;
            }
            return proofs[userAddressKey];
          }),
          catchError((error) =>
            error === notFoundError ? of(null) : throwError(error)
          )
        );
      }),
      shareReplay(1)
    );
  }

  @memoize((...args: string[]) => args.join())
  private getLastProofsDate$(): Observable<string> {
    const url = `https://akropolisio.github.io/rewards-claiming-merkle-proofs/mainnet/adelLastProofsDate.json`;

    return merge(
      of(true),
      fromWeb3DataEvent(this.getReadonlyContract().events.Unpaused())
    ).pipe(
      switchMap(() => fromFetch(url, { cache: "no-cache" })),
      switchMap((response) => response.json()),
      shareReplay(1)
    );
  }

  @memoize((...args: Array<string>) => args.join())
  private getRewardsConfig$(source: VestedRewardsSource) {
    return this.googleSheets
      .getSheetValues$(
        VESTINGS_REWARDS_TABLES.sheetIds[source],
        VESTINGS_REWARDS_TABLES.config.range,
        VESTINGS_REWARDS_TABLES.config.gid
      )
      .pipe(
        map((sheetData) => {
          const lockDays = VESTINGS_REWARDS_TABLES.config.getLockDays(
            sheetData
          );
          const waitingDistributionDays = VESTINGS_REWARDS_TABLES.config.getWaitingDistributionDays(
            sheetData
          );

          if (!lockDays || !waitingDistributionDays) {
            throw new Error("Invalid vesting rewards config");
          }

          const weeklyRewardsByProduct = VESTINGS_REWARDS_TABLES.config.getWeeklyRewardsByProduct(
            sheetData
          );
          return { lockDays, waitingDistributionDays, weeklyRewardsByProduct };
        })
      );
  }

  @memoize((...args: string[]) => args.join())
  public getIsContractsPaused$(): Observable<boolean> {
    const contract = this.getReadonlyContract();

    return contract.methods.paused(undefined, [
      contract.events.Paused(),
      contract.events.Unpaused(),
    ]);
  }

  public async claim(from: string) {
    const {
      merkleIndex,
      merkleProofs,
      snapshot: { total },
    } = await awaitFirstNonNullableOrThrow(this.getClaimingProofs$(from));

    return this.transactions.send(
      this.getReadonlyContract().methods.claim.getTransaction({
        merkleRootIndex: new BN(merkleIndex),
        amountAllowedToClaim: new BN(total),
        merkleProofs,
      })
    );
  }

  private getReadonlyContract() {
    return createRewardsClaiming(
      this.web3Manager.web3,
      REWARDS_CLAIMING_ADDRESS
    );
  }
}

function addDays(date: Date, days: number) {
  return dayjs(date)
    .add(days, "days")
    .toDate();
}

function makeTokenAmount(value: string | number) {
  return new TokenAmount(
    numberFromTableToFraction(value).mul(decimalsToWei(18)),
    ADEL_TOKEN
  );
}

function numberFromTableToFraction(value: string | number): Fraction {
  if (typeof value === "number") {
    return toFraction(value);
  }

  const match = value.replace(/\s/g, "").match(/^(-)?(\d+),?(\d*)$/);

  if (!match) {
    throw new Error("Invalid number");
  }

  const [, minus, integer, fractional] = match;

  return new Fraction(integer)
    .add(new Fraction(fractional).div(decimalsToWei(fractional.length)))
    .mul(new BN(minus ? -1 : 1));
}
