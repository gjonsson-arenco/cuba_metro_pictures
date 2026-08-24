import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { ALLOWED_MIME_TYPES } from '@metro/shared';

interface UploadFile {
  file: File;
  preview: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
  photoId?: string;
}

interface UploadZoneProps {
  onFilesReady: (files: UploadFile[]) => void;
  isUploading: boolean;
}

export type { UploadFile };

export default function UploadZone({ onFilesReady, isUploading }: UploadZoneProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function processFiles(rawFiles: File[]) {
    const valid: UploadFile[] = [];
    for (const file of rawFiles) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) continue;
      const preview = URL.createObjectURL(file);
      valid.push({ file, preview, progress: 0, status: 'pending' });
    }
    const combined = [...files, ...valid].slice(0, 100);
    setFiles(combined);
    onFilesReady(combined);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const rawFiles = Array.from(e.dataTransfer.files);
    processFiles(rawFiles);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(e.target.files ?? []);
    processFiles(rawFiles);
  }

  function removeFile(index: number) {
    URL.revokeObjectURL(files[index].preview);
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    onFilesReady(updated);
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragging ? 'border-cuba-navy bg-cuba-navy/5' : 'border-cuba-navy/25 hover:border-cuba-navy hover:bg-cuba-cream'
        }`}
      >
        <div className="text-5xl mb-3">📷</div>
        <p className="text-lg font-semibold text-gray-700">
          Arrastrá fotos aquí o hacé click para seleccionar
        </p>
        <p className="text-sm text-gray-500 mt-1">
          JPG, PNG, WebP — sin límite de tamaño — hasta 100 fotos
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {files.map((f, i) => (
            <div key={i} className="relative group aspect-square">
              <img
                src={f.preview}
                alt={f.file.name.replace(/[<>"'&]/g, '')}
                className="w-full h-full object-cover rounded-lg"
              />
              {f.status === 'uploading' && (
                <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">{f.progress}%</span>
                </div>
              )}
              {f.status === 'done' && (
                <div className="absolute inset-0 bg-green-500/30 rounded-lg flex items-center justify-center">
                  <span className="text-white text-2xl">✓</span>
                </div>
              )}
              {f.status === 'error' && (
                <div className="absolute inset-0 bg-red-500/30 rounded-lg flex items-center justify-center">
                  <span className="text-white text-2xl">✗</span>
                </div>
              )}
              {!isUploading && f.status === 'pending' && (
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs hidden group-hover:flex items-center justify-center"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
