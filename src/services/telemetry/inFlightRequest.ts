export interface InFlightRequestState<T> {
  promise: Promise<T> | null;
}

export function shareInFlightRequest<T>(
  state: InFlightRequestState<T>,
  request: () => Promise<T>,
): Promise<T> {
  if (state.promise) return state.promise;

  const promise = request();
  state.promise = promise;
  const clear = () => {
    if (state.promise === promise) state.promise = null;
  };
  promise.then(clear, clear);
  return promise;
}

