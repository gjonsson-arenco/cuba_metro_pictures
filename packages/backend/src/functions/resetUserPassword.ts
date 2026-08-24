import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  AdminSetUserPasswordCommand,
  UserNotFoundException
} from '@aws-sdk/client-cognito-identity-provider';
import { ok, badRequest, unauthorized, forbidden, notFound, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, canManageUsers } from '../lib/auth';
import { cognito, USER_POOL_ID, generatePassword } from '../lib/cognito';
import { ResetUserPasswordResponse } from '@metro/shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();
    const actor = await verifyToken(token);
    if (!canManageUsers(actor)) return forbidden('Se requiere rol admin');

    const username = decodeURIComponent(event.pathParameters?.username ?? '');
    if (!username) return badRequest('Falta el username');

    const password = generatePassword();

    try {
      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: USER_POOL_ID,
          Username: username,
          Password: password,
          // Temporary on purpose: the user picks their own on next sign-in.
          Permanent: false
        })
      );
    } catch (err) {
      if (err instanceof UserNotFoundException) return notFound('Usuario no encontrado');
      throw err;
    }

    // Returned once, shown once in the UI. Nothing persists it. The user
    // must replace it at their next sign-in.
    const response: ResetUserPasswordResponse = { username, password };
    return ok(response);
  } catch (err) {
    console.error('resetUserPassword error:', err);
    return internalError();
  }
};
