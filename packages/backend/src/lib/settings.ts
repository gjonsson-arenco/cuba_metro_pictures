import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDB, TABLE_NAME } from './dynamodb';
import { AppSettings, DEFAULT_APP_SETTINGS } from '@metro/shared';

/**
 * Site settings live in the photos table under a reserved partition key.
 *
 * The item deliberately carries no `isDeleted` attribute: listPhotos scans with
 * `FilterExpression: isDeleted = :notDeleted`, and DynamoDB evaluates that to
 * false for an item where the attribute is missing, so this row can never leak
 * into the gallery.
 */
export const SETTINGS_KEY = '#settings';

export async function getSettings(): Promise<AppSettings> {
  const result = await dynamoDB.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { photoId: SETTINGS_KEY } })
  );
  const item = result.Item;
  if (!item) return { ...DEFAULT_APP_SETTINGS };
  return {
    publicDownloads:
      typeof item.publicDownloads === 'boolean'
        ? item.publicDownloads
        : DEFAULT_APP_SETTINGS.publicDownloads
  };
}

export async function putSettings(settings: AppSettings, updatedBy: string): Promise<AppSettings> {
  await dynamoDB.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        photoId: SETTINGS_KEY,
        ...settings,
        updatedBy,
        updatedAt: new Date().toISOString()
      }
    })
  );
  return settings;
}
