import { useEffect, useCallback, useState } from 'react';
import {
  Photo,
  SailingClass,
  RegattaDay,
  SAILING_CLASSES,
  SAILING_CLASS_LABELS,
  REGATTA_DAYS,
  REGATTA_DAY_LABELS
} from '@metro/shared';

interface LightboxProps {
  photo: Photo;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  isAdmin: boolean;
  onDownload?: (photoId: string) => Promise<void> | void;
  onRotate?: (photoId: string, direction: 'cw' | 'ccw') => Promise<void> | void;
  onDelete?: (photoId: string) => Promise<void> | void;
  onMetadata?: (photoId: string, updates: { tags?: string[]; sailingClass?: SailingClass | null; day?: RegattaDay | null }) => Promise<void> | void;
}

export default function Lightbox({
  photo,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  isAdmin,
  onDownload,
  onRotate,
  onDelete,
  onMetadata
}: LightboxProps) {
  const [busy, setBusy] = useState<null | 'download' | 'rotate-cw' | 'rotate-ccw' | 'delete' | 'meta'>(null);

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

  async function runAction(kind: NonNullable<typeof busy>, fn: () => Promise<void> | void) {
    if (busy) return;
    setBusy(kind);
    try { await fn(); } finally { setBusy(null); }
  }

  async function setClass(cls: SailingClass | null) {
    if (!onMetadata) return;
    await runAction('meta', () => onMetadata(photo.photoId, { sailingClass: cls }));
  }
  async function setDay(day: RegattaDay | null) {
    if (!onMetadata) return;
    await runAction('meta', () => onMetadata(photo.photoId, { day }));
  }

  async function removeTag(tag: string) {
    if (!onMetadata) return;
    const newTags = photo.tags.filter(t => t !== tag);
    await runAction('meta', () => onMetadata(photo.photoId, { tags: newTags }));
  }

  const src = photo.urls?.medium ?? photo.urls?.original ?? photo.s3Key;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300 z-10 w-10 h-10 flex items-center justify-center"
        aria-label="Cerrar"
      >
        ✕
      </button>

      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10 w-12 h-12 flex items-center justify-center bg-black/30 rounded-full"
          aria-label="Anterior"
        >
          ‹
        </button>
      )}

      <div
        className="relative max-w-5xl max-h-[90vh] mx-16 flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          key={src}
          src={src}
          alt={photo.filename}
          className="max-h-[72vh] max-w-full object-contain rounded-lg"
        />

        {/* Metadata row */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {photo.sailingClass && (
            <span className="inline-flex items-center gap-2 bg-white/10 text-white text-xs px-3 py-1 rounded-full">
              <img
                src={`/classes/${photo.sailingClass}.svg`}
                alt=""
                aria-hidden
                className="h-3.5 w-auto"
                style={{ filter: 'brightness(0) invert(1)' }}
              />
              {SAILING_CLASS_LABELS[photo.sailingClass]}
            </span>
          )}
          {photo.day && (
            <span className="bg-white text-cuba-navy text-xs font-semibold px-3 py-1 rounded-full">
              {REGATTA_DAY_LABELS[photo.day]}
            </span>
          )}
          {photo.tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 bg-white/15 text-white text-xs px-2 py-1 rounded-full">
              {tag}
              {isAdmin && onMetadata && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => removeTag(tag)}
                  aria-label={`Quitar ${tag}`}
                  title={`Quitar ${tag}`}
                  className="text-white/60 hover:text-white text-sm leading-none disabled:opacity-50"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Action bar */}
        {(onDownload || (isAdmin && (onRotate || onDelete))) && (
          <div className="flex flex-wrap items-center justify-center gap-2 bg-black/50 rounded-full px-3 py-2">
            {onDownload && (
              <ActionButton
                label="Descargar"
                icon="⬇"
                disabled={busy !== null}
                loading={busy === 'download'}
                onClick={() => runAction('download', () => onDownload(photo.photoId))}
              />
            )}
            {isAdmin && onRotate && (
              <>
                <ActionButton
                  label="Rotar ↺"
                  icon="↺"
                  disabled={busy !== null}
                  loading={busy === 'rotate-ccw'}
                  onClick={() => runAction('rotate-ccw', () => onRotate(photo.photoId, 'ccw'))}
                />
                <ActionButton
                  label="Rotar ↻"
                  icon="↻"
                  disabled={busy !== null}
                  loading={busy === 'rotate-cw'}
                  onClick={() => runAction('rotate-cw', () => onRotate(photo.photoId, 'cw'))}
                />
              </>
            )}
            {isAdmin && onDelete && (
              <ActionButton
                label="Eliminar"
                icon="🗑"
                danger
                disabled={busy !== null}
                loading={busy === 'delete'}
                onClick={() => {
                  if (!window.confirm('¿Eliminar esta foto?')) return;
                  return runAction('delete', () => onDelete(photo.photoId));
                }}
              />
            )}
          </div>
        )}

        {/* Admin metadata editor */}
        {isAdmin && onMetadata && (
          <div className="flex flex-col gap-2 bg-black/60 backdrop-blur rounded-2xl px-4 py-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-white/60 w-14">Clase</span>
              {SAILING_CLASSES.map(cls => {
                const active = photo.sailingClass === cls;
                return (
                  <button
                    key={cls}
                    disabled={busy !== null}
                    onClick={() => setClass(active ? null : cls)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors disabled:opacity-50 ${
                      active
                        ? 'bg-white text-black border-white'
                        : 'bg-transparent text-white/85 border-white/25 hover:bg-white/10'
                    }`}
                  >
                    <img
                      src={`/classes/${cls}.svg`}
                      alt=""
                      aria-hidden
                      className="h-3 w-auto"
                      style={active ? { filter: 'brightness(0)' } : { filter: 'brightness(0) invert(1)' }}
                    />
                    {SAILING_CLASS_LABELS[cls]}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-white/60 w-14">Día</span>
              {REGATTA_DAYS.map(d => {
                const active = photo.day === d;
                return (
                  <button
                    key={d}
                    disabled={busy !== null}
                    onClick={() => setDay(active ? null : d)}
                    className={`px-2.5 py-1 rounded-full border text-xs transition-colors disabled:opacity-50 ${
                      active
                        ? 'bg-white text-cuba-navy border-white'
                        : 'bg-transparent text-white/85 border-white/25 hover:bg-white/10'
                    }`}
                  >
                    {REGATTA_DAY_LABELS[d]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 z-10 w-12 h-12 flex items-center justify-center bg-black/30 rounded-full"
          aria-label="Siguiente"
        >
          ›
        </button>
      )}
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
}

function ActionButton({ label, icon, onClick, disabled, loading, danger }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-sm text-white px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
        danger ? 'bg-red-600/80 hover:bg-red-600' : 'bg-white/15 hover:bg-white/25'
      }`}
    >
      <span aria-hidden>{loading ? '…' : icon}</span>
      <span>{label}</span>
    </button>
  );
}
