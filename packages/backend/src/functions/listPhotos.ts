import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDB, TABLE_NAME } from '../lib/dynamodb';
import { CLOUDFRONT_URL } from '../lib/s3';
import { ok, badRequest, internalError } from '../lib/response';
import {
  Photo,
  ListPhotosResponse,
  SailingClass,
  RegattaDay,
  isSailingClass,
  isRegattaDay
} from '@metro/shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const {
      limit: limitStr,
      lastKey: lastKeyStr,
      tags: tagsStr,
      class: classStr,
      day: dayStr
    } = event.queryStringParameters ?? {};
    const limit = Math.min(parseInt(limitStr ?? '20', 10), 100);
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    const sailingClass: SailingClass | undefined = isSailingClass(classStr) ? classStr : undefined;
    const day: RegattaDay | undefined = isRegattaDay(dayStr) ? dayStr : undefined;
    const lastKey = lastKeyStr ? JSON.parse(decodeURIComponent(lastKeyStr)) : undefined;

    if (isNaN(limit) || limit <= 0) {
      return badRequest('Invalid limit parameter');
    }

    const expressionValues: Record<string, unknown> = { ':notDeleted': false };
    const filterParts: string[] = ['isDeleted = :notDeleted'];

    tags.forEach((tag, i) => {
      expressionValues[`:tag${i}`] = tag;
      filterParts.push(`contains(tags, :tag${i})`);
    });

    if (sailingClass) {
      expressionValues[':cls'] = sailingClass;
      filterParts.push('sailingClass = :cls');
    }
    if (day) {
      expressionValues[':day'] = day;
      filterParts.push('#d = :day');
    }

    const overFetch = tags.length > 0 || sailingClass || day ? limit * 3 : limit;

    const result = await dynamoDB.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: day ? { '#d': 'day' } : undefined,
      Limit: overFetch,
      ExclusiveStartKey: lastKey
    }));

    const items = (result.Items ?? []) as Record<string, unknown>[];
    const newLastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;

    const photos: Photo[] = items.slice(0, limit).map(item => mapToPhoto(item));

    const response: ListPhotosResponse = {
      photos,
      total: photos.length,
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
  const s3KeyMedium = item.s3KeyMedium as string | undefined;
  const base = CLOUDFRONT_URL ? `${CLOUDFRONT_URL}/` : '';

  const cls = item.sailingClass;
  const dayVal = item.day;

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
    rotation: (item.rotation as number | undefined) ?? 0,
    sailingClass: isSailingClass(cls) ? cls : undefined,
    day: isRegattaDay(dayVal) ? dayVal : undefined,
    urls: {
      original: `${base}${s3Key}`,
      thumbnail: s3KeyThumb ? `${base}${s3KeyThumb}` : undefined,
      medium: s3KeyMedium ? `${base}${s3KeyMedium}` : undefined
    }
  };
}
