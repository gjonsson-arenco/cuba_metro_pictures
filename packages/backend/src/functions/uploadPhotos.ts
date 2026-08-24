import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client, RAW_BUCKET } from '../lib/s3';
import { ok, badRequest, unauthorized, forbidden, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, canManagePhotos } from '../lib/auth';
import {
  PresignedUploadRequest,
  PresignedUploadResponse,
  PresignedUploadItem,
  generatePhotoId,
  getS3Key,
  validateFilename
} from '@metro/shared';

const EXPIRES_IN = 3600; // 1 hour

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Auth
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();

    const user = await verifyToken(token);
    if (!canManagePhotos(user)) return forbidden('Se requiere rol admin o editor');

    // Parse body
    if (!event.body) return badRequest('Missing request body');
    let body: PresignedUploadRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return badRequest('Invalid JSON body');
    }

    const { filenames } = body;
    if (!Array.isArray(filenames) || filenames.length === 0) {
      return badRequest('filenames must be a non-empty array');
    }
    if (filenames.length > 100) {
      return badRequest('Maximum 100 files per upload batch');
    }

    const invalidFiles = filenames.filter(f => !validateFilename(f));
    if (invalidFiles.length > 0) {
      return badRequest(`Invalid file format(s): ${invalidFiles.join(', ')}. Allowed: jpg, png, webp`);
    }

    // Generate presigned URLs
    const uploads: PresignedUploadItem[] = await Promise.all(
      filenames.map(async (filename) => {
        const photoId = generatePhotoId();
        const s3Key = getS3Key(photoId, filename);
        const command = new PutObjectCommand({
          Bucket: RAW_BUCKET,
          Key: s3Key,
          ContentType: getContentType(filename)
        });
        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: EXPIRES_IN });
        return { filename, presignedUrl, photoId, s3Key, expiresIn: EXPIRES_IN };
      })
    );

    const response: PresignedUploadResponse = { uploads };
    return ok(response);
  } catch (err) {
    console.error('uploadPhotos error:', err);
    return internalError();
  }
};

function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  };
  return types[ext ?? ''] ?? 'image/jpeg';
}
