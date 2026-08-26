import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, unauthorized, forbidden, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, canManageUsers } from '../lib/auth';
import { getSettings, putSettings } from '../lib/settings';
import { AppSettings, UpdateSettingsRequest, UpdateSettingsResponse } from '@metro/shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();
    const actor = await verifyToken(token);
    if (!canManageUsers(actor)) return forbidden('Se requiere rol admin');

    if (!event.body) return badRequest('Falta el body');
    let body: UpdateSettingsRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return badRequest('JSON inválido');
    }

    if (body.publicDownloads !== undefined && typeof body.publicDownloads !== 'boolean') {
      return badRequest('publicDownloads debe ser booleano');
    }
    if (body.publicDownloads === undefined) return badRequest('Nada para actualizar');

    const current = await getSettings();
    const next: AppSettings = {
      ...current,
      publicDownloads: body.publicDownloads ?? current.publicDownloads
    };

    const settings = await putSettings(next, actor.email || actor.userId);
    const response: UpdateSettingsResponse = { settings };
    return ok(response);
  } catch (err) {
    console.error('updateSettings error:', err);
    return internalError();
  }
};
