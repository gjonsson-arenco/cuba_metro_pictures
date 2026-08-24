// Photo entity
export interface Photo {
  photoId: string;
  filename: string;
  s3Key: string;
  s3KeyThumb?: string;
  tags: string[];
  uploadedBy: string;
  uploadedAt: string;
  metadata?: PhotoMetadata;
  isDeleted: boolean;
  urls?: PhotoUrls;
  /** Cumulative rotation applied on top of the EXIF-normalized original, in degrees (0/90/180/270). */
  rotation?: number;
  sailingClass?: SailingClass;
  day?: RegattaDay;
}

export interface PhotoMetadata {
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
}

export interface PhotoUrls {
  original: string;
  thumbnail?: string;
  medium?: string;
}

// API Request/Response types
export interface ListPhotosRequest {
  limit?: number;
  offset?: number;
  tags?: string[];
}

export interface ListPhotosResponse {
  photos: Photo[];
  total: number;
  hasMore: boolean;
  lastKey?: string;
}

export interface PresignedUploadRequest {
  filenames: string[];
}

export interface PresignedUploadItem {
  filename: string;
  presignedUrl: string;
  photoId: string;
  s3Key: string;
  expiresIn: number;
}

export interface PresignedUploadResponse {
  uploads: PresignedUploadItem[];
}

export interface TagPhotosRequest {
  photoIds: string[];
  tags?: string[];
  sailingClass?: SailingClass | null;
  day?: RegattaDay | null;
}

export interface TagPhotosResponse {
  success: boolean;
  updatedCount: number;
}

export interface UpdatePhotoMetadataRequest {
  tags?: string[];
  sailingClass?: SailingClass | null;
  day?: RegattaDay | null;
}

export interface UpdatePhotoMetadataResponse {
  success: boolean;
}

export interface DeletePhotoResponse {
  success: boolean;
}

export interface RotatePhotoRequest {
  direction: 'cw' | 'ccw';
}

export interface RotatePhotoResponse {
  success: boolean;
  rotation: number;
}

export interface DownloadPhotoResponse {
  url: string;
  filename: string;
  expiresIn: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// Auth
export interface AuthUser {
  userId: string;
  email: string;
  groups: string[];
}

export const ADMIN_GROUP = 'admin';
export const MAX_TAGS_PER_PHOTO = 10;
export const MAX_TAG_LENGTH = 50;
/** 0 disables the client/shared size check. */
export const MAX_FILE_SIZE_MB = 0;
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Sailing metadata
export type SailingClass = 'optimist' | 'ilca' | '29er' | '420';
export type RegattaDay = 'day1' | 'day2' | 'day3' | 'day4';

export const SAILING_CLASSES: SailingClass[] = ['optimist', 'ilca', '29er', '420'];
export const REGATTA_DAYS: RegattaDay[] = ['day1', 'day2', 'day3', 'day4'];

export const SAILING_CLASS_LABELS: Record<SailingClass, string> = {
  optimist: 'Optimist',
  ilca: 'ILCA',
  '29er': '29er',
  '420': '420'
};

export const REGATTA_DAY_LABELS: Record<RegattaDay, string> = {
  day1: 'Día 1',
  day2: 'Día 2',
  day3: 'Día 3',
  day4: 'Día 4'
};

export function isSailingClass(v: unknown): v is SailingClass {
  return typeof v === 'string' && (SAILING_CLASSES as string[]).includes(v);
}

export function isRegattaDay(v: unknown): v is RegattaDay {
  return typeof v === 'string' && (REGATTA_DAYS as string[]).includes(v);
}
