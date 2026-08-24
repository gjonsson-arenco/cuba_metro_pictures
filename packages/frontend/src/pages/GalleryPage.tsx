import { useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Photo,
  SailingClass,
  RegattaDay,
  SAILING_CLASSES,
  SAILING_CLASS_LABELS,
  REGATTA_DAYS,
  REGATTA_DAY_LABELS
} from '@metro/shared';
import {
  listPhotos,
  setTokenProvider,
  downloadSinglePhoto,
  downloadPhotosAsZip,
  rotatePhoto as apiRotate,
  deletePhoto as apiDelete,
  updatePhotoMetadata
} from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import PhotoGrid from '../components/PhotoGrid';
import Lightbox from '../components/Lightbox';

const PAGE_SIZE = 24;

function bustCache(photo: Photo, stamp: number): Photo {
  const bust = (u?: string) => (u ? `${u}${u.includes('?') ? '&' : '?'}v=${stamp}` : u);
  return {
    ...photo,
    urls: photo.urls
      ? {
          original: bust(photo.urls.original) ?? photo.urls.original,
          thumbnail: bust(photo.urls.thumbnail),
          medium: bust(photo.urls.medium)
        }
      : photo.urls
  };
}

function FilterGroup({
  label,
  onClear,
  grow = false,
  wrap = true,
  children
}: {
  label: string;
  onClear?: () => void;
  grow?: boolean;
  wrap?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2 ${grow ? 'flex-1 min-w-[240px]' : 'shrink-0'} ${wrap ? 'flex-wrap' : 'flex-nowrap'}`}>
      <div className="flex items-center gap-2 mr-1 shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-cuba-navy/60">
          {label}
        </span>
        {onClear && (
          <button
            onClick={onClear}
            className="text-[11px] text-cuba-red hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export default function GalleryPage() {
  const { canManagePhotos, user, getToken } = useAuth();
  const isLoggedIn = !!user;
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<SailingClass | null>(null);
  const [selectedDay, setSelectedDay] = useState<RegattaDay | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastKey, setLastKey] = useState<string | undefined>();
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const userTogglingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTokenProvider(getToken);
  }, [getToken]);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      if (userTogglingRef.current) {
        if (y < 20) userTogglingRef.current = false;
        return;
      }
      setFiltersCollapsed(prev => {
        const next = y > 180;
        return next !== prev ? next : prev;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function toggleFilters() {
    userTogglingRef.current = true;
    setFiltersCollapsed(prev => !prev);
  }

  const loadPhotos = useCallback(async (reset = false) => {
    setIsLoading(true);
    try {
      const result = await listPhotos({
        limit: PAGE_SIZE,
        lastKey: reset ? undefined : lastKey,
        tags: selectedTags,
        sailingClass: selectedClass ?? undefined,
        day: selectedDay ?? undefined
      });
      setPhotos(prev => reset ? result.photos : [...prev, ...result.photos]);
      setHasMore(result.hasMore);
      setLastKey(result.lastKey);
      setAllTags(prev => {
        const tagSet = new Set<string>(prev);
        result.photos.forEach(p => p.tags.forEach(t => tagSet.add(t)));
        return Array.from(tagSet).sort();
      });
    } catch (err) {
      console.error('Failed to load photos:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedTags, selectedClass, selectedDay, lastKey]);

  useEffect(() => {
    setLastKey(undefined);
    loadPhotos(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags, selectedClass, selectedDay]);

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !isLoading) {
        loadPhotos(false);
      }
    });
    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);
    return () => observerRef.current?.disconnect();
  }, [hasMore, isLoading, loadPhotos]);

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  }

  function toggleSelect(photoId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const selectedPhotos = useMemo(
    () => photos.filter(p => selectedIds.has(p.photoId)),
    [photos, selectedIds]
  );

  async function handleDownloadSelected() {
    if (selectedPhotos.length === 0) return;
    if (selectedPhotos.length === 1) {
      try {
        await downloadSinglePhoto(selectedPhotos[0].photoId);
      } catch (err) {
        alert('Error al descargar: ' + (err as Error).message);
      }
      return;
    }
    setDownloadProgress({ done: 0, total: selectedPhotos.length });
    try {
      await downloadPhotosAsZip(selectedPhotos, (done, total) => setDownloadProgress({ done, total }));
    } catch (err) {
      alert('Error al descargar: ' + (err as Error).message);
    } finally {
      setDownloadProgress(null);
    }
  }

  async function handleSingleDownload(photoId: string) {
    try {
      await downloadSinglePhoto(photoId);
    } catch (err) {
      alert('Error al descargar: ' + (err as Error).message);
    }
  }

  async function handleRotate(photoId: string, direction: 'cw' | 'ccw') {
    try {
      await apiRotate(photoId, direction);
      const stamp = Date.now();
      setPhotos(prev => prev.map(p => (p.photoId === photoId ? bustCache(p, stamp) : p)));
    } catch (err) {
      alert('Error al rotar: ' + (err as Error).message);
    }
  }

  async function handleDelete(photoId: string) {
    try {
      await apiDelete(photoId);
      setPhotos(prev => prev.filter(p => p.photoId !== photoId));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
      setLightboxIndex(prev => {
        if (prev === null) return prev;
        const nextPhotos = photos.filter(p => p.photoId !== photoId);
        if (nextPhotos.length === 0) return null;
        return Math.min(prev, nextPhotos.length - 1);
      });
    } catch (err) {
      alert('Error al eliminar: ' + (err as Error).message);
    }
  }

  async function handleMetadata(photoId: string, updates: { tags?: string[]; sailingClass?: SailingClass | null; day?: RegattaDay | null }) {
    try {
      await updatePhotoMetadata(photoId, updates);
      setPhotos(prev => prev.map(p => {
        if (p.photoId !== photoId) return p;
        return {
          ...p,
          tags: updates.tags === undefined ? p.tags : updates.tags,
          sailingClass: updates.sailingClass === undefined ? p.sailingClass : updates.sailingClass ?? undefined,
          day: updates.day === undefined ? p.day : updates.day ?? undefined
        };
      }));
    } catch (err) {
      alert('Error al guardar metadata: ' + (err as Error).message);
    }
  }

  const currentLightboxPhoto = lightboxIndex !== null ? photos[lightboxIndex] : null;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
      <div className="mb-8">
        <h1 className="section-title">Galería de Fotos</h1>
        <p className="section-subtitle">Campeonato Metropolitano de Vela · CUBA 2026</p>
      </div>

      {(allTags.length > 0 || true) && (
        <div className="sticky top-20 z-20 mb-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 bg-cuba-cream/95 backdrop-blur">
          <div className="card p-3 sm:p-4">
            {filtersCollapsed ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleFilters}
                  className="text-xs font-semibold uppercase tracking-[0.15em] text-cuba-navy hover:text-cuba-navy-dark inline-flex items-center gap-1.5"
                >
                  <span aria-hidden>▾</span> Filtros
                </button>
                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                  {selectedClass && (
                    <span className="inline-flex items-center gap-1 bg-black text-white text-[11px] px-2 py-1 rounded-full">
                      <img
                        src={`/classes/${selectedClass}.svg`}
                        alt=""
                        aria-hidden
                        className="h-3 w-auto"
                        style={{ filter: 'brightness(0) invert(1)' }}
                      />
                      {SAILING_CLASS_LABELS[selectedClass]}
                    </span>
                  )}
                  {selectedDay && (
                    <span className="bg-cuba-navy text-white text-[11px] font-semibold px-2 py-1 rounded-full">
                      {REGATTA_DAY_LABELS[selectedDay]}
                    </span>
                  )}
                  {selectedTags.map(t => (
                    <span key={t} className="bg-white text-cuba-navy text-[11px] border border-cuba-navy/20 px-2 py-1 rounded-full">
                      {t}
                    </span>
                  ))}
                  {!selectedClass && !selectedDay && selectedTags.length === 0 && (
                    <span className="text-xs text-cuba-navy/50">Sin filtros activos</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 flex-1 min-w-0">
                    {/* Class filters — logos only */}
                    <FilterGroup
                      label="Clase"
                      wrap={false}
                      onClear={selectedClass ? () => setSelectedClass(null) : undefined}
                    >
                      {SAILING_CLASSES.map(cls => {
                        const active = selectedClass === cls;
                        return (
                          <button
                            key={cls}
                            title={SAILING_CLASS_LABELS[cls]}
                            aria-label={SAILING_CLASS_LABELS[cls]}
                            aria-pressed={active}
                            onClick={() => setSelectedClass(prev => (prev === cls ? null : cls))}
                            className={`h-9 px-3 rounded-full border flex items-center justify-center transition-colors ${
                              active
                                ? 'bg-black border-black'
                                : 'bg-white border-black/20 hover:bg-cuba-cream'
                            }`}
                          >
                            <img
                              src={`/classes/${cls}.svg`}
                              alt={SAILING_CLASS_LABELS[cls]}
                              className="h-4 w-auto"
                              style={active
                                ? { filter: 'brightness(0) invert(1)' }
                                : { filter: 'brightness(0)' }}
                            />
                          </button>
                        );
                      })}
                    </FilterGroup>

                    {/* Day filters */}
                    <FilterGroup
                      label="Día"
                      wrap={false}
                      onClear={selectedDay ? () => setSelectedDay(null) : undefined}
                    >
                      {REGATTA_DAYS.map(d => {
                        const active = selectedDay === d;
                        return (
                          <button
                            key={d}
                            onClick={() => setSelectedDay(prev => (prev === d ? null : d))}
                            className={`h-9 px-3 rounded-full border text-sm font-medium transition-colors ${
                              active
                                ? 'bg-cuba-navy text-white border-cuba-navy'
                                : 'bg-white text-cuba-navy border-cuba-navy/20 hover:bg-cuba-cream'
                            }`}
                          >
                            {REGATTA_DAY_LABELS[d]}
                          </button>
                        );
                      })}
                    </FilterGroup>
                  </div>
                  <button
                    onClick={toggleFilters}
                    className="text-xs font-semibold uppercase tracking-[0.15em] text-cuba-navy/60 hover:text-cuba-navy shrink-0 mt-1"
                    aria-label="Colapsar filtros"
                    title="Colapsar filtros"
                  >
                    ▴
                  </button>
                </div>

                {/* Tags row — its own line */}
                {allTags.length > 0 && (
                  <FilterGroup
                    label="Etiquetas"
                    onClear={selectedTags.length > 0 ? () => setSelectedTags([]) : undefined}
                    grow
                  >
                    {allTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className={`tag-chip ${selectedTags.includes(tag) ? 'tag-chip-active' : ''}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </FilterGroup>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <PhotoGrid
        photos={photos}
        onPhotoClick={setLightboxIndex}
        selected={selectedIds}
        onToggleSelect={toggleSelect}
        canEdit={canManagePhotos}
        onRotate={canManagePhotos ? handleRotate : undefined}
        onDelete={canManagePhotos ? handleDelete : undefined}
      />

      <div ref={sentinelRef} className="h-8" />

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-cuba-navy border-t-transparent" />
        </div>
      )}

      {currentLightboxPhoto && (
        <Lightbox
          photo={currentLightboxPhoto}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() => setLightboxIndex(i => (i !== null && i < photos.length - 1 ? i + 1 : i))}
          hasPrev={lightboxIndex !== null && lightboxIndex > 0}
          hasNext={lightboxIndex !== null && lightboxIndex < photos.length - 1}
          canEdit={canManagePhotos}
          onDownload={isLoggedIn ? handleSingleDownload : undefined}
          onRotate={canManagePhotos ? handleRotate : undefined}
          onDelete={canManagePhotos ? handleDelete : undefined}
          onMetadata={canManagePhotos ? handleMetadata : undefined}
        />
      )}

      {/* Floating selection toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-full shadow-2xl px-4 py-3 flex items-center gap-3 z-40">
          <span className="text-sm font-medium">
            {selectedIds.size} seleccionada{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={clearSelection}
            className="text-xs text-gray-300 hover:text-white underline"
          >
            Limpiar
          </button>
          {isLoggedIn ? (
            <button
              onClick={handleDownloadSelected}
              disabled={downloadProgress !== null}
              className="bg-white hover:bg-cuba-cream text-cuba-navy text-sm font-semibold px-4 py-2 rounded-full disabled:opacity-60 shadow-md"
            >
              {downloadProgress
                ? `Descargando ${downloadProgress.done}/${downloadProgress.total}…`
                : selectedIds.size === 1 ? 'Descargar' : 'Descargar zip'}
            </button>
          ) : (
            <Link
              to="/login"
              className="bg-white hover:bg-cuba-cream text-cuba-navy text-sm font-semibold px-4 py-2 rounded-full shadow-md"
            >
              Ingresá para descargar
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
