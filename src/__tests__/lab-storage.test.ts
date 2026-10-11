import { describe, expect, it, vi } from 'vitest';
import { createLabStorage, labPage } from '@/lib/lab-storage';

describe('online lab progress', () => {
  it('preserves newer edits while a save is in flight and saves keys independently', async () => {
    let finish!: () => void;
    const save = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockResolvedValue(undefined);
    const changed = vi.fn();
    const lab = createLabStorage({}, save, changed);
    lab.storage.setItem('gate_la_m1_c1_attempted', '[1]');
    lab.storage.setItem('gate_la_m1_c1_attempted', '[1,2]');
    lab.storage.setItem('gate_la_m2_c1_attempted', '[4]');
    expect(lab.hasPending()).toBe(true);
    finish();
    await lab.flush();
    expect(save.mock.calls).toEqual([
      ['gate_la_m1_c1_attempted', '[1]'],
      ['gate_la_m1_c1_attempted', '[1,2]'],
      ['gate_la_m2_c1_attempted', '[4]']
    ]);
    expect(changed).toHaveBeenLastCalledWith({ pending: 0, error: null });
  });

  it('retains failed edits in memory with an explicit error until online retry succeeds', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue(undefined);
    const changed = vi.fn();
    const lab = createLabStorage({}, save, changed);
    lab.storage.setItem('la-hub::mock-test-state', '{"question":3}');
    await lab.flush();
    expect(lab.hasPending()).toBe(true);
    expect(changed).toHaveBeenLastCalledWith({ pending: 1, error: 'Connection lost' });
    expect(lab.storage.getItem('la-hub::mock-test-state')).toBe('{"question":3}');
    await lab.flush();
    expect(lab.hasPending()).toBe(false);
    expect(changed).toHaveBeenLastCalledWith({ pending: 0, error: null });
  });

  it('records removals online and rejects edits after an account session closes', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const lab = createLabStorage({ 'la-hub::mock-test-state': '{}' }, save, vi.fn());
    lab.storage.removeItem('la-hub::mock-test-state');
    await lab.flush();
    expect(save).toHaveBeenCalledWith('la-hub::mock-test-state', null);
    expect(lab.storage.getItem('la-hub::mock-test-state')).toBeNull();
    lab.dispose();
    expect(() => lab.storage.setItem('la-hub::theme', 'dark')).toThrow('session is closed');
  });

  it('does not expose unrelated keys or allow page paths outside the lab', () => {
    const lab = createLabStorage({ 'auth.token': 'unrelated', 'la-hub::theme': 'dark' }, vi.fn(), vi.fn());
    expect(lab.storage.getItem('auth.token')).toBeNull();
    expect(() => lab.storage.setItem('auth.token', 'value')).toThrow('Unknown lab');
    expect(labPage('../../auth')).toBe('index.html');
    expect(labPage('//external.example')).toBe('index.html');
    expect(labPage('module-01-problem-lab.html')).toBe('module-01-problem-lab.html');
  });
});
