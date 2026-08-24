import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { setTokenProvider, getPresignedUrls, uploadToS3, tagPhotos, listPhotos, triggerLocalProcess } from '../lib/api';
import UploadZone, { UploadFile } from '../components/UploadZone';
import TaggingForm from '../components/TaggingForm';

type Step = 'upload' | 'tagging' | 'done';

export default function AdminPage() {
  const { getToken } = useAuth();
  const [step, setStep] = useState<Step>('upload');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploadedPhotoIds, setUploadedPhotoIds] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isTagging, setIsTagging] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setTokenProvider(getToken);
    loadAllTags();
  }, [getToken]);

  async function loadAllTags() {
    try {
      const result = await listPhotos({ limit: 100 });
      const tagSet = new Set<string>();
      result.photos.forEach(p => p.tags.forEach(t => tagSet.add(t)));
      setAllTags(Array.from(tagSet).sort());
    } catch { /* ignore */ }
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setIsUploading(true);
    setErrorMessage('');
    try {
      const filenames = files.map(f => f.file.name);
      const { uploads } = await getPresignedUrls(filenames);

      const photoIds: string[] = [];
      await Promise.allSettled(
        uploads.map(async (upload, i) => {
          files[i].status = 'uploading';
          setFiles(prev => [...prev]);
          try {
            await uploadToS3(upload.presignedUrl, files[i].file, (pct) => {
              files[i].progress = pct;
              setFiles(prev => [...prev]);
            });
            await triggerLocalProcess(upload.photoId, files[i].file.name);
            files[i].status = 'done';
            files[i].photoId = upload.photoId;
            photoIds.push(upload.photoId);
          } catch (err) {
            files[i].status = 'error';
            files[i].error = 'Error al subir';
          }
          setFiles(prev => [...prev]);
        })
      );

      setUploadedPhotoIds(photoIds);
      if (photoIds.length > 0) {
        setStep('tagging');
      } else {
        setErrorMessage('No se pudieron subir las fotos. Intentá de nuevo.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleTagging(payload: { tags: string[]; sailingClass?: import('@metro/shared').SailingClass; day?: import('@metro/shared').RegattaDay }) {
    if (uploadedPhotoIds.length === 0) return;
    setIsTagging(true);
    try {
      const result = await tagPhotos(uploadedPhotoIds, payload);
      setSuccessMessage(`✅ ${result.updatedCount} fotos actualizadas exitosamente`);
      setStep('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar metadata';
      setErrorMessage(msg);
    } finally {
      setIsTagging(false);
    }
  }

  function handleReset() {
    setFiles([]);
    setUploadedPhotoIds([]);
    setStep('upload');
    setSuccessMessage('');
    setErrorMessage('');
    loadAllTags();
  }

  const uploadedCount = files.filter(f => f.status === 'done').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="section-title">Panel de Administración</h1>
        <p className="section-subtitle">Subí y etiquetá fotos del campeonato</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-4 mb-8">
        {['upload', 'tagging', 'done'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              step === s ? 'bg-cuba-navy text-white' :
              (['upload', 'tagging', 'done'].indexOf(step) > i) ? 'bg-green-500 text-white' :
              'bg-gray-200 text-gray-600'
            }`}>
              {i + 1}
            </div>
            <span className="text-sm font-medium capitalize text-gray-700">
              {s === 'upload' ? 'Subir fotos' : s === 'tagging' ? 'Etiquetar' : 'Listo'}
            </span>
            {i < 2 && <div className="w-8 h-0.5 bg-gray-300" />}
          </div>
        ))}
      </div>

      <div className="card p-6">
        {step === 'upload' && (          <div className="space-y-6">
            <UploadZone onFilesReady={setFiles} isUploading={isUploading} />
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}
            <button
              onClick={handleUpload}
              disabled={files.length === 0 || isUploading}
              className="btn-primary w-full"
            >
              {isUploading
                ? `Subiendo... (${uploadedCount}/${files.length})`
                : `Subir ${files.length} foto${files.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {step === 'tagging' && (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-semibold">
                ✅ {uploadedCount} foto{uploadedCount !== 1 ? 's' : ''} subida{uploadedCount !== 1 ? 's' : ''}
                {errorCount > 0 && ` (${errorCount} con error)`}
              </p>
              <p className="text-green-600 text-sm mt-1">
                Ahora podés agregar etiquetas a todas las fotos
              </p>
            </div>
            <TaggingForm existingTags={allTags} onSubmit={handleTagging} isSubmitting={isTagging} />
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-8 space-y-4">
            <div className="text-6xl">🎉</div>
            <p className="text-xl font-bold text-gray-900">{successMessage}</p>
            <button onClick={handleReset} className="btn-primary">
              Subir más fotos
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
