import html2canvas from 'html2canvas';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureElementToDataUrl } from '@/lib/image';
import { THEME_COLORS } from '@/lib/theme';

vi.mock('html2canvas', () => ({ default: vi.fn() }));

class InstantImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 640;
  height = 360;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('element screenshot capture', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', InstantImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/jpeg;base64,AAAA'
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('applies light mode only to the cloned capture document', async () => {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({ width: 640, height: 360 }) as DOMRect;

    let clonedTheme: string | undefined;
    let clonedColorScheme = '';
    let cloneOverflow = '';
    vi.mocked(html2canvas).mockImplementation(async (_element, options) => {
      const clonedDocument = document.implementation.createHTMLDocument('capture');
      clonedDocument.documentElement.dataset.theme = 'dark';
      clonedDocument.documentElement.style.colorScheme = 'dark';
      const clone = clonedDocument.createElement('div');
      await options?.onclone?.(clonedDocument, clone);
      clonedTheme = clonedDocument.documentElement.dataset.theme;
      clonedColorScheme = clonedDocument.documentElement.style.colorScheme;
      cloneOverflow = clone.style.overflow;
      return clonedDocument.createElement('canvas');
    });

    await expect(captureElementToDataUrl(element, { theme: 'light' })).resolves.toMatch(
      /^data:image\/jpeg;base64,/
    );

    expect(vi.mocked(html2canvas)).toHaveBeenCalledWith(
      element,
      expect.objectContaining({ backgroundColor: THEME_COLORS.light })
    );
    expect(clonedTheme).toBe('light');
    expect(clonedColorScheme).toBe('light');
    expect(cloneOverflow).toBe('visible');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
