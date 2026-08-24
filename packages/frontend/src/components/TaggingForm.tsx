import { useState, KeyboardEvent } from 'react';
import { MAX_TAGS_PER_PHOTO, validateTag, normalizeTag } from '@metro/shared';

interface TaggingFormProps {
  existingTags: string[];
  onSubmit: (tags: string[]) => void;
  isSubmitting: boolean;
}

export default function TaggingForm({ existingTags, onSubmit, isSubmitting }: TaggingFormProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

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

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Etiquetas (máx. {MAX_TAGS_PER_PHOTO})
        </label>
        <div className="border rounded-lg p-2 flex flex-wrap gap-2 min-h-[48px] bg-white focus-within:ring-2 focus-within:ring-cuba-blue focus-within:border-cuba-blue">
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
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => onSubmit(selectedTags)}
        disabled={isSubmitting || selectedTags.length === 0}
        className="btn-primary w-full"
      >
        {isSubmitting ? 'Guardando...' : `Aplicar ${selectedTags.length} etiqueta(s) a todas las fotos`}
      </button>
    </div>
  );
}
