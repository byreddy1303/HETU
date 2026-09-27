import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRealtimeClient } from '@/lib/fastapi-realtime';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  send = vi.fn();
  constructor(readonly url: string, readonly protocols: string[]) { Socket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
let client: ReturnType<typeof createRealtimeClient>;
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  vi.stubGlobal('WebSocket', Socket);
  client = createRealtimeClient('/api', async () => 'fresh-token');
});
afterEach(() => { client.reset(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function open() { await Promise.resolve(); const ws = Socket.instances.at(-1)!; ws.open(); await Promise.resolve(); return ws; }

describe('FastAPI realtime sync', () => {
  it('uses the Clerk subprotocol and preserves table names, new/old rows and equality filters', async () => {
    const changed = vi.fn();
    client.channel('sync').on('postgres_changes', { event: '*', table: 'sessions', filter: 'user_id=eq.user_a' }, changed).subscribe();
    const ws = await open();
    expect(String(ws.url)).toBe('ws://localhost/api/v1/ws');
    expect(ws.protocols).toEqual(['clerk-session', 'fresh-token']);
    ws.message({ type: 'postgres_changes', table: 'sessions', event: 'UPDATE', new: { id: 's1', user_id: 'user_b' } });
    expect(changed).not.toHaveBeenCalled();
    ws.message({ type: 'postgres_changes', table: 'sessions', event: 'DELETE', new: {}, old: { id: 's1', user_id: 'user_a' } });
    expect(changed).toHaveBeenCalledWith({ table: 'sessions', schema: 'public', eventType: 'DELETE', new: {}, old: { id: 's1', user_id: 'user_a' } });
  });

  it('reconnects with a fresh token and announces subscription so sync can rehydrate', async () => {
    const status = vi.fn();
    client.channel('sync').subscribe(status);
    const ws = await open();
    ws.close();
    await vi.advanceTimersByTimeAsync(1000);
    const second = await open();
    expect(second).not.toBe(ws);
    expect(status.mock.calls.filter(([value]) => value === 'SUBSCRIBED')).toHaveLength(2);
  });

  it('isolates topics and stops removed channels and sockets', async () => {
    const a = vi.fn(); const b = vi.fn();
    const first = client.channel('buddy:a').on('broadcast', { event: 'typing' }, a).subscribe();
    const second = client.channel('buddy:b').on('broadcast', { event: 'typing' }, b).subscribe();
    const ws = await open();
    ws.message({ type: 'broadcast', topic: 'buddy:a', event: 'typing', payload: { from: 'user_a' } });
    expect(a).toHaveBeenCalledOnce(); expect(b).not.toHaveBeenCalled();
    await client.removeChannel(first);
    ws.message({ type: 'broadcast', topic: 'buddy:a', event: 'typing' });
    expect(a).toHaveBeenCalledOnce();
    await client.removeChannel(second);
    expect(ws.readyState).toBe(3);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Socket.instances).toHaveLength(1);
  });

  it('cancels pending opens on logout and ignores frames from a previous identity', async () => {
    const changed = vi.fn();
    const channel = client.channel('sync').on('postgres_changes', { event: '*' }, changed).subscribe();
    const ws = await open();
    client.reset();
    ws.message({ type: 'postgres_changes', table: 'sessions', event: 'UPDATE' });
    expect(changed).not.toHaveBeenCalled();
    expect(await channel.send({ type: 'broadcast', event: 'x', payload: {} })).toBe('error');
  });

  it('recovers when the socket closes before opening, without an unhandled rejection', async () => {
    const status = vi.fn();
    client.channel('sync').subscribe(status);
    await Promise.resolve();
    Socket.instances[0].close();
    await vi.advanceTimersByTimeAsync(1000);
    await open();
    expect(status).toHaveBeenCalledWith('CHANNEL_ERROR');
    expect(status).toHaveBeenCalledWith('SUBSCRIBED');
  });
});
