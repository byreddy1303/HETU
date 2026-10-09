// Database events over the compatibility API's authenticated socket.
// Server-side authorization remains mandatory; these filters only route UI events.
type Row = Record<string, unknown>;
type Kind = 'postgres_changes' | 'broadcast' | 'presence';
interface Frame {
  type: Kind;
  topic?: string;
  table?: string;
  event?: string;
  new?: Row;
  old?: Row;
  payload?: Row;
  state?: Record<string, Row[]>;
}
// The existing subscribers use different payload shapes for each event kind.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
 type Callback = (payload: any) => void;

export interface RealtimeChannel {
  on(kind: Kind, filter: Record<string, string>, callback: Callback): RealtimeChannel;
  subscribe(callback?: (status: string) => void): RealtimeChannel;
  send(message: { type: string; event: string; payload: Row }): Promise<unknown>;
  track(payload: Row): Promise<unknown>;
  presenceState(): Record<string, Row[]>;
}

export function createRealtimeClient(apiUrl: string, getToken: () => Promise<string | null>) {
  const channels = new Set<Channel>();
  let socket: WebSocket | null = null;
  let opening: Promise<void> | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let epoch = 0;
  let attempts = 0;

  function reconnect() {
    if (retry || !channels.size) return;
    retry = setTimeout(() => {
      retry = undefined;
      void connect().catch(() => {});
    }, Math.min(1000 * 2 ** attempts++, 30_000));
  }

  function connect(): Promise<void> {
    if (socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (opening) return opening;
    const current = epoch;
    const pending = (async () => {
      const token = await getToken();
      if (current !== epoch) throw new Error('Realtime connection cancelled.');
      if (!token) throw new Error('Sign in first.');
      const url = new URL(`${apiUrl}/v1/ws`, window.location.origin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url, ['clerk-session', token]);
      socket = ws;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Realtime connection timed out.'));
          ws.close();
        }, 10_000);
        ws.onopen = () => {
          clearTimeout(timer);
          if (current !== epoch) { ws.close(); reject(new Error('Realtime connection cancelled.')); return; }
          attempts = 0;
          for (const channel of channels) channel.connected();
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error('Realtime connection failed.'));
          ws.close();
        };
        ws.onclose = () => {
          clearTimeout(timer);
          reject(new Error('Realtime connection closed.'));
          if (current !== epoch || socket !== ws) return;
          socket = null;
          for (const channel of channels) channel.status?.('CLOSED');
          reconnect();
        };
        ws.onmessage = (event) => {
          if (current !== epoch) return;
          let message: Frame;
          try { message = JSON.parse(String(event.data)) as Frame; } catch { return; }
          if (!message || typeof message !== 'object') return;
          for (const channel of channels) channel.dispatch(message);
        };
      });
    })().catch((error) => {
      if (current === epoch) {
        for (const channel of channels) channel.status?.('CHANNEL_ERROR');
        reconnect();
      }
      throw error;
    }).finally(() => { if (opening === pending) opening = null; });
    opening = pending;
    return pending;
  }

  function close() {
    epoch++;
    clearTimeout(retry);
    retry = undefined;
    socket?.close();
    socket = null;
    opening = null;
  }

  class Channel implements RealtimeChannel {
    handlers: Array<{ kind: Kind; filter: Record<string, string>; callback: Callback }> = [];
    status?: (status: string) => void;
    presence: Record<string, Row[]> = {};
    tracked?: Row;
    constructor(readonly topic: string) {}
    on(kind: Kind, filter: Record<string, string>, callback: Callback): this {
      this.handlers.push({ kind, filter, callback });
      return this;
    }
    subscribe(callback?: (status: string) => void): this {
      this.status = callback;
      channels.add(this);
      if (socket?.readyState === WebSocket.OPEN) queueMicrotask(() => {
        if (channels.has(this)) this.connected();
      });
      else void connect().catch(() => {});
      return this;
    }
    connected() {
      this.status?.('SUBSCRIBED');
      if (this.tracked) socket?.send(JSON.stringify({ type: 'presence', topic: this.topic, payload: this.tracked }));
    }
    async send(message: { type: string; event: string; payload: Row }) {
      try {
        if (!channels.has(this)) return 'error';
        const current = epoch;
        await connect();
        if (!channels.has(this) || current !== epoch || socket?.readyState !== WebSocket.OPEN) return 'error';
        socket.send(JSON.stringify({ ...message, topic: this.topic }));
        return 'ok';
      } catch { return 'error'; }
    }
    async track(payload: Row) {
      this.tracked = payload;
      return this.send({ type: 'presence', event: 'sync', payload });
    }
    presenceState() { return this.presence; }
    dispatch(message: Frame) {
      if (message.type === 'presence' && message.topic === this.topic) this.presence = message.state ?? {};
      for (const { kind, filter, callback } of this.handlers) {
        if (kind !== message.type) continue;
        if (kind === 'postgres_changes') {
          if (filter.table && filter.table !== message.table) continue;
          if (filter.event !== '*' && filter.event !== message.event) continue;
          if (filter.filter) {
            const match = /^([^=]+)=eq\.(.+)$/.exec(filter.filter);
            const row = message.event === 'DELETE' ? message.old : message.new;
            if (!match || String(row?.[match[1]]) !== match[2]) continue;
          }
          callback({ table: message.table, schema: 'public', new: message.new ?? {}, old: message.old ?? {}, eventType: message.event });
        } else if (message.topic === this.topic && (kind === 'presence' ? filter.event === 'sync' : filter.event === message.event)) {
          callback(kind === 'broadcast' ? { payload: message.payload } : message);
        }
      }
    }
  }

  return {
    channel(topic: string, _options?: { config?: { presence?: { key?: string } } }): RealtimeChannel { return new Channel(topic); },
    async removeChannel(channel: RealtimeChannel) {
      if (channel instanceof Channel) channels.delete(channel);
      if (!channels.size) close();
      return 'ok';
    },
    reset() {
      close();
      for (const channel of channels) { channel.presence = {}; channel.status?.('CLOSED'); }
      channels.clear();
    }
  };
}
