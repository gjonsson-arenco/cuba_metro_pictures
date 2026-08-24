import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { s3Client, RAW_BUCKET, PROCESSED_BUCKET } from '../lib/s3';
import { dynamoDB, TABLE_NAME } from '../lib/dynamodb';
import { ok, badRequest, unauthorized, notFound, internalError } from '../lib/response';
import { extractBearerToken, verifyToken, isAdmin } from '../lib/auth';
import { RotatePhotoRequest, RotatePhotoResponse, getThumbS3Key, getMediumS3Key } from '@metro/shared';

import type sharp from 'sharp';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharpLib: (input: Buffer) => ReturnType<typeof sharp> = require('sharp');

const THUMB_WIDTH = 300;
const MEDIUM_WIDTH = 800;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const token = extractBearerToken(event.headers?.Authorization ?? event.headers?.authorization);
    if (!token) return unauthorized();
    const user = await verifyToken(token);
    if (!isAdmin(user)) return unauthorized('Admin access required');

    const photoId = event.pathParameters?.photoId;
    if (!photoId) return badRequest('photoId is required');

    let body: RotatePhotoRequest;
    try {
      body = event.body ? JSON.parse(event.body) : { direction: 'cw' };
    } catch {
      return badRequest('Invalid JSON body');
    }
    const delta = body.direction === 'ccw' ? -90 : 90;

    const getResult = await dynamoDB.send(new GetCommand({ TableName: TABLE_NAME, Key: { photoId } }));
    if (!getResult.Item || getResult.Item.isDeleted) return notFound('Photo not found');

    const item = getResult.Item;
    const currentRotation = (item.rotation as number | undefined) ?? 0;
    const newRotation = ((currentRotation + delta) % 360 + 360) % 360;

    const rawKey = item.s3Key as string;
    const rawObj = await s3Client.send(new GetObjectCommand({ Bucket: RAW_BUCKET, Key: rawKey }));
    if (!rawObj.Body) throw new Error('Empty body from S3');

    const chunks: Buffer[] = [];
    for await (const chunk of rawObj.Body as AsyncIterable<Buffer>) {
      chunks.push(Buffer.from(chunk));
    }
    const rawBuffer = Buffer.concat(chunks);

    // First .rotate() bakes EXIF orientation; second applies the user rotation.
    const image = sharpLib(rawBuffer).rotate().rotate(newRotation);
    const metadata = await image.metadata();

    const [thumbBuffer, mediumBuffer] = await Promise.all([
      image.clone().resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer(),
      image.clone().resize(MEDIUM_WIDTH, undefined, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    ]);

    const thumbKey = getThumbS3Key(photoId);
    const mediumKey = getMediumS3Key(photoId);

    await Promise.all([
      s3Client.send(new PutObjectCommand({ Bucket: PROCESSED_BUCKET, Key: thumbKey, Body: thumbBuffer, ContentType: 'image/jpeg' })),
      s3Client.send(new PutObjectCommand({ Bucket: PROCESSED_BUCKET, Key: mediumKey, Body: mediumBuffer, ContentType: 'image/jpeg' }))
    ]);

    await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { photoId },
      UpdateExpression: 'SET rotation = :r, metadata.#w = :w, metadata.#h = :h, updatedAt = :updatedAt, updatedBy = :updatedBy',
      ExpressionAttributeNames: { '#w': 'width', '#h': 'height' },
      ExpressionAttributeValues: {
        ':r': newRotation,
        ':w': metadata.width ?? null,
        ':h': metadata.height ?? null,
        ':updatedAt': new Date().toISOString(),
        ':updatedBy': user.userId
      }
    }));

    const response: RotatePhotoResponse = { success: true, rotation: newRotation };
    return ok(response);
  } catch (err) {
    console.error('rotatePhoto error:', err);
    return internalError();
  }
};
