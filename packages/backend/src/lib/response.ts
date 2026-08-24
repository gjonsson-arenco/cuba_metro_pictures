import { APIGatewayProxyResult } from 'aws-lambda';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN ?? '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization'
};

export function ok(body: unknown): APIGatewayProxyResult {
  return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

export function created(body: unknown): APIGatewayProxyResult {
  return { statusCode: 201, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

export function badRequest(message: string): APIGatewayProxyResult {
  return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Bad Request', message }) };
}

export function unauthorized(message = 'Unauthorized'): APIGatewayProxyResult {
  return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Unauthorized', message }) };
}

export function forbidden(message = 'Forbidden'): APIGatewayProxyResult {
  return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Forbidden', message }) };
}

export function notFound(message = 'Not Found'): APIGatewayProxyResult {
  return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not Found', message }) };
}

export function internalError(message = 'Internal Server Error'): APIGatewayProxyResult {
  return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Internal Server Error', message }) };
}

export function noContent(): APIGatewayProxyResult {
  return { statusCode: 204, headers: CORS_HEADERS, body: '' };
}
