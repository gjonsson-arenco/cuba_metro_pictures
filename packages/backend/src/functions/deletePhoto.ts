import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDB, TABLE_NAME } from '../lib/dynamodb';
import { ok, unauthorized, notFound, forbidden, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, canManagePhotos } from '../lib/auth';
import { DeletePhotoResponse } from '@metro/shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();
    const user = await verifyToken(token);
    if (!canManagePhotos(user)) return forbidden('Se requiere rol admin o editor');

    const photoId = event.pathParameters?.photoId;
    if (!photoId) return notFound('photoId is required');

    // Verify photo exists
    const getResult = await dynamoDB.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { photoId }
    }));
    if (!getResult.Item) return notFound('Photo not found');

    // Soft delete
    await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { photoId },
      UpdateExpression: 'SET isDeleted = :deleted, deletedAt = :deletedAt, deletedBy = :deletedBy',
      ExpressionAttributeValues: {
        ':deleted': true,
        ':deletedAt': new Date().toISOString(),
        ':deletedBy': user.userId
      }
    }));

    const response: DeletePhotoResponse = { success: true };
    return ok(response);
  } catch (err) {
    console.error('deletePhoto error:', err);
    return internalError();
  }
};
