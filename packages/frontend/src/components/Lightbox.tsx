import { useEffect, useCallback } from 'react';
import { Photo } from '@metro/shared';

interface LightboxProps {
  photo: Photo;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export default function Lightbox({ photo, onClose, onPrev, onNext, hasPrev, hasNext }: LightboxProps) {
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft' && hasPrev) onPrev();
    if (e.key === 'ArrowRight' && hasNext) onNext();
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [handleKey]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300 z-10 w-10 h-10 flex items-center justify-center"
      >
        ✕
      </button>

      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10 w-12 h-12 flex items-center justify-center bg-black/30 rounded-full"
        >
          ‹
        </button>
      )}

      <div
        className="relative max-w-5xl max-h-[90vh] mx-16"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photo.urls?.original ?? photo.s3Key}
          alt={photo.filename}
          className="max-h-[80vh] max-w-full object-contain rounded-lg"
        />
        {photo.tags.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 rounded-b-lg p-3 flex flex-wrap gap-2">
            {photo.tags.map(tag => (
              <span key={tag} className="bg-white/20 text-white text-xs px-2 py-1 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10 w-12 h-12 flex items-center justify-center bg-black/30 rounded-full"
        >
          ›
        </button>
      )}
    </div>
  );
}
