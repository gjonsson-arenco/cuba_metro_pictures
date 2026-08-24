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
  tags: string[];
}

export interface TagPhotosResponse {
  success: boolean;
  updatedCount: number;
}

export interface DeletePhotoResponse {
  success: boolean;
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
export const MAX_FILE_SIZE_MB = 10;
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
