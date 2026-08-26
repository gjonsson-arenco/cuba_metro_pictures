/**
 * The download route lost its API Gateway authorizer when anonymous downloads
 * became a runtime setting, so the handler is now the only thing standing
 * between a visitor and the originals. These cover that gate.
 */
import { APIGatewayProxyEvent } from 'aws-lambda';

const send = jest.fn();
const verify = jest.fn();

jest.mock('../lib/dynamodb', () => ({
  dynamoDB: { send: (...args: unknown[]) => send(...args) },
  TABLE_NAME: 'test-table'
}));

jest.mock('../lib/s3', () => ({
  s3Client: {},
  RAW_BUCKET: 'test-bucket'
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/photo.jpg')
}));

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: () => ({ verify: (...args: unknown[]) => verify(...args) }) }
}));

import { handler } from '../functions/downloadPhoto';

const PHOTO = { photoId: 'photo_1', s3Key: 'originals/photo_1.jpg', filename: 'regata.jpg', isDeleted: false };

/** GetCommand carries its key in `input`; that is enough to tell the two reads apart. */
function mockTable({ publicDownloads }: { publicDownloads?: boolean }) {
  send.mockImplementation((command: { input?: { Key?: { photoId?: string } } }) => {
    const key = command?.input?.Key?.photoId;
    if (key === '#settings') {
      return Promise.resolve(publicDownloads === undefined ? {} : { Item: { photoId: '#settings', publicDownloads } });
    }
    return Promise.resolve({ Item: PHOTO });
  });
}

function event(authorization?: string): APIGatewayProxyEvent {
  return {
    headers: authorization ? { Authorization: authorization } : {},
    pathParameters: { photoId: 'photo_1' }
  } as unknown as APIGatewayProxyEvent;
}

beforeEach(() => {
  send.mockReset();
  verify.mockReset();
  delete process.env.LOCAL_AUTH_BYPASS;
});

describe('downloadPhoto access', () => {
  it('rejects an anonymous request while publicDownloads is off', async () => {
    mockTable({ publicDownloads: false });
    const res = await handler(event());
    expect(res.statusCode).toBe(401);
  });

  it('rejects an anonymous request when settings were never written', async () => {
    mockTable({});
    const res = await handler(event());
    expect(res.statusCode).toBe(401);
  });

  it('serves an anonymous request while publicDownloads is on', async () => {
    mockTable({ publicDownloads: true });
    const res = await handler(event());
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ filename: 'regata.jpg' });
  });

  it('serves a valid token regardless of the setting', async () => {
    mockTable({ publicDownloads: false });
    verify.mockResolvedValue({ sub: 'u1', 'cognito:groups': [] });
    const res = await handler(event('Bearer good-token'));
    expect(res.statusCode).toBe(200);
  });

  it('rejects an invalid token instead of falling back to the setting', async () => {
    mockTable({ publicDownloads: true });
    verify.mockRejectedValue(new Error('expired'));
    const res = await handler(event('Bearer bad-token'));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).message).toBe('Invalid token');
  });
});
