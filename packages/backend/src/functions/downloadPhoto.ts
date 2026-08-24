import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { s3Client, RAW_BUCKET } from '../lib/s3';
import { dynamoDB, TABLE_NAME } from '../lib/dynamodb';
import { ok, badRequest, notFound, internalError } from '../lib/response';
import { DownloadPhotoResponse } from '@metro/shared';

const EXPIRES_IN = 900;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const photoId = event.pathParameters?.photoId;
    if (!photoId) return badRequest('photoId is required');

    const result = await dynamoDB.send(new GetCommand({ TableName: TABLE_NAME, Key: { photoId } }));
    if (!result.Item || result.Item.isDeleted) return notFound('Photo not found');

    const s3Key = result.Item.s3Key as string;
    const filename = (result.Item.filename as string) ?? `${photoId}.jpg`;

    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: RAW_BUCKET,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, '')}"`
      }),
      { expiresIn: EXPIRES_IN }
    );

    const response: DownloadPhotoResponse = { url, filename, expiresIn: EXPIRES_IN };
    return ok(response);
  } catch (err) {
    console.error('downloadPhoto error:', err);
    return internalError();
  }
};
