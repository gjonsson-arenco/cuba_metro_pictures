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
    // En el teléfono, mosaico a sangre: 3 columnas, sin bordes ni márgenes, y
    // el alto de fila atado al ancho de viewport para que la celda sea cuadrada.
    // De `sm` para arriba vuelve la grilla de tarjetas de siempre.
    <div className="-mx-4 grid grid-cols-3 gap-0.5 auto-rows-[33.33vw] sm:mx-0 sm:grid-cols-2 sm:gap-4 sm:auto-rows-auto lg:grid-cols-3">
      {photos.map((photo, index) => {
        const isSelected = selected.has(photo.photoId);
        const thumbSrc = photo.urls?.thumbnail ?? photo.urls?.medium ?? photo.urls?.original ?? photo.s3Key;
        const isBusy = busy?.id === photo.photoId;
        // Una de cada seis ocupa 2x2. El bloque cierra un cuadrado de 3x3
        // exacto, así que la grilla no deja huecos y no hace falta `dense`
        // — que reordenaría las fotos y rompería el orden del visor.
        const isHero = index % 6 === 0;
        // El thumbnail son 300px: sobra para una celda chica y queda borroso
        // estirado a dos tercios de pantalla. Con srcset elige el navegador,
        // que además conoce la densidad del display; hardcodear `medium` en la
        // grande gastaría de más en desktop, donde la celda vuelve a ser chica.
        const srcSet = photo.urls?.thumbnail && photo.urls?.medium
          ? `${photo.urls.thumbnail} 300w, ${photo.urls.medium} 800w`
          : undefined;
        const sizes = srcSet
          ? `(min-width: 1024px) 400px, (min-width: 640px) 50vw, ${isHero ? '67vw' : '34vw'}`
          : undefined;
        return (
          <div
            key={photo.photoId}
            className={`group relative overflow-hidden cursor-pointer transition-all sm:aspect-square sm:rounded-xl sm:shadow-card sm:hover:shadow-lg ${
              isHero ? 'col-span-2 row-span-2 sm:col-span-1 sm:row-span-1' : ''
            } ${isSelected ? 'ring-2 ring-inset ring-white sm:ring-4 sm:ring-offset-0' : ''}`}
            onClick={() => onPhotoClick(index)}
          >
            <img
              src={thumbSrc}
              srcSet={srcSet}
              sizes={sizes}
              alt={photo.filename}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSelect(photo.photoId); }}
              aria-label={isSelected ? 'Deseleccionar' : 'Seleccionar'}
              // En el teléfono va siempre visible: sin hover no habría forma de
              // descubrir que las fotos se pueden seleccionar.
              className={`absolute top-1 left-1 sm:top-2 sm:left-2 w-6 h-6 sm:w-7 sm:h-7 rounded-md flex items-center justify-center border-2 text-sm font-bold transition-all ${
                isSelected
                  ? 'bg-white border-white text-cuba-navy'
                  : 'bg-white/60 border-white/80 text-transparent hover:text-cuba-navy sm:bg-white/85 sm:border-white sm:opacity-0 sm:group-hover:opacity-100'
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

            {/* En las celdas chicas del mosaico las chapitas tapan la foto: en
                el teléfono quedan sólo en la grande. */}
            {(photo.sailingClass || photo.day) && (
              <div className={`absolute bottom-1 left-1 sm:bottom-2 sm:left-2 flex-wrap gap-1 ${isHero ? 'flex' : 'hidden'} sm:flex`}>
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
