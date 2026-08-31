import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { db } from '@/lib/db';
import SyllabusTracker from '@/pages/SyllabusTracker';

const USER = '11111111-1111-4111-8111-111111111111';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    userId: USER,
    status: 'signed_in',
    sandbox: true,
    profile: { timezone: 'Asia/Kolkata', exam_date: '2027-02-07' }
  })
}));

describe('SyllabusTracker UI and SyllabusOrbit chart', () => {
  beforeEach(async () => {
    localStorage.clear();
    await Promise.all([
      db.topic_progress.clear(),
      db.questions.clear(),
      db.pyq_attempts.clear(),
      db.reattempts.clear()
    ]);
  });

  it('renders the radial orbit chart with segments and center readout', async () => {
    const { container } = render(
      <MemoryRouter>
        <SyllabusTracker />
      </MemoryRouter>
    );

    // Page renders with header
    expect(screen.getByText('Syllabus tracker')).toBeInTheDocument();
    expect(screen.getByText('GATE CSE scope')).toBeInTheDocument();

    // The orbit chart wrapper is present with an aria-label
    const orbitWrapper = screen.getByLabelText(/of syllabus complete/i);
    expect(orbitWrapper).toBeInTheDocument();

    // SVG contains 12 interactive segment groups (one per subject)
    const svg = container.querySelector('svg[viewBox="0 0 200 200"]');
    expect(svg).toBeTruthy();
    const segmentGroups = svg!.querySelectorAll('g[role="button"]');
    expect(segmentGroups.length).toBe(12);

    // Each segment has a background arc path
    for (const g of segmentGroups) {
      expect(g.querySelector('path')).toBeTruthy();
    }

    // Center readout shows overall percent and topic count
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('topics studied')).toBeInTheDocument();

    // Default footer text
    expect(screen.getByText('12 subjects · Click to jump')).toBeInTheDocument();

    // Hovering a segment updates the center readout and footer
    const algoSegment = svg!.querySelector(
      'g[aria-label^="Algorithms:"]'
    ) as Element;
    expect(algoSegment).toBeTruthy();

    fireEvent.mouseEnter(algoSegment);
    // The hovered subject name appears in the center readout (title attr)
    const orbitCenter = orbitWrapper.querySelector('[title="Algorithms"]');
    expect(orbitCenter).toBeTruthy();
    expect(screen.getByText('Click to view Algorithms')).toBeInTheDocument();

    // Leaving returns to default
    fireEvent.mouseLeave(algoSegment);
    expect(screen.getByText('12 subjects · Click to jump')).toBeInTheDocument();
  });
});
