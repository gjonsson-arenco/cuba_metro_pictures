import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, internalError } from '../lib/response';
import { getSettings } from '../lib/settings';
import { GetSettingsResponse } from '@metro/shared';

/**
 * Public on purpose: the gallery has to know whether to offer the download
 * button to a visitor who is not logged in. Nothing here is sensitive.
 */
export const handler = async (_event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const settings = await getSettings();
    const response: GetSettingsResponse = { settings };
    return ok(response);
  } catch (err) {
    console.error('getSettings error:', err);
    return internalError();
  }
};
