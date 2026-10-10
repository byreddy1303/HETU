// Adapted from experimental/cutover; this module never imports or contacts Postgres.
import { backendConfig } from '@/lib/backend-config';
import { createRealtimeClient } from '@/lib/fastapi-realtime';

export interface ApiUser {
  id: string;
  email?: string;
  username?: string | null;
  user_metadata?: Record<string, unknown>;
}
export interface ApiSession {
  access_token: string;
  refresh_token: string;
  user: ApiUser;
}
export interface ApiError { message: string; code?: string; status?: number }
type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'PASSWORD_RECOVERY';
type AuthListener = (event: AuthEvent, session: ApiSession | null) => void;
export interface ClerkRuntime {
  loaded: boolean;
  user: ApiUser | null;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

let runtime: ClerkRuntime | null = null;
let generation = 0;
let session: ApiSession | null = null;
const listeners = new Set<AuthListener>();
const readyWaiters = new Set<() => void>();

export function configureClerkRuntime(next: ClerkRuntime): () => void {
  const previousId = runtime?.user?.id;
  const userChanged = previousId !== next.user?.id;
  runtime = next;
  const current = userChanged ? ++generation : generation;
  if (userChanged) {
    session = null;
    realtime.reset();
  }
  if (next.loaded) {
    for (const resolve of readyWaiters) resolve();
    readyWaiters.clear();
    void refreshSession().then((value) => {
      if (generation !== current) return;
      const event = value ? (previousId === value.user.id ? 'TOKEN_REFRESHED' : 'SIGNED_IN') : 'SIGNED_OUT';
      for (const listener of listeners) listener(event, value);
    }).catch(() => { /* getSession/request reports token failures; do not manufacture sign-out. */ });
  }
  return () => { if (generation === current && userChanged) resetClerkRuntime(); };
}

export function resetClerkRuntime(): void {
  runtime = null;
  session = null;
  generation++;
  realtime.reset();
}

export const API_REQUEST_TIMEOUT_MS = 30_000;

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal | null
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener('abort', cancel, { once: true });
  if (callerSignal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(Object.assign(new Error(
    'The request timed out. Check your connection. A save may have completed; refresh before submitting it again.'
  ), { code: 'REQUEST_TIMEOUT' })), API_REQUEST_TIMEOUT_MS);
  try {
    controller.signal.throwIfAborted();
    return await abortable(operation(controller.signal), controller.signal);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', cancel);
  }
}

async function refreshSession(requestSignal?: AbortSignal): Promise<ApiSession | null> {
  if (!requestSignal) return withDeadline((signal) => refreshSession(signal));
  if (!runtime?.loaded) {
    let ready!: () => void;
    const pending = new Promise<void>((resolve) => { ready = resolve; readyWaiters.add(resolve); });
    try {
      await abortable(pending, requestSignal);
    } finally {
      readyWaiters.delete(ready);
    }
  }
  requestSignal.throwIfAborted();
  const active = runtime;
  const current = generation;
  if (!active?.user) return null;
  const token = await abortable(active.getToken(), requestSignal);
  requestSignal.throwIfAborted();
  if (current !== generation) throw new Error('Authentication changed. Retry the request.');
  if (!token) throw new Error('The session token is unavailable. Please sign in again.');
  session = { access_token: token, refresh_token: '', user: active.user };
  return session;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, options: { public?: boolean } = {}): Promise<T> {
  if (backendConfig.error || !backendConfig.fastapi) throw new Error(backendConfig.error || 'FastAPI is not selected.');
  if (!path.startsWith('/v1/')) throw new Error('Invalid API path.');
  return withDeadline(async (signal) => {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const current = generation;
    if (!options.public) {
      const token = (await refreshSession(signal))?.access_token;
      if (!token) throw new Error('Sign in first.');
      headers.set('Authorization', `Bearer ${token}`);
    }
    signal.throwIfAborted();
    const response = await abortable(fetch(`${backendConfig.apiUrl}${path}`, {
      ...init, signal, headers, cache: 'no-store'
    }), signal);
    const body = await abortable(response.json().catch(() => null), signal);
    if (!options.public && current !== generation) throw new Error('Authentication changed. Discarding stale response.');
    if (!response.ok) {
      const detail = body?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message ?? body?.error ?? `API request failed (${response.status})`;
      throw Object.assign(new Error(message), { status: response.status, code: body?.code ?? detail?.code });
    }
    if (body === null) throw new Error('Invalid JSON from compatibility API.');
    return body as T;
  }, init.signal);
}

export function normalizeError(error: unknown): ApiError {
  return error instanceof Error
    ? { message: error.message, code: (error as ApiError).code, status: (error as ApiError).status }
    : { message: 'Unknown API error' };
}

