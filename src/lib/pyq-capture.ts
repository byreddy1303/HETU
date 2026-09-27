import { captureElementToDataUrl } from '@/lib/image';
import { pyqQuestionSnapshotDataUrl, type PyqQuestion } from '@/lib/pyq';

export const PYQ_CAPTURE_TIMEOUT_MS = 1500;

/** A slow font, image, or canvas must never hold an answer receipt hostage. */
export async function capturePyqSnapshot(
  question: PyqQuestion,
  element: HTMLElement | null
): Promise<string> {
  const fallback = () => pyqQuestionSnapshotDataUrl(question);
  if (!element) return fallback();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const captured = await Promise.race([
      captureElementToDataUrl(element, { theme: 'light' }).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), PYQ_CAPTURE_TIMEOUT_MS);
      })
    ]);
    return captured || fallback();
  } finally {
    clearTimeout(timer);
  }
}
