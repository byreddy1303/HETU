import { useState } from 'react';
import { BookOpen, BookmarkPlus, RefreshCw, SlidersHorizontal, Trash2, Wrench } from 'lucide-react';
import type { RecommendedPyqSelection } from '@/lib/pyq-recommended-selection';
import type { PyqPresetPreference, PyqSavedPrescription } from '@/stores/pyq-preferences';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { plural } from '@/lib/utils';
import './pyq-recommended-setup.css';

const EVERYDAY_FOCUSES = [
  { id: 'custom', label: 'My selection', icon: SlidersHorizontal },
  { id: 'learn', label: 'New questions', icon: BookOpen },
  { id: 'repair', label: 'Review mistakes', icon: Wrench }
] as const;
const SPECIALISED_FOCUSES = [
  { id: 'diagnose', label: 'Find gaps' },
  { id: 'speed', label: 'Improve speed' },
  { id: 'transfer', label: 'Apply ideas to fresh questions' },
  { id: 'mixed-gate', label: 'Mixed GATE practice' }
] as const;
const FOCUS_HELP: Record<PyqPresetPreference, string> = {
  custom: 'Use the subject, question count, and filters you choose.',
  learn: 'Practise questions you have not attempted before.',
  repair: 'Revisit mistakes, uncertain answers, and questions due for review.',
  diagnose: 'Find gaps: sample across subjects to see what needs attention.',
  speed: 'Improve speed: revisit correct answers that took longer than their target time.',
  transfer: 'Apply ideas: try fresh questions or an assigned transfer set.',
  'mixed-gate': 'Mixed GATE practice: work through a broad set across subjects.',
  'full-paper': 'Take an intact official paper in Exam mode.'
};

interface FocusProps {
  preset: PyqPresetPreference;
  onPreset: (preset: PyqPresetPreference) => void;
}

export default function PyqRecommendedSetup({
  preset,
  selection,
  loading,
  error,
  onPreset
}: FocusProps & {
  selection: RecommendedPyqSelection | null;
  loading: boolean;
  error: string | null;
}) {
  // Never present a previous focus's count as the newly requested set.
  const currentSelection = !loading && !error && selection?.preset.id === preset ? selection : null;
  const preflight = currentSelection?.preflight;
  const automatic = preset !== 'custom' && preset !== 'full-paper';
  return (
    <section className="pyq-focus" aria-labelledby="pyq-focus-heading">
      <h3 id="pyq-focus-heading">What would you like to practise?</h3>
      <div className="pyq-focus__choices" role="group" aria-label="Practice focus">
        {EVERYDAY_FOCUSES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            data-focus={id}
            aria-pressed={preset === id}
            onClick={() => onPreset(id)}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <p className="pyq-focus__help">{FOCUS_HELP[preset]}</p>
      {error && (
        <p role="alert" className="pyq-focus__error">
          {error}
        </p>
      )}
      {automatic && !error && (
        <div className="pyq-focus__preview">
          <p role="status">
            {preflight
              ? `${preflight.selectedCount} ${plural(preflight.selectedCount, 'question')} · About ${preflight.estimatedMinutes} min`
              : 'Preparing your set…'}
          </p>
          {preflight?.selectedCount === 0 ? (
            <p className="pyq-focus__help">
              No matching questions. Try My selection or widen your filters.
            </p>
          ) : preflight && preflight.shortfall > 0 ? (
            <p className="pyq-focus__help">
              Only {preflight.selectedCount} of the requested {preflight.requestedCount} questions
              match. Widen your filters for a larger set.
            </p>
          ) : null}
          {currentSelection && preflight && preflight.selectedCount > 0 && (
            <details className="pyq-focus__details">
              <summary>Why this set?</summary>
              <p>
                {preflight.reserve.protected
                  ? 'Unseen full papers stay protected.'
                  : 'Reserved full-paper questions are allowed in this set.'}
              </p>
              <ul>
                {currentSelection.questions.map((question) => {
                  const reasons = [
                    ...(currentSelection.reasonsByQuestionUid[question.id] ?? [])
                      .filter((reason) => reason !== 'all')
                      .map((reason) => reason.replaceAll('-', ' ')),
                    ...(currentSelection.priorityReasonsByQuestionUid[question.id] ?? [])
                  ];
                  return (
                    <li key={question.id}>
                      <span>
                        {question.subject} · {question.year} · Q{question.number}
                      </span>
                      {reasons.length > 0 && <small>{reasons.join(' · ')}</small>}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

/** In the builder's single advanced disclosure, separate from the daily choices. */
export function PyqRecommendationOptions({
  preset,
  onPreset,
  onRegenerate,
  savedPrescriptions,
  onSavePrescription,
  onLoadPrescription,
  onDeletePrescription
}: FocusProps & {
  onRegenerate: () => void;
  savedPrescriptions: PyqSavedPrescription[];
  onSavePrescription: (name: string) => void;
  onLoadPrescription: (prescription: PyqSavedPrescription) => void;
  onDeletePrescription: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const specialised = SPECIALISED_FOCUSES.some((focus) => focus.id === preset);
  function save() {
    if (!name.trim()) return;
    onSavePrescription(name.trim());
    setName('');
  }
  return (
    <div className="pyq-focus-options">
      <div className="pyq-focus-options__goals">
        <label>
          Specialised focus
          <Select
            value={specialised ? preset : ''}
            onChange={(event) => {
              if (event.target.value) onPreset(event.target.value as PyqPresetPreference);
            }}
          >
            <option value="" disabled>
              Choose another focus
            </option>
            {SPECIALISED_FOCUSES.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        {preset !== 'custom' && preset !== 'full-paper' && (
          <Button size="sm" onClick={onRegenerate}>
            <RefreshCw size={14} aria-hidden="true" />
            Refresh question mix
          </Button>
        )}
      </div>
      <div className="pyq-focus-options__saved">
        <label htmlFor="pyq-setup-name">Save this setup</label>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Input
            id="pyq-setup-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Give it a name"
            maxLength={80}
          />
          <Button type="submit" size="sm" disabled={!name.trim()}>
            <BookmarkPlus size={14} aria-hidden="true" />
            Save
          </Button>
        </form>
        {savedPrescriptions.length > 0 && (
          <div className="pyq-focus-options__saved-list">
            {savedPrescriptions.map((prescription) => (
              <span key={prescription.id}>
                <Button size="sm" onClick={() => onLoadPrescription(prescription)}>
                  {prescription.name}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDeletePrescription(prescription.id)}
                  aria-label={`Delete ${prescription.name} setup`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
