/* eslint-disable class-methods-use-this */
import { from, Observable, of, timer } from "rxjs";
import { map, switchMap, shareReplay, delay } from "rxjs/operators";
import { fromFetch } from "rxjs/fetch";
import * as R from "ramda";
import { memoize } from "../../utils/decorators";
import { awaitFirst } from "../../utils/rxjs";
import { GOOGLE_API_KEY } from "../../env";

const delayTimeout = 500;
const GOOGLE_SHEETS_RESPONSE_TIMEOUT = 60 * 60 * 1000;

export type SheetData = Partial<Array<Partial<(string | number)[]>>>;

type SheetInfoResponse = {
  properties: {
    sheetId: number;
    title: string;
  };
};

export class GoogleSheetsApi {
  private nextRequestMinTime = Date.now();

  @memoize((...args: Array<string | number>) => args.join())
  public getSheetValues$(
    sheetId: string,
    range: string,
    gid: number
  ): Observable<SheetData> {
    const getInfoUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets(properties(sheetId%2Ctitle))&`;

    return this.fromFetch(getInfoUrl).pipe(
      map((data: { sheets: SheetInfoResponse[] }) => {
        const { sheets } = data;
        const sheetsInfo = sheets
          ? sheets.reduce(
              (
                acc: { [gid: number]: string },
                currentInfo: SheetInfoResponse
              ) => {
                acc[currentInfo.properties.sheetId] =
                  currentInfo.properties.title;

                return acc;
              },
              {}
            )
          : null;
        return `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${
          sheetsInfo && sheetsInfo[gid] ? `${sheetsInfo[gid]}!` : ""
        }${range}?valueRenderOption=UNFORMATTED_VALUE&`;
      }),
      switchMap((url) => this.fromFetch(url)),
      map((data?: { values?: SheetData }) => data?.values || [])
    );
  }

  @memoize(R.identity)
  private fromFetch(url: string) {
    return timer(0, GOOGLE_SHEETS_RESPONSE_TIMEOUT).pipe(
      switchMap(() => {
        const timeout = Math.max(0, this.nextRequestMinTime - Date.now());

        if (timeout > 0) {
          this.nextRequestMinTime += delayTimeout;
        } else {
          this.nextRequestMinTime = Date.now() + delayTimeout;
        }

        return of(true).pipe(
          delay(timeout),
          switchMap(() => fromFetch(`${url}key=${GOOGLE_API_KEY}`)),
          switchMap((response) => {
            return from(response.json()).pipe(
              map((result) => {
                if ("error" in result || response.status >= 400) {
                  throw new Error(
                    `GSheets said error. Status: ${
                      response.status
                    }. Details: ${result?.error?.message || R.toString(result)}`
                  );
                }
                return result;
              })
            );
          })
        );
      }),
      shareReplay(1)
    );
  }
}
