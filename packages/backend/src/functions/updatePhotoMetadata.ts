import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDB, TABLE_NAME } from '../lib/dynamodb';
import { ok, badRequest, unauthorized, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, isAdmin } from '../lib/auth';
import {
  UpdatePhotoMetadataRequest,
  UpdatePhotoMetadataResponse,
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
    if (!isAdmin(user)) return unauthorized('Admin access required');

    const photoId = event.pathParameters?.photoId;
    if (!photoId) return badRequest('photoId is required');

    if (!event.body) return badRequest('Missing request body');
    let body: UpdatePhotoMetadataRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return badRequest('Invalid JSON body');
    }

    const { tags, sailingClass, day } = body;

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

    await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { photoId },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined
    }));

    const response: UpdatePhotoMetadataResponse = { success: true };
    return ok(response);
  } catch (err) {
    console.error('updatePhotoMetadata error:', err);
    return internalError();
  }
};
