import axios from 'axios';
import { ListPhotosResponse, PresignedUploadResponse, TagPhotosResponse, DeletePhotoResponse } from '@metro/shared';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
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
}): Promise<ListPhotosResponse> {
  const queryParams: Record<string, string> = {};
  if (params.limit) queryParams.limit = String(params.limit);
  if (params.lastKey) queryParams.lastKey = params.lastKey;
  if (params.tags?.length) queryParams.tags = params.tags.join(',');
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

export async function tagPhotos(photoIds: string[], tags: string[]): Promise<TagPhotosResponse> {
  const { data } = await api.put<TagPhotosResponse>('/photos/tag', { photoIds, tags });
  return data;
}

export async function deletePhoto(photoId: string): Promise<DeletePhotoResponse> {
  const { data } = await api.delete<DeletePhotoResponse>(`/photos/${photoId}`);
  return data;
}

export default api;
