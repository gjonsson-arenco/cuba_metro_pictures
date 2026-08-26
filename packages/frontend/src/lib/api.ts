import axios from 'axios';
import JSZip from 'jszip';
import { isTouchDevice } from './device';
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
  RegattaDay,
  ListUsersResponse,
  CreateUserRequest,
  CreateUserResponse,
  UpdateUserRequest,
  UpdateUserResponse,
  DeleteUserResponse,
  ResetUserPasswordResponse,
  GetSettingsResponse,
  UpdateSettingsRequest,
  UpdateSettingsResponse
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

// ── Downloads ─────────────────────────────────────────────────────────────
// iOS has no web API that can write into the Photos app: an `<a download>` --
// like any `Content-Disposition: attachment` -- lands in Archivos. The only
// route to the camera roll is the native share sheet, where the user gets
// "Guardar en Fotos". So on touch devices we share, and everywhere else we
// keep the plain download (a share dialog on desktop would be a regression).

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

function mimeFromName(filename: string): string {
  return IMAGE_MIME[filename.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/jpeg';
}

/**
 * Whether this device offers the share sheet for image files. Used for copy
 * ("Guardar en Fotos" vs "Descargar"); the actual flow re-checks per file set,
 * because `canShare` also weighs how many files and how big they are.
 */
export function canSharePhotos(): boolean {
  if (!isTouchDevice()) return false;
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    // A byte, not an empty blob: some implementations reject a zero-length file.
    const probe = new File([new Uint8Array(1)], 'probe.jpg', { type: 'image/jpeg' });
    return navigator.canShare?.({ files: [probe] }) === true;
  } catch {
    return false;
  }
}

function canShareFiles(files: File[]): boolean {
  if (!isTouchDevice()) return false;
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  try {
    return navigator.canShare?.({ files }) === true;
  } catch {
    return false;
  }
}

/** True when the share sheet handled it (including a deliberate cancel). */
async function shareFiles(files: File[], title: string): Promise<boolean> {
  if (!canShareFiles(files)) return false;
  try {
    await navigator.share({ files, title });
    return true;
  } catch (err) {
    // The user dismissed the sheet: a finished interaction, not a failure.
    if ((err as Error)?.name === 'AbortError') return true;
    // NotAllowedError shows up when Safari's transient activation expired while
    // the originals were downloading. Falling through to Archivos beats
    // silently doing nothing.
    console.warn('Share sheet unavailable, falling back to download:', err);
    return false;
  }
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

async function fetchPhotoFile(photoId: string, fallbackName?: string): Promise<File> {
  const info = await getDownloadInfo(photoId);
  const res = await fetch(info.url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const filename = info.filename || fallbackName || `${photoId}.jpg`;
  return new File([blob], filename, { type: blob.type || mimeFromName(filename) });
}

export async function downloadSinglePhoto(photoId: string): Promise<void> {
  const file = await fetchPhotoFile(photoId);
  if (await shareFiles([file], file.name)) return;
  triggerBrowserDownload(file, file.name);
}

/**
 * Selection download. On a phone this hands every original to the share sheet
 * so they can go straight to Fotos; elsewhere (and when the set is too big for
 * the sheet) it falls back to a single zip, which no phone can file in Fotos.
 */
export async function downloadPhotos(
  photos: Photo[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  if (photos.length === 0) return;
  if (photos.length === 1) {
    await downloadSinglePhoto(photos[0].photoId);
    return;
  }

  const seen = new Map<string, number>();
  const files: File[] = [];
  let done = 0;

  await Promise.all(photos.map(async (p) => {
    try {
      const file = await fetchPhotoFile(p.photoId, `${p.photoId}.jpg`);
      // Two originals can share a filename; a zip entry (and a share sheet)
      // needs them distinct.
      const count = seen.get(file.name) ?? 0;
      seen.set(file.name, count + 1);
      if (count === 0) {
        files.push(file);
      } else {
        const dot = file.name.lastIndexOf('.');
        const name = dot > 0
          ? `${file.name.slice(0, dot)}_${count}${file.name.slice(dot)}`
          : `${file.name}_${count}`;
        files.push(new File([file], name, { type: file.type }));
      }
    } catch (err) {
      console.warn('Skipping', p.photoId, err);
    } finally {
      done += 1;
      onProgress?.(done, photos.length);
    }
  }));

  if (files.length === 0) throw new Error('No se pudo descargar ninguna foto');
  if (await shareFiles(files, 'Metropolitano 2026')) return;

  const zip = new JSZip();
  files.forEach(f => zip.file(f.name, f));
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

// ── User management (admin only) ──────────────────────────────────────────

export async function listUsers(): Promise<ListUsersResponse> {
  const { data } = await api.get<ListUsersResponse>('/users');
  return data;
}

export async function createUser(payload: CreateUserRequest): Promise<CreateUserResponse> {
  const { data } = await api.post<CreateUserResponse>('/users', payload);
  return data;
}

export async function updateUser(username: string, payload: UpdateUserRequest): Promise<UpdateUserResponse> {
  const { data } = await api.put<UpdateUserResponse>(`/users/${encodeURIComponent(username)}`, payload);
  return data;
}

export async function deleteUser(username: string): Promise<DeleteUserResponse> {
  const { data } = await api.delete<DeleteUserResponse>(`/users/${encodeURIComponent(username)}`);
  return data;
}

export async function resetUserPassword(username: string): Promise<ResetUserPasswordResponse> {
  const { data } = await api.post<ResetUserPasswordResponse>(
    `/users/${encodeURIComponent(username)}/reset-password`
  );
  return data;
}

// ── Site settings ─────────────────────────────────────────────────────────

export async function getSettings(): Promise<GetSettingsResponse> {
  const { data } = await api.get<GetSettingsResponse>('/settings');
  return data;
}

export async function updateSettings(payload: UpdateSettingsRequest): Promise<UpdateSettingsResponse> {
  const { data } = await api.put<UpdateSettingsResponse>('/settings', payload);
  return data;
}

export default api;
