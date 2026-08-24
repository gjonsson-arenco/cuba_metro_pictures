import { useState, KeyboardEvent } from 'react';
import {
  MAX_TAGS_PER_PHOTO,
  validateTag,
  normalizeTag,
  SAILING_CLASSES,
  SAILING_CLASS_LABELS,
  REGATTA_DAYS,
  REGATTA_DAY_LABELS,
  SailingClass,
  RegattaDay
} from '@metro/shared';

interface TaggingFormProps {
  existingTags: string[];
  onSubmit: (payload: { tags: string[]; sailingClass?: SailingClass; day?: RegattaDay }) => void;
  isSubmitting: boolean;
}

export default function TaggingForm({ existingTags, onSubmit, isSubmitting }: TaggingFormProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [sailingClass, setSailingClass] = useState<SailingClass | ''>('');
  const [day, setDay] = useState<RegattaDay | ''>('');

  function handleInput(val: string) {
    setInputValue(val);
    if (val.trim()) {
      setSuggestions(
        existingTags.filter(t => t.includes(val.toLowerCase()) && !selectedTags.includes(t)).slice(0, 8)
      );
    } else {
      setSuggestions([]);
    }
  }

  function addTag(tag: string) {
    const normalized = normalizeTag(tag);
    if (!normalized || !validateTag(normalized) || selectedTags.includes(normalized)) return;
    if (selectedTags.length >= MAX_TAGS_PER_PHOTO) return;
    setSelectedTags(prev => [...prev, normalized]);
    setInputValue('');
    setSuggestions([]);
  }

  function removeTag(tag: string) {
    setSelectedTags(prev => prev.filter(t => t !== tag));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  }

  function handleSubmit() {
    onSubmit({
      tags: selectedTags,
      sailingClass: sailingClass || undefined,
      day: day || undefined
    });
  }

  const hasSomething = selectedTags.length > 0 || !!sailingClass || !!day;

  return (
    <div className="space-y-6">
      {/* Class + Day */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-cuba-navy/70 mb-2">
            Clase (opcional)
          </label>
          <div className="flex flex-wrap gap-2">
            {SAILING_CLASSES.map(cls => (
              <button
                key={cls}
                type="button"
                onClick={() => setSailingClass(prev => (prev === cls ? '' : cls))}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                  sailingClass === cls
                    ? 'bg-cuba-navy text-white border-cuba-navy'
                    : 'bg-white text-cuba-navy border-cuba-navy/20 hover:bg-cuba-cream'
                }`}
              >
                <img
                  src={`/classes/${cls}.svg`}
                  alt=""
                  aria-hidden
                  className="h-4 w-auto"
                  style={sailingClass === cls
                    ? { filter: 'brightness(0) invert(1)' }
                    : { filter: 'brightness(0)' }}
                />
                {SAILING_CLASS_LABELS[cls]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-cuba-navy/70 mb-2">
            Día (opcional)
          </label>
          <div className="flex flex-wrap gap-2">
            {REGATTA_DAYS.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(prev => (prev === d ? '' : d))}
                className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                  day === d
                    ? 'bg-cuba-navy text-white border-cuba-navy'
                    : 'bg-white text-cuba-navy border-cuba-navy/20 hover:bg-cuba-cream'
                }`}
              >
                {REGATTA_DAY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tags */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-cuba-navy/70 mb-2">
          Etiquetas libres (máx. {MAX_TAGS_PER_PHOTO})
        </label>
        <div className="border border-cuba-navy/15 rounded-lg p-2 flex flex-wrap gap-2 min-h-[48px] bg-white focus-within:ring-2 focus-within:ring-cuba-navy focus-within:border-cuba-navy">
          {selectedTags.map(tag => (
            <span key={tag} className="tag-chip tag-chip-active gap-1">
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-red-200 ml-1">×</button>
            </span>
          ))}
          <input
            type="text"
            value={inputValue}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedTags.length < MAX_TAGS_PER_PHOTO ? 'Escribí un tag y presioná Enter...' : ''}
            disabled={selectedTags.length >= MAX_TAGS_PER_PHOTO}
            className="flex-1 min-w-[120px] border-none outline-none text-sm py-1"
          />
        </div>
        {suggestions.length > 0 && (
          <div className="mt-1 border rounded-lg bg-white shadow-sm overflow-hidden">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => addTag(s)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-cuba-cream transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !hasSomething}
        className="btn-primary w-full"
      >
        {isSubmitting ? 'Guardando...' : 'Aplicar a todas las fotos'}
      </button>
    </div>
  );
}
