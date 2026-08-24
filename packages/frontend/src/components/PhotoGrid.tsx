import { Photo } from '@metro/shared';

interface PhotoGridProps {
  photos: Photo[];
  onPhotoClick: (index: number) => void;
}

export default function PhotoGrid({ photos, onPhotoClick }: PhotoGridProps) {
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
      {photos.map((photo, index) => (
        <div
          key={photo.photoId}
          className="group relative aspect-square overflow-hidden rounded-xl cursor-pointer shadow-md hover:shadow-xl transition-shadow"
          onClick={() => onPhotoClick(index)}
        >
          <img
            src={photo.urls?.thumbnail ?? photo.urls?.original ?? photo.s3Key}
            alt={photo.filename}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
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
        </div>
      ))}
    </div>
  );
}