type FilterOperation = 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'is';
interface Filter {
  field: string;
  op: FilterOperation;
  value: unknown;
}

export interface QueryResult<T = unknown> {
  data: T | null;
  error: ApiError | null;
  count?: number | null;
}

// Existing tables have heterogeneous, ungenerated row schemas. Keep the legacy query surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class QueryBuilder<T = any> implements PromiseLike<QueryResult<T[]>> {
  private operation: 'query' | 'insert' | 'upsert' | 'update' | 'delete' = 'query';
  private values: Record<string, unknown>[] = [];
  private filters: Filter[] = [];
  private orFilters: Filter[] = [];
  private orders: Array<{ field: string; ascending: boolean }> = [];
  private columns = '*';
  private rowLimit: number | null = null;
  private offset = 0;
  private head = false;
  private countMode: 'exact' | null = null;
  private cardinality: 'many' | 'single' | 'maybe_single' = 'many';
  private onConflict: string | null = null;
  private returning = false;
  private parseError: Error | null = null;

  constructor(private readonly table: string) {}

  select(columns = '*', options?: { count?: 'exact'; head?: boolean }): this {
    this.columns = columns;
    this.returning = true;
    this.countMode = options?.count ?? null;
    this.head = options?.head ?? false;
    return this;
  }

  insert<V extends object>(values: V | V[]): this {
    this.operation = 'insert';
    this.values = (Array.isArray(values) ? values : [values]) as Record<string, unknown>[];
    return this;
  }

  upsert<V extends object>(
    values: V | V[],
    options?: { onConflict?: string }
  ): this {
    this.operation = 'upsert';
    this.values = (Array.isArray(values) ? values : [values]) as Record<string, unknown>[];
    this.onConflict = options?.onConflict ?? null;
    return this;
  }

  update(value: Record<string, unknown>): this {
    this.operation = 'update';
    this.values = [value];
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(field: string, value: unknown): this {
    return this.filter(field, 'eq', value);
  }
  neq(field: string, value: unknown): this {
    return this.filter(field, 'neq', value);
  }
  in(field: string, value: unknown[]): this {
    return this.filter(field, 'in', value);
  }
  gt(field: string, value: unknown): this {
    return this.filter(field, 'gt', value);
  }
  gte(field: string, value: unknown): this {
    return this.filter(field, 'gte', value);
  }
  lt(field: string, value: unknown): this {
    return this.filter(field, 'lt', value);
  }
  lte(field: string, value: unknown): this {
    return this.filter(field, 'lte', value);
  }
  is(field: string, value: unknown): this {
    return this.filter(field, 'is', value);
  }

  or(expression: string): this {
    try {
      this.orFilters.push(...parseOrFilters(expression));
    } catch (error) {
      this.parseError = error as Error;
    }
    return this;
  }

  order(field: string, options?: { ascending?: boolean }): this {
    this.orders.push({ field, ascending: options?.ascending ?? true });
    return this;
  }

  limit(value: number): this {
    this.rowLimit = value;
    return this;
  }

  range(from: number, to: number): this {
    this.offset = from;
    this.rowLimit = Math.max(0, to - from + 1);
    return this;
  }

  single(): Promise<QueryResult<T>> {
    this.cardinality = 'single';
    return this.execute() as Promise<QueryResult<T>>;
  }

  maybeSingle(): Promise<QueryResult<T | null>> {
    this.cardinality = 'maybe_single';
    return this.execute() as Promise<QueryResult<T | null>>;
  }

  then<TResult1 = QueryResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return (this.execute() as Promise<QueryResult<T[]>>).then(onfulfilled, onrejected);
  }

  private filter(field: string, op: FilterOperation, value: unknown): this {
    this.filters.push({ field, op, value });
    return this;
  }

  private async execute(): Promise<QueryResult<unknown>> {
    try {
      if (this.parseError) throw this.parseError;
      if (this.operation !== 'query' && this.orFilters.length) {
        throw new Error('OR filters on mutations are not supported by the compatibility API.');
      }
      if (this.operation === 'query') {
        const response = await apiRequest<{ data: T[]; count: number }>(
          `/v1/compat/tables/${encodeURIComponent(this.table)}/query`,
          {
            method: 'POST',
            body: JSON.stringify({
              columns: this.columns,
              filters: this.filters,
              or_filters: this.orFilters,
              orders: this.orders,
              limit: this.rowLimit,
              offset: this.offset,
              head: this.head,
              count: this.countMode,
              cardinality: this.cardinality
            })
          }
        );
        return this.result(response.data, response.count);
      }
      const response = await apiRequest<{ data: T[] }>(
        `/v1/compat/tables/${encodeURIComponent(this.table)}/${this.operation}`,
        {
          method: 'POST',
          body: JSON.stringify({
            values: this.values,
            filters: this.filters,
            on_conflict: this.onConflict,
            returning: this.returning || this.cardinality !== 'many'
          })
        }
      );
      if (!Array.isArray(response?.data)) throw new Error('Invalid compatibility mutation response.');
      return this.returning || this.cardinality !== 'many'
        ? this.result(response.data)
        : { data: null, error: null };
    } catch (error) {
      return { data: null, error: normalizeError(error), count: null };
    }
  }
  private result(rows: T[], count?: number): QueryResult<unknown> {
    if (!Array.isArray(rows)) throw new Error('Invalid compatibility API response.');
    if (!this.head && (this.cardinality === 'single' && rows.length !== 1 ||
        this.cardinality === 'maybe_single' && rows.length > 1)) {
      return { data: null, error: { message: 'Unexpected row count.', code: 'PGRST116' }, count: null };
    }
    const data = this.head ? null : this.cardinality === 'many' ? rows : rows[0] ?? null;
    return { data, error: null, count: count ?? null };
  }

}


