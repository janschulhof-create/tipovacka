/**
 * Hard timeout for server-side Supabase HTTP calls used on request paths.
 *
 * This is deliberately implemented at the fetch layer, not only with
 * Promise.race(): when the budget expires the underlying HTTP request is
 * actually aborted as well.
 */
export const SUPABASE_REQUEST_TIMEOUT_MS = 2_500;

export function createBoundedFetch(
  timeoutMs: number = SUPABASE_REQUEST_TIMEOUT_MS,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;

    const forwardAbort = () => {
      if (!controller.signal.aborted) {
        controller.abort(upstreamSignal?.reason);
      }
    };

    if (upstreamSignal?.aborted) {
      forwardAbort();
    } else {
      upstreamSignal?.addEventListener('abort', forwardAbort, { once: true });
    }

    const timer = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort(new DOMException('Supabase request timed out', 'TimeoutError'));
      }
    }, timeoutMs);

    try {
      return await fetchImpl(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener('abort', forwardAbort);
    }
  };
}

/** Shared request-path fetch for Supabase SSR clients. */
export const boundedSupabaseFetch = createBoundedFetch();
