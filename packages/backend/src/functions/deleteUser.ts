import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  UserNotFoundException
} from '@aws-sdk/client-cognito-identity-provider';
import { ok, badRequest, unauthorized, forbidden, notFound, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, canManageUsers } from '../lib/auth';
import { cognito, USER_POOL_ID, isLastAdmin } from '../lib/cognito';
import { DeleteUserResponse } from '@metro/shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();
    const actor = await verifyToken(token);
    if (!canManageUsers(actor)) return forbidden('Se requiere rol admin');

    const username = decodeURIComponent(event.pathParameters?.username ?? '');
    if (!username) return badRequest('Falta el username');

    // `username` is the generated UUID (UsernameAttributes: [email]); compare
    // the target's `sub` against the caller's instead of assuming they match.
    let target;
    try {
      target = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
    } catch (err) {
      if (err instanceof UserNotFoundException) return notFound('Usuario no encontrado');
      throw err;
    }
    const targetSub = target.UserAttributes?.find(a => a.Name === 'sub')?.Value ?? '';
    if (targetSub === actor.userId) {
      return badRequest('No podés borrar tu propio usuario');
    }
    if (await isLastAdmin(username)) {
      return badRequest('Es el último admin: asigná otro antes de borrarlo');
    }

    try {
      await cognito.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
    } catch (err) {
      if (err instanceof UserNotFoundException) return notFound('Usuario no encontrado');
      throw err;
    }

    const response: DeleteUserResponse = { success: true };
    return ok(response);
  } catch (err) {
    console.error('deleteUser error:', err);
    return internalError();
  }
};
