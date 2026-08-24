import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  AdminGetUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  UserNotFoundException
} from '@aws-sdk/client-cognito-identity-provider';
import { ok, badRequest, unauthorized, forbidden, notFound, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, canManageUsers } from '../lib/auth';
import {
  cognito,
  USER_POOL_ID,
  getUserRole,
  toManagedUser,
  isLastAdmin
} from '../lib/cognito';
import {
  UpdateUserRequest,
  UpdateUserResponse,
  UserRole,
  isUserRole,
  groupForRole
} from '@metro/shared';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();
    const actor = await verifyToken(token);
    if (!canManageUsers(actor)) return forbidden('Se requiere rol admin');

    const username = decodeURIComponent(event.pathParameters?.username ?? '');
    if (!username) return badRequest('Falta el username');

    if (!event.body) return badRequest('Falta el body');
    let body: UpdateUserRequest;
    try {
      body = JSON.parse(event.body);
    } catch {
      return badRequest('JSON inválido');
    }

    if (body.role !== undefined && !isUserRole(body.role)) return badRequest('Rol inválido');
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return badRequest('enabled debe ser booleano');
    }
    if (body.role === undefined && body.enabled === undefined) {
      return badRequest('Nada para actualizar');
    }

    // The pool uses UsernameAttributes: [email], so `username` is a generated
    // UUID. Compare the target's `sub` attribute against the caller's, rather
    // than assuming the two UUIDs coincide.
    let target;
    try {
      target = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
    } catch (err) {
      if (err instanceof UserNotFoundException) return notFound('Usuario no encontrado');
      throw err;
    }
    const targetSub = target.UserAttributes?.find(a => a.Name === 'sub')?.Value ?? '';

    const isSelf = targetSub === actor.userId;
    const losingAdmin = (body.role !== undefined && body.role !== 'admin') || body.enabled === false;

    if (isSelf && losingAdmin) {
      return badRequest('No podés quitarte a vos mismo el rol admin ni deshabilitarte');
    }
    if (losingAdmin && (await isLastAdmin(username))) {
      return badRequest('Es el último admin: asigná otro antes de cambiarlo');
    }

    const currentRole: UserRole = await getUserRole(username);

    if (body.role !== undefined && body.role !== currentRole) {
      const oldGroup = groupForRole(currentRole);
      if (oldGroup) {
        await cognito.send(
          new AdminRemoveUserFromGroupCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            GroupName: oldGroup
          })
        );
      }
      const newGroup = groupForRole(body.role);
      if (newGroup) {
        await cognito.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: USER_POOL_ID,
            Username: username,
            GroupName: newGroup
          })
        );
      }
    }

    if (body.enabled !== undefined) {
      await cognito.send(
        body.enabled
          ? new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: username })
          : new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: username })
      );
    }

    const fresh = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: username })
    );
    const role = body.role ?? currentRole;

    const response: UpdateUserResponse = {
      user: toManagedUser(
        {
          Username: fresh.Username,
          Attributes: fresh.UserAttributes,
          Enabled: fresh.Enabled,
          UserStatus: fresh.UserStatus,
          UserCreateDate: fresh.UserCreateDate,
          UserLastModifiedDate: fresh.UserLastModifiedDate
        },
        role
      )
    };
    return ok(response);
  } catch (err) {
    console.error('updateUser error:', err);
    return internalError();
  }
};