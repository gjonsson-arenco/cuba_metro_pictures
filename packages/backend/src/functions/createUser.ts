import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  UsernameExistsException
} from '@aws-sdk/client-cognito-identity-provider';
import { ok, badRequest, unauthorized, forbidden, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, canManageUsers } from '../lib/auth';
import { cognito, USER_POOL_ID, generatePassword } from '../lib/cognito';
import {
  CreateUserRequest,
  CreateUserResponse,
  ManagedUser,
  isUserRole,
  groupForRole,
  isValidEmail
} from '@metro/shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();
    const actor = await verifyToken(token);
    if (!canManageUsers(actor)) return forbidden('Se requiere rol admin');

    if (!event.body) return badRequest('Falta el body');
    let body: CreateUserRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return badRequest('JSON inválido');
    }

    const email = (body.email ?? '').trim().toLowerCase();
    if (!isValidEmail(email)) return badRequest('Email inválido');
    if (!isUserRole(body.role)) return badRequest('Rol inválido');

    const password = generatePassword();

    try {
      await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' }
          ],
          // One-use credential: the user lands on FORCE_CHANGE_PASSWORD and the
          // LoginPage makes them pick their own on first sign-in. We suppress
          // Cognito's invitation mail -- the admin hands this over out of band.
          TemporaryPassword: password,
          MessageAction: 'SUPPRESS'
        })
      );
    } catch (err) {
      if (err instanceof UsernameExistsException) return badRequest('Ya existe un usuario con ese email');
      throw err;
    }

    const group = groupForRole(body.role);
    if (group) {
      await cognito.send(
        new AdminAddUserToGroupCommand({ UserPoolId: USER_POOL_ID, Username: email, GroupName: group })
      );
    }

    const fresh = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: email })
    );

    const attr = (n: string) => fresh.UserAttributes?.find(a => a.Name === n)?.Value ?? '';
    const user: ManagedUser = {
      username: fresh.Username ?? email,
      email: attr('email') || email,
      role: body.role,
      enabled: fresh.Enabled ?? true,
      status: fresh.UserStatus ?? 'FORCE_CHANGE_PASSWORD',
      createdAt: fresh.UserCreateDate?.toISOString() ?? '',
      lastModifiedAt: fresh.UserLastModifiedDate?.toISOString() ?? ''
    };

    const response: CreateUserResponse = { user, temporaryPassword: password };
    return ok(response);
  } catch (err) {
    console.error('createUser error:', err);
    return internalError();
  }
};
