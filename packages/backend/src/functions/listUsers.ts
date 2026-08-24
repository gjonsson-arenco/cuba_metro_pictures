import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { ok, unauthorized, forbidden, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, canManageUsers } from '../lib/auth';
import {
  cognito,
  USER_POOL_ID,
  ADMIN_GROUP,
  EDITOR_GROUP,
  listUsernamesInGroup,
  toManagedUser
} from '../lib/cognito';
import { ListUsersResponse, ManagedUser } from '@metro/shared';

const MAX_PAGES = 20;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();
    const user = await verifyToken(token);
    if (!canManageUsers(user)) return forbidden('Se requiere rol admin');

    // Two group lookups instead of one AdminListGroupsForUser per user.
    const [admins, editors] = await Promise.all([
      listUsernamesInGroup(ADMIN_GROUP),
      listUsernamesInGroup(EDITOR_GROUP)
    ]);

    const users: ManagedUser[] = [];
    let pagination: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await cognito.send(
        new ListUsersCommand({ UserPoolId: USER_POOL_ID, Limit: 60, PaginationToken: pagination })
      );
      for (const u of res.Users ?? []) {
        const name = u.Username ?? '';
        const role = admins.has(name) ? 'admin' : editors.has(name) ? 'editor' : 'viewer';
        users.push(toManagedUser(u, role));
      }
      pagination = res.PaginationToken;
      if (!pagination) break;
    }

    users.sort((a, b) => a.email.localeCompare(b.email));

    const response: ListUsersResponse = { users };
    return ok(response);
  } catch (err) {
    console.error('listUsers error:', err);
    return internalError();
  }
};