function parseOrFilters(expression: string): Filter[] {
  return expression.split(',').map((part) => {
    const match = /^([a-z_][a-z_0-9]*)\.(eq|neq|gt|gte|lt|lte|is)\.([^,()]+)$/i.exec(part.trim());
    if (!match) throw new Error('Unsupported OR filter.');
    const [, field, op, raw] = match;
    return { field, op: op as FilterOperation, value: op === 'is' && raw === 'null' ? null : raw };
  });
}

const realtime = createRealtimeClient(backendConfig.apiUrl, async () => (await refreshSession())?.access_token ?? null);

export const fastapiClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from<T = any>(table: string) { return new QueryBuilder<T>(table); },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async rpc<T = any>(name: string, args: Record<string, unknown> = {}): Promise<QueryResult<T>> {
    try {
      const result = await apiRequest<{ data: T }>(`/v1/compat/rpc/${encodeURIComponent(name)}`, {
        method: 'POST', body: JSON.stringify({ arguments: args })
      });
      if (!result || !Object.hasOwn(result, 'data')) throw new Error('Invalid compatibility API response.');
      return { data: result.data, error: null };
    } catch (error) { return { data: null, error: normalizeError(error) }; }
  },
  functions: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async invoke<T = any>(name: string, options?: { body?: Record<string, unknown> }): Promise<QueryResult<T>> {
      try {
        const result = await apiRequest<{ data: T }>(`/v1/compat/functions/${encodeURIComponent(name)}`, {
          method: 'POST', body: JSON.stringify({ body: options?.body ?? {} })
        });
        if (!result || !Object.hasOwn(result, 'data')) throw new Error('Invalid compatibility API response.');
      return { data: result.data, error: null };
      } catch (error) { return { data: null, error: normalizeError(error) }; }
    }
  },
  auth: {
    async getSession() {
      try { return { data: { session: await refreshSession() }, error: null }; }
      catch (error) { return { data: { session: null }, error: normalizeError(error) }; }
    },
    onAuthStateChange(listener: AuthListener) {
      listeners.add(listener);
      void refreshSession().then((value) => {
        if (listeners.has(listener)) listener('INITIAL_SESSION', value);
      }).catch(() => {});
      return { data: { subscription: { unsubscribe: () => { listeners.delete(listener); } } } };
    },
    async signOut(_options?: { scope?: string }) {
      try {
        if (!runtime?.loaded) throw new Error('Authentication is still loading.');
        await runtime.signOut();
        generation++;
        runtime = { ...runtime, user: null };
        session = null;
        realtime.reset();
        for (const listener of listeners) listener('SIGNED_OUT', null);
        return { error: null };
      } catch (error) { return { error: normalizeError(error) }; }
    },
    // Clerk owns persistence, recovery and password policy. Legacy tokens/PINs
    // must never be interpreted as Clerk credentials.
    async setSession(_tokens: { access_token: string; refresh_token: string }) {
      return { error: { message: 'Use Clerk to sign in.' } };
    },
    async refreshSession(_tokens?: { refresh_token: string }): Promise<{ data: { session: ApiSession | null }; error: ApiError | null }> {
      return { data: { session: null }, error: { message: 'Clerk manages session restoration.' } };
    },
    async updateUser(_input: { password: string }) {
      return { error: { message: 'Use Clerk account recovery to change your password.' } };
    }
  },
  channel: realtime.channel,
  removeChannel: realtime.removeChannel
};
