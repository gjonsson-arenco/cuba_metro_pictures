import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context, S3Event } from 'aws-lambda';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, RAW_BUCKET } from '../lib/s3';

import { handler as listPhotos } from '../functions/listPhotos';
import { handler as uploadPhotos } from '../functions/uploadPhotos';
import { handler as tagPhotos } from '../functions/tagPhotos';
import { handler as deletePhoto } from '../functions/deletePhoto';
import { handler as rotatePhoto } from '../functions/rotatePhoto';
import { handler as downloadPhoto } from '../functions/downloadPhoto';
import { handler as updatePhotoMetadata } from '../functions/updatePhotoMetadata';
import { handler as processPhoto } from '../functions/processPhoto';

const PORT = parseInt(process.env.LOCAL_API_PORT ?? '4000', 10);

type LambdaHandler = (event: APIGatewayProxyEvent, ctx: Context) => Promise<APIGatewayProxyResult>;

function toEvent(req: Request, pathParameters: Record<string, string> = {}): APIGatewayProxyEvent {
  return {
    body: req.body != null && Object.keys(req.body).length ? JSON.stringify(req.body) : null,
    headers: req.headers as Record<string, string>,
    multiValueHeaders: {},
    httpMethod: req.method,
    isBase64Encoded: false,
    path: req.path,
    pathParameters,
    queryStringParameters: req.query as Record<string, string>,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: req.path
  };
}

const fakeContext = { awsRequestId: 'local', getRemainingTimeInMillis: () => 30000 } as unknown as Context;

function wrap(handler: LambdaHandler, extractPathParams?: (req: Request) => Record<string, string>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const event = toEvent(req, extractPathParams ? extractPathParams(req) : {});
      const result = await handler(event, fakeContext);
      res.status(result.statusCode);
      if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) {
          if (k.toLowerCase() === 'access-control-allow-origin') continue; // cors() handles this
          res.setHeader(k, String(v));
        }
      }
      res.send(result.body);
    } catch (err) {
      next(err);
    }
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/photos', wrap(listPhotos));
app.post('/upload/presigned', wrap(uploadPhotos));
app.put('/photos/tag', wrap(tagPhotos));
app.delete('/photos/:photoId', wrap(deletePhoto, req => ({ photoId: req.params.photoId })));
app.put('/photos/:photoId/rotate', wrap(rotatePhoto, req => ({ photoId: req.params.photoId })));
app.put('/photos/:photoId/metadata', wrap(updatePhotoMetadata, req => ({ photoId: req.params.photoId })));
app.get('/photos/:photoId/download', wrap(downloadPhoto, req => ({ photoId: req.params.photoId })));

// Local simulation of S3 ObjectCreated trigger for processPhoto.
// The frontend PUTs to a presigned URL; call this endpoint after to run image processing.
app.post('/_local/process/:photoId', async (req, res, next) => {
  try {
    const photoId = req.params.photoId;
    const ext = (req.query.ext as string | undefined) ?? 'jpg';
    const key = `originals/${photoId}.${ext}`;
    const head = await s3Client.send(new HeadObjectCommand({ Bucket: RAW_BUCKET, Key: key }));
    const event: S3Event = {
      Records: [{
        eventVersion: '2.1',
        eventSource: 'aws:s3',
        awsRegion: process.env.AWS_REGION ?? 'us-east-1',
        eventTime: new Date().toISOString(),
        eventName: 'ObjectCreated:Put',
        userIdentity: { principalId: 'local' },
        requestParameters: { sourceIPAddress: '127.0.0.1' },
        responseElements: { 'x-amz-request-id': 'local', 'x-amz-id-2': 'local' },
        s3: {
          s3SchemaVersion: '1.0',
          configurationId: 'local',
          bucket: {
            name: RAW_BUCKET,
            ownerIdentity: { principalId: 'local' },
            arn: `arn:aws:s3:::${RAW_BUCKET}`
          },
          object: {
            key,
            size: head.ContentLength ?? 0,
            eTag: (head.ETag ?? '').replace(/"/g, ''),
            sequencer: '0'
          }
        }
      }]
    };
    await processPhoto(event);
    res.json({ ok: true, photoId, key });
  } catch (err) {
    next(err);
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[local-api] error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: (err as Error).message });
});

app.listen(PORT, () => {
  console.log(`[local-api] listening on http://localhost:${PORT}`);
  console.log('[local-api] endpoints:');
  console.log('  GET    /photos');
  console.log('  POST   /upload/presigned');
  console.log('  PUT    /photos/tag');
  console.log('  DELETE /photos/:photoId');
  console.log('  PUT    /photos/:photoId/metadata  { tags?, sailingClass?, day? }');
  console.log('  PUT    /photos/:photoId/rotate    { direction: "cw" | "ccw" }');
  console.log('  GET    /photos/:photoId/download');
  console.log('  POST   /_local/process/:photoId?ext=jpg   (simulates S3 trigger)');
});
