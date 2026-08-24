import {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
  ListUsersInGroupCommand,
  UserType
} from '@aws-sdk/client-cognito-identity-provider';
import { randomInt } from 'node:crypto';
import { ManagedUser, UserRole, ADMIN_GROUP, EDITOR_GROUP, roleFromGroups } from '@metro/shared';

export const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION ?? 'us-east-1'
});

export const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? '';

/** Cognito caps a page at 60; loop defensively so a growing pool stays correct. */
const MAX_PAGES = 20;

export async function listUsernamesInGroup(groupName: string): Promise<Set<string>> {
  const found = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await cognito.send(
      new ListUsersInGroupCommand({ UserPoolId: USER_POOL_ID, GroupName: groupName, NextToken: token })
    );
    for (const u of res.Users ?? []) if (u.Username) found.add(u.Username);
    token = res.NextToken;
    if (!token) break;
  }
  return found;
}

export async function getUserRole(username: string): Promise<UserRole> {
  const res = await cognito.send(
    new AdminListGroupsForUserCommand({ UserPoolId: USER_POOL_ID, Username: username })
  );
  return roleFromGroups((res.Groups ?? []).map(g => g.GroupName ?? ''));
}

export function toManagedUser(u: UserType, role: UserRole): ManagedUser {
  const attr = (name: string) => u.Attributes?.find(a => a.Name === name)?.Value ?? '';
  return {
    username: u.Username ?? '',
    email: attr('email') || (u.Username ?? ''),
    role,
    enabled: u.Enabled ?? false,
    status: u.UserStatus ?? 'UNKNOWN',
    createdAt: u.UserCreateDate?.toISOString() ?? '',
    lastModifiedAt: u.UserLastModifiedDate?.toISOString() ?? ''
  };
}

/**
 * Refuses to leave the pool without an admin. Called before demoting,
 * disabling or deleting one.
 */
export async function isLastAdmin(username: string): Promise<boolean> {
  const admins = await listUsernamesInGroup(ADMIN_GROUP);
  return admins.has(username) && admins.size <= 1;
}

export { ADMIN_GROUP, EDITOR_GROUP };

// Ambiguous glyphs (0/O, 1/l/I) are left out: these passwords get read off a
// screen and retyped by hand.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';
const ALL = UPPER + LOWER + DIGIT;

/** Satisfies the pool policy: 8+ chars, upper, lower and a digit. */
export function generatePassword(length = 14): string {
  const chars = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGIT[randomInt(DIGIT.length)]
  ];
  while (chars.length < length) chars.push(ALL[randomInt(ALL.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
