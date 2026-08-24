import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDB, TABLE_NAME } from '../lib/dynamodb';
import { ok, badRequest, unauthorized, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, isAdmin } from '../lib/auth';
import { TagPhotosRequest, TagPhotosResponse, validateTags, normalizeTag } from '@metro/shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Auth
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();
    const user = await verifyToken(token);
    if (!isAdmin(user)) return unauthorized('Admin access required');

    if (!event.body) return badRequest('Missing request body');
    let body: TagPhotosRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return badRequest('Invalid JSON body');
    }

    const { photoIds, tags } = body;
    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return badRequest('photoIds must be a non-empty array');
    }
    if (!Array.isArray(tags)) {
      return badRequest('tags must be an array');
    }

    const normalizedTags = tags.map(normalizeTag).filter(Boolean);
    const validation = validateTags(normalizedTags);
    if (!validation.valid) {
      return badRequest(validation.error ?? 'Invalid tags');
    }

    const results = await Promise.allSettled(
      photoIds.map(photoId =>
        dynamoDB.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { photoId },
          UpdateExpression: 'SET tags = :tags, updatedAt = :updatedAt, updatedBy = :updatedBy',
          ExpressionAttributeValues: {
            ':tags': normalizedTags,
            ':updatedAt': new Date().toISOString(),
            ':updatedBy': user.userId
          }
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
