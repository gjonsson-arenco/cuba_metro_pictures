import { useState } from 'react';
import { Photo, SAILING_CLASS_LABELS, REGATTA_DAY_LABELS } from '@metro/shared';

interface PhotoGridProps {
  photos: Photo[];
  onPhotoClick: (index: number) => void;
  selected: Set<string>;
  onToggleSelect: (photoId: string) => void;
  /** Admin or editor: can rotate, delete and edit metadata. */
  canEdit?: boolean;
  onRotate?: (photoId: string, direction: 'cw' | 'ccw') => Promise<void> | void;
  onDelete?: (photoId: string) => Promise<void> | void;
}

type BusyAction = 'rotate-cw' | 'rotate-ccw' | 'delete';

export default function PhotoGrid({
  photos,
  onPhotoClick,
  selected,
  onToggleSelect,
  canEdit = false,
  onRotate,
  onDelete
}: PhotoGridProps) {
  const [busy, setBusy] = useState<{ id: string; action: BusyAction } | null>(null);

  async function runAction(photoId: string, action: BusyAction, fn: () => Promise<void> | void) {
    if (busy) return;
    setBusy({ id: photoId, action });
    try { await fn(); } finally { setBusy(null); }
  }

  if (photos.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <div className="text-5xl mb-4">📷</div>
        <p className="text-lg">No hay fotos para mostrar</p>
        <p className="text-sm mt-1">Probá con otros filtros o volvé más tarde</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {photos.map((photo, index) => {
        const isSelected = selected.has(photo.photoId);
        const thumbSrc = photo.urls?.thumbnail ?? photo.urls?.medium ?? photo.urls?.original ?? photo.s3Key;
        const isBusy = busy?.id === photo.photoId;
        return (
          <div
            key={photo.photoId}
            className={`group relative aspect-square overflow-hidden rounded-xl cursor-pointer shadow-card hover:shadow-lg transition-all ${
              isSelected ? 'ring-4 ring-white' : ''
            }`}
            onClick={() => onPhotoClick(index)}
          >
            <img
              src={thumbSrc}
              alt={photo.filename}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(photo.photoId); }}
              aria-label={isSelected ? 'Deseleccionar' : 'Seleccionar'}
              className={`absolute top-2 left-2 w-7 h-7 rounded-md flex items-center justify-center border-2 text-sm font-bold transition-all ${
                isSelected
                  ? 'bg-white border-white text-cuba-navy'
                  : 'bg-white/85 border-white text-transparent hover:text-cuba-navy opacity-0 group-hover:opacity-100'
              }`}
            >
              {isSelected ? '✓' : '○'}
            </button>

            {canEdit && (onRotate || onDelete) && (
              <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {onRotate && (
                  <>
                    <GridActionButton
                      label="Rotar antihorario"
                      icon="↺"
                      disabled={isBusy}
                      loading={busy?.action === 'rotate-ccw' && isBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void runAction(photo.photoId, 'rotate-ccw', () => onRotate(photo.photoId, 'ccw'));
                      }}
                    />
                    <GridActionButton
                      label="Rotar horario"
                      icon="↻"
                      disabled={isBusy}
                      loading={busy?.action === 'rotate-cw' && isBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void runAction(photo.photoId, 'rotate-cw', () => onRotate(photo.photoId, 'cw'));
                      }}
                    />
                  </>
                )}
                {onDelete && (
                  <GridActionButton
                    label="Eliminar"
                    icon="🗑"
                    danger
                    disabled={isBusy}
                    loading={busy?.action === 'delete' && isBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!window.confirm('¿Eliminar esta foto?')) return;
                      void runAction(photo.photoId, 'delete', () => onDelete(photo.photoId));
                    }}
                  />
                )}
              </div>
            )}

            {photo.tags.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                <div className="flex flex-wrap gap-1">
                  {photo.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-white text-xs bg-white/20 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                  {photo.tags.length > 3 && (
                    <span className="text-white text-xs">+{photo.tags.length - 3}</span>
                  )}
                </div>
              </div>
            )}

            {(photo.sailingClass || photo.day) && (
              <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
                {photo.sailingClass && (
                  <span className="inline-flex items-center gap-1 bg-black/70 backdrop-blur text-white text-[10px] px-2 py-1 rounded-full">
                    <img
                      src={`/classes/${photo.sailingClass}.svg`}
                      alt=""
                      aria-hidden
                      className="h-3 w-auto"
                      style={{ filter: 'brightness(0) invert(1)' }}
                    />
                    <span className="hidden sm:inline">{SAILING_CLASS_LABELS[photo.sailingClass]}</span>
                  </span>
                )}
                {photo.day && (
                  <span className="bg-white text-cuba-navy text-[10px] font-semibold px-2 py-1 rounded-full">
                    {REGATTA_DAY_LABELS[photo.day]}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface GridActionButtonProps {
  label: string;
  icon: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
}

function GridActionButton({ label, icon, onClick, disabled, loading, danger }: GridActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded-md flex items-center justify-center text-sm shadow-md transition-colors disabled:opacity-50 ${
        danger
          ? 'bg-red-600/90 hover:bg-red-600 text-white'
          : 'bg-white/90 hover:bg-white text-gray-800'
      }`}
    >
      {loading ? '…' : icon}
    </button>
  );
}
