import { Observable } from 'rxjs';
import { first } from 'rxjs/operators';

export async function awaitFirstNonNullableOrThrow<T>(
  input: Observable<T | null>,
  msg?: string,
): Promise<T> {
  const value = await input.pipe(first()).toPromise();

  if (value === null || value === undefined) {
    throw new Error(msg || 'Observable is not contain non nullable value');
  }

  return value;
}
