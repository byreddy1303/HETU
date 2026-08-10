import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '@/data/topper-notes.json';

const publicRoot = path.resolve(process.cwd(), 'public');

describe('GATE topper notes archive', () => {
  it('ships the complete ordered library with its credited metadata', () => {
    expect(manifest).toHaveLength(17);
    expect(manifest.reduce((sum, note) => sum + note.pages, 0)).toBe(829);
    expect(new Set(manifest.map((note) => note.id)).size).toBe(manifest.length);
    expect(new Set(manifest.map((note) => note.href)).size).toBe(manifest.length);

    const groups = new Map<string, (typeof manifest)[number][]>();
    for (const note of manifest) {
      groups.set(note.subject, [...(groups.get(note.subject) ?? []), note]);
    }
    expect([...groups.keys()].sort()).toEqual(
      ['Digital Logic', 'Discrete Mathematics', 'Engineering Mathematics'].sort()
    );

    for (const notes of groups.values()) {
      expect(notes.map((note) => note.sequence)).toEqual(
        Array.from({ length: notes.length }, (_, index) => index + 1)
      );
    }
  });

  it('keeps every linked PDF present, pushable and in sync with the manifest', () => {
    for (const note of manifest) {
      const filePath = path.join(publicRoot, note.href.replace(/^\//, ''));
      expect(existsSync(filePath), note.href).toBe(true);
      expect(statSync(filePath).size, note.href).toBe(note.bytes);
      expect(note.bytes, note.href).toBeLessThan(100_000_000);
    }

    expect(
      existsSync(path.join(publicRoot, 'gate-topper-notes/linear-algebra-lab/index.html'))
    ).toBe(true);
  });
});
