import { useState, useEffect, useRef, useCallback } from 'react';
import { Photo } from '@metro/shared';
import { listPhotos } from '../lib/api';
import PhotoGrid from '../components/PhotoGrid';
import Lightbox from '../components/Lightbox';

const PAGE_SIZE = 24;

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [lastKey, setLastKey] = useState<string | undefined>();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPhotos = useCallback(async (reset = false) => {
    setIsLoading(true);
    try {
      const result = await listPhotos({
        limit: PAGE_SIZE,
        lastKey: reset ? undefined : lastKey,
        tags: selectedTags
      });
      setPhotos(prev => reset ? result.photos : [...prev, ...result.photos]);
      setHasMore(result.hasMore);
      setLastKey(result.lastKey);
      // Extract unique tags from all known photos
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
  }, [selectedTags, lastKey]);

  // Initial load + when filters change
  useEffect(() => {
    setLastKey(undefined);
    loadPhotos(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags]);

  // Infinite scroll
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

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Galería de Fotos</h1>
        <p className="text-gray-600">Campeonato Metropolitano de Vela</p>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-gray-700">Filtrar por etiquetas:</span>
            {selectedTags.length > 0 && (
              <button
                onClick={() => setSelectedTags([])}
                className="text-xs text-cuba-red hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`tag-chip ${selectedTags.includes(tag) ? 'tag-chip-active' : ''}`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <PhotoGrid photos={photos} onPhotoClick={setLightboxIndex} />

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-8" />

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-cuba-blue border-t-transparent" />
        </div>
      )}

      {lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photo={photos[lightboxIndex]}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => (i !== null && i > 0 ? i - 1 : i))}
          onNext={() => setLightboxIndex(i => (i !== null && i < photos.length - 1 ? i + 1 : i))}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < photos.length - 1}
        />
      )}
    </main>
  );
}
