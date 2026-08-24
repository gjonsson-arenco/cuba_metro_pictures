import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDB, TABLE_NAME } from '../lib/dynamodb';
import { ok, badRequest, unauthorized, forbidden, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, canManagePhotos } from '../lib/auth';
import {
  TagPhotosRequest,
  TagPhotosResponse,
  validateTags,
  normalizeTag,
  isSailingClass,
  isRegattaDay
} from '@metro/shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();
    const user = await verifyToken(token);
    if (!canManagePhotos(user)) return forbidden('Se requiere rol admin o editor');

    if (!event.body) return badRequest('Missing request body');
    let body: TagPhotosRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return badRequest('Invalid JSON body');
    }

    const { photoIds, tags, sailingClass, day } = body;
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return badRequest('photoIds must be a non-empty array');
    }

    let normalizedTags: string[] | undefined;
    if (Array.isArray(tags)) {
      normalizedTags = tags.map(normalizeTag).filter(Boolean);
      const validation = validateTags(normalizedTags);
      if (!validation.valid) return badRequest(validation.error ?? 'Invalid tags');
    }

    if (sailingClass !== undefined && sailingClass !== null && !isSailingClass(sailingClass)) {
      return badRequest('Invalid sailingClass');
    }
    if (day !== undefined && day !== null && !isRegattaDay(day)) {
      return badRequest('Invalid day');
    }

    const setParts: string[] = ['updatedAt = :updatedAt', 'updatedBy = :updatedBy'];
    const removeParts: string[] = [];
    const values: Record<string, unknown> = {
      ':updatedAt': new Date().toISOString(),
      ':updatedBy': user.userId
    };
    const names: Record<string, string> = {};

    if (normalizedTags !== undefined) {
      setParts.push('tags = :tags');
      values[':tags'] = normalizedTags;
    }
    if (sailingClass !== undefined) {
      if (sailingClass === null) {
        removeParts.push('sailingClass');
      } else {
        setParts.push('sailingClass = :cls');
        values[':cls'] = sailingClass;
      }
    }
    if (day !== undefined) {
      names['#d'] = 'day';
      if (day === null) {
        removeParts.push('#d');
      } else {
        setParts.push('#d = :day');
        values[':day'] = day;
      }
    }

    if (setParts.length === 2 && removeParts.length === 0) {
      return badRequest('Nothing to update');
    }

    let updateExpression = `SET ${setParts.join(', ')}`;
    if (removeParts.length) updateExpression += ` REMOVE ${removeParts.join(', ')}`;

    const results = await Promise.allSettled(
      photoIds.map(photoId =>
        dynamoDB.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { photoId },
          UpdateExpression: updateExpression,
          ExpressionAttributeValues: values,
          ExpressionAttributeNames: Object.keys(names).length ? names : undefined
        }))
      )
    );

    const updatedCount = results.filter(r => r.status === 'fulfilled').length;
    const response: TagPhotosResponse = { success: updatedCount > 0, updatedCount };
    return ok(response);
  } catch (err) {
    console.error('tagPhotos error:', err);
    return internalError();
  }
};
