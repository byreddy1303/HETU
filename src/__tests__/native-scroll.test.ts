import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('native document scrolling', () => {
  it('does not turn the Android body into a non-scrolling overflow container', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const nativeBodyRule = stylesheet.match(/html\[data-native\] body\s*\{(?<rules>[\s\S]*?)\}/)
      ?.groups?.rules;

    expect(nativeBodyRule).toContain('overflow-x: clip');
    expect(nativeBodyRule).not.toContain('overflow-x: hidden');
  });
});
