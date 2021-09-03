import { Product, SavingsPool } from "../types";

export function getAmountsSum<T extends { add(value: T): T }>(arr: T[], initial: T) {
  return arr.reduce((acc, cur) => acc.add(cur), initial);
}

export function isSavingsPool(pool: Product): pool is SavingsPool {
  return 'lpToken' in pool;
}