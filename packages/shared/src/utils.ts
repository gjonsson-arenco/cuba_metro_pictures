import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_MB, MAX_TAG_LENGTH, MAX_TAGS_PER_PHOTO } from './types';

export function validateFilename(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ['jpg', 'jpeg', 'png', 'webp'].includes(ext ?? '');
}

export function validateMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

export function validateFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE_MB * 1024 * 1024;
}

export function validateTag(tag: string): boolean {
  return tag.length > 0 && tag.length <= MAX_TAG_LENGTH && /^[a-zA-Z0-9\s\-_áéíóúÁÉÍÓÚñÑ]+$/.test(tag);
}

export function validateTags(tags: string[]): { valid: boolean; error?: string } {
  if (tags.length > MAX_TAGS_PER_PHOTO) {
    return { valid: false, error: `Maximum ${MAX_TAGS_PER_PHOTO} tags per photo` };
  }
  for (const tag of tags) {
    if (!validateTag(tag)) {
      return { valid: false, error: `Invalid tag: "${tag}"` };
    }
  }
  return { valid: true };
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}

export function generatePhotoId(): string {
  return `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function getS3Key(photoId: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  return `originals/${photoId}.${ext}`;
}

export function getThumbS3Key(photoId: string): string {
  return `thumbnails/${photoId}_thumb.jpg`;
}

export function getMediumS3Key(photoId: string): string {
  return `medium/${photoId}_medium.jpg`;
}
