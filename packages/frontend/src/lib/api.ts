import axios from 'axios';
import JSZip from 'jszip';
import {
  ListPhotosResponse,
  PresignedUploadResponse,
  TagPhotosResponse,
  DeletePhotoResponse,
  RotatePhotoResponse,
  DownloadPhotoResponse,
  UpdatePhotoMetadataRequest,
  UpdatePhotoMetadataResponse,
  Photo,
  SailingClass,
  RegattaDay
} from '@metro/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === '1';

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' }
});

// Token injection via interceptor - set externally
let getTokenFn: (() => Promise<string | null>) | null = null;

export function setTokenProvider(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

api.interceptors.request.use(async (config) => {
  if (getTokenFn) {
    const token = await getTokenFn();
    if (token) config.headers.Authorization = 'Bearer ' + token;
  }
  return config;
});

export async function listPhotos(params: {
  limit?: number;
  lastKey?: string;
  tags?: string[];
  sailingClass?: SailingClass;
  day?: RegattaDay;
}): Promise<ListPhotosResponse> {
  const queryParams: Record<string, string> = {};
  if (params.limit) queryParams.limit = String(params.limit);
  if (params.lastKey) queryParams.lastKey = params.lastKey;
  if (params.tags?.length) queryParams.tags = params.tags.join(',');
  if (params.sailingClass) queryParams.class = params.sailingClass;
  if (params.day) queryParams.day = params.day;
  const { data } = await api.get<ListPhotosResponse>('/photos', { params: queryParams });
  return data;
}

export async function getPresignedUrls(filenames: string[]): Promise<PresignedUploadResponse> {
  const { data } = await api.post<PresignedUploadResponse>('/upload/presigned', { filenames });
  return data;
}

export async function uploadToS3(presignedUrl: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  await axios.put(presignedUrl, file, {
    headers: { 'Content-Type': file.type },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    }
  });
}

export async function tagPhotos(
  photoIds: string[],
  updates: { tags?: string[]; sailingClass?: SailingClass | null; day?: RegattaDay | null }
): Promise<TagPhotosResponse> {
  const { data } = await api.put<TagPhotosResponse>('/photos/tag', { photoIds, ...updates });
  return data;
}

export async function updatePhotoMetadata(
  photoId: string,
  updates: UpdatePhotoMetadataRequest
): Promise<UpdatePhotoMetadataResponse> {
  const { data } = await api.put<UpdatePhotoMetadataResponse>(`/photos/${photoId}/metadata`, updates);
  return data;
}

export async function deletePhoto(photoId: string): Promise<DeletePhotoResponse> {
  const { data } = await api.delete<DeletePhotoResponse>(`/photos/${photoId}`);
  return data;
}

export async function rotatePhoto(photoId: string, direction: 'cw' | 'ccw' = 'cw'): Promise<RotatePhotoResponse> {
  const { data } = await api.put<RotatePhotoResponse>(`/photos/${photoId}/rotate`, { direction });
  return data;
}

export async function getDownloadInfo(photoId: string): Promise<DownloadPhotoResponse> {
  const { data } = await api.get<DownloadPhotoResponse>(`/photos/${photoId}/download`);
  return data;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadSinglePhoto(photoId: string): Promise<void> {
  const info = await getDownloadInfo(photoId);
  const res = await fetch(info.url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  triggerBrowserDownload(blob, info.filename);
}

export async function downloadPhotosAsZip(
  photos: Photo[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (photos.length === 0) return;
  const zip = new JSZip();
  const seen = new Map<string, number>();
  let done = 0;

  await Promise.all(photos.map(async (p) => {
    try {
      const info = await getDownloadInfo(p.photoId);
      const res = await fetch(info.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      let name = info.filename || `${p.photoId}.jpg`;
      const count = seen.get(name) ?? 0;
      seen.set(name, count + 1);
      if (count > 0) {
        const dot = name.lastIndexOf('.');
        name = dot > 0 ? `${name.slice(0, dot)}_${count}${name.slice(dot)}` : `${name}_${count}`;
      }
      zip.file(name, blob);
    } catch (err) {
      console.warn('Skipping', p.photoId, err);
    } finally {
      done += 1;
      onProgress?.(done, photos.length);
    }
  }));

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  triggerBrowserDownload(zipBlob, `campeonato-metro-${stamp}.zip`);
}

/** In local mode, simulate the S3 ObjectCreated trigger that runs Sharp processing. */
export async function triggerLocalProcess(photoId: string, filename: string): Promise<void> {
  if (!LOCAL_MODE) return;
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  try {
    await axios.post(`${BASE_URL}/_local/process/${photoId}`, null, { params: { ext } });
  } catch (err) {
    console.warn('Local processing trigger failed for', photoId, err);
  }
}

export default api;
