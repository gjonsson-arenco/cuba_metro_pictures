import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { verifyToken } from '../lib/auth';

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
  try {
    const token = event.authorizationToken?.replace('Bearer ', '');
    if (!token) return generatePolicy('user', 'Deny', event.methodArn);

    const user = await verifyToken(token);
    return generatePolicy(user.userId, 'Allow', event.methodArn, { userId: user.userId, groups: user.groups.join(',') });
  } catch (err) {
    console.error('Authorizer error:', err);
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [{ Action: 'execute-api:Invoke', Effect: effect, Resource: resource }]
    },
    context
  };
}
