import { useCallback, useState, useRef, useEffect } from 'react';
import { B } from 'ts-toolbelt';

import { makeCancelablePromise, CancelablePromise } from './makeCancelablePromise';
import { getErrorMsg } from './getErrorMsg';

type Status = 'initial' | 'pending' | 'success' | 'error' | 'canceled';

export type Communication<
  E extends (...args: any[]) => Promise<any>,
  HasDefault extends B.Boolean = B.False
> = CommunicationState<E, HasDefault> & CommunicationHandlers<E>;

export interface CommunicationState<E, HasDefault extends B.Boolean> {
  error: string | null;
  status: Status;
  result: InferResult<E> | (HasDefault extends B.True ? never : undefined);
}

interface CommunicationHandlers<E> {
  execute(...args: InferArgs<E>): Promise<void>;
  cancelRequest(): void;
  reset(): void;
}

type InferResult<E> = E extends (...args: any[]) => Promise<infer R> ? R : never;
type InferArgs<E> = E extends (...args: infer A) => Promise<any> ? A : never;

type IOptionsWithoutDefault = {
  resetStateOnExecute?: boolean;
};

type IOptionsWithDefault<E> = {
  resetStateOnExecute?: boolean;
  defaultResult: InferResult<E>;
};

type IOptions<E> = {
  resetStateOnExecute?: boolean;
  defaultResult?: InferResult<E>;
};

export function useCommunication<E extends (...args: any[]) => Promise<any>>(
  effect: E,
  inputs: any[],
  options: IOptionsWithDefault<E>,
): Communication<E, B.True>;
export function useCommunication<E extends (...args: any[]) => Promise<any>>(
  effect: E,
  inputs: any[],
  options?: IOptionsWithoutDefault,
): Communication<E, B.False>;
export function useCommunication<E extends (...args: any[]) => Promise<any>>(
  effect: E,
  inputs: any[],
  options?: IOptions<E>,
): Communication<E, B.Boolean> {
  const { defaultResult, resetStateOnExecute } = options || {};
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('initial');
  const [result, setResult] = useState<InferResult<E> | undefined>(defaultResult);

  const launchedCommunicationRef = useRef<CancelablePromise<InferResult<E>> | null>(null);

  const cancelRequest = useCallback((setStatusCanceled: boolean = true) => {
    launchedCommunicationRef.current && launchedCommunicationRef.current.cancel();
    setStatusCanceled && setStatus('canceled');
  }, []);

  useEffect(() => () => cancelRequest(false), [cancelRequest]);

  const reset = useCallback(() => {
    cancelRequest(false);
    setStatus('initial');
    setError(null);
    setResult(defaultResult);
    launchedCommunicationRef.current = null;
  }, [cancelRequest, defaultResult]);

  const execute = useCallback(
    (...args: InferArgs<E>) => {
      resetStateOnExecute !== false && reset();
      setStatus('pending');

      const communication = makeCancelablePromise<InferResult<E>>(effect(...args));
      launchedCommunicationRef.current = communication;

      return communication
        .then(res => {
          setResult(res);
          setStatus('success');
        })
        .catch(err => {
          if (err.isCanceled) {
            return;
          }
          setError(getErrorMsg(err));
          setStatus('error');
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [...inputs, effect, reset, resetStateOnExecute],
  );

  return {
    execute,
    cancelRequest,
    reset,
    status,
    error,
    result,
  };
}
