import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { AuthUser, ADMIN_GROUP } from '@metro/shared';

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID ?? '';
const CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? '';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID,
      tokenUse: 'access',
      clientId: CLIENT_ID
    });
  }
  return verifier;
}

export async function verifyToken(token: string): Promise<AuthUser> {
  const payload = await getVerifier().verify(token);
  const groups: string[] = (payload['cognito:groups'] as string[]) ?? [];
  return {
    userId: payload.sub,
    email: (payload.email as string) ?? '',
    groups
  };
}

export function isAdmin(user: AuthUser): boolean {
  return user.groups.includes(ADMIN_GROUP);
}

export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}
