import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDB, TABLE_NAME } from '../lib/dynamodb';
import { CLOUDFRONT_URL } from '../lib/s3';
import { ok, badRequest, internalError } from '../lib/response';
import { Photo, ListPhotosResponse } from '@metro/shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { limit: limitStr, lastKey: lastKeyStr, tags: tagsStr } = event.queryStringParameters ?? {};
    const limit = Math.min(parseInt(limitStr ?? '20', 10), 100);
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    const lastKey = lastKeyStr ? JSON.parse(decodeURIComponent(lastKeyStr)) : undefined;

    if (isNaN(limit) || limit <= 0) {
      return badRequest('Invalid limit parameter');
    }

    let items: Record<string, unknown>[] = [];
    let newLastKey: Record<string, unknown> | undefined;

    if (tags.length > 0) {
      // Filter by tags using scan with FilterExpression (in production, use GSI)
      const filterParts: string[] = tags.map((_, i) => `contains(tags, :tag${i})`);
      const expressionValues: Record<string, unknown> = {
        ':notDeleted': false
      };
      tags.forEach((tag, i) => { expressionValues[`:tag${i}`] = tag; });

      const result = await dynamoDB.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: `isDeleted = :notDeleted AND ${filterParts.join(' AND ')}`,
        ExpressionAttributeValues: expressionValues,
        Limit: limit * 3, // over-fetch for filter
        ExclusiveStartKey: lastKey
      }));
      items = (result.Items ?? []) as Record<string, unknown>[];
      newLastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } else {
      const result = await dynamoDB.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'isDeleted = :notDeleted',
        ExpressionAttributeValues: { ':notDeleted': false },
        Limit: limit,
        ExclusiveStartKey: lastKey
      }));
      items = (result.Items ?? []) as Record<string, unknown>[];
      newLastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    }

    const photos: Photo[] = items.slice(0, limit).map(item => mapToPhoto(item));

    const response: ListPhotosResponse = {
      photos,
      total: photos.length, // count of photos in this page; use hasMore/lastKey for pagination
      hasMore: newLastKey !== undefined,
      lastKey: newLastKey ? encodeURIComponent(JSON.stringify(newLastKey)) : undefined
    };

    return ok(response);
  } catch (err) {
    console.error('listPhotos error:', err);
    return internalError();
  }
};

function mapToPhoto(item: Record<string, unknown>): Photo {
  const photoId = item.photoId as string;
  const s3Key = item.s3Key as string;
  const s3KeyThumb = item.s3KeyThumb as string | undefined;
  const base = CLOUDFRONT_URL ? `${CLOUDFRONT_URL}/` : '';

  return {
    photoId,
    filename: item.filename as string,
    s3Key,
    s3KeyThumb,
    tags: (item.tags as string[]) ?? [],
    uploadedBy: item.uploadedBy as string,
    uploadedAt: item.uploadedAt as string,
    metadata: item.metadata as Photo['metadata'],
    isDeleted: (item.isDeleted as boolean) ?? false,
    urls: {
      original: `${base}${s3Key}`,
      thumbnail: s3KeyThumb ? `${base}${s3KeyThumb}` : undefined
    }
  };
}
