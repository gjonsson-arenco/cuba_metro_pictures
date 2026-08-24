import { S3Event } from 'aws-lambda';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { s3Client, RAW_BUCKET, PROCESSED_BUCKET } from '../lib/s3';
import { dynamoDB, TABLE_NAME } from '../lib/dynamodb';
import { getThumbS3Key, getMediumS3Key } from '@metro/shared';

import type sharp from 'sharp';

// Sharp is provided via Lambda layer; use require for runtime loading
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharpLib: (input: Buffer) => ReturnType<typeof sharp> = require('sharp');

const THUMB_WIDTH = 300;
const MEDIUM_WIDTH = 800;

export const handler = async (event: S3Event): Promise<void> => {
  await Promise.all(
    event.Records.map(async (record) => {
      const srcKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
      console.log(`Processing: ${srcKey}`);

      try {
        // Extract photoId from key: originals/{photoId}.{ext}
        const match = srcKey.match(/^originals\/(.+)\.(jpg|jpeg|png|webp)$/i);
        if (!match) {
          console.log(`Skipping non-original key: ${srcKey}`);
          return;
        }
        const photoId = match[1];

        // Get original from S3
        const getResult = await s3Client.send(new GetObjectCommand({
          Bucket: RAW_BUCKET,
          Key: srcKey
        }));
        const body = getResult.Body;
        if (!body) throw new Error('Empty body from S3');

        const chunks: Buffer[] = [];
        for await (const chunk of body as AsyncIterable<Buffer>) {
          chunks.push(Buffer.from(chunk));
        }
        const originalBuffer = Buffer.concat(chunks);
        const image = sharpLib(originalBuffer);
        const metadata = await image.metadata();

        // Generate thumbnail
        const thumbBuffer = await image
          .clone()
          .resize(THUMB_WIDTH, THUMB_WIDTH, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer();

        // Generate medium
        const mediumBuffer = await image
          .clone()
          .resize(MEDIUM_WIDTH, undefined, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();

        const thumbKey = getThumbS3Key(photoId);
        const mediumKey = getMediumS3Key(photoId);

        await Promise.all([
          s3Client.send(new PutObjectCommand({
            Bucket: PROCESSED_BUCKET,
            Key: thumbKey,
            Body: thumbBuffer,
            ContentType: 'image/jpeg'
          })),
          s3Client.send(new PutObjectCommand({
            Bucket: PROCESSED_BUCKET,
            Key: mediumKey,
            Body: mediumBuffer,
            ContentType: 'image/jpeg'
          }))
        ]);

        // Save metadata to DynamoDB
        await dynamoDB.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            photoId,
            entityType: 'PHOTO',
            filename: srcKey.split('/').pop() ?? srcKey,
            s3Key: srcKey,
            s3KeyThumb: thumbKey,
            s3KeyMedium: mediumKey,
            tags: [],
            uploadedBy: 'system',
            uploadedAt: new Date().toISOString(),
            isDeleted: false,
            metadata: {
              width: metadata.width,
              height: metadata.height,
              size: record.s3.object.size,
              mimeType: `image/${metadata.format}`
            }
          },
          ConditionExpression: 'attribute_not_exists(photoId)'
        }));

        console.log(`Processed ${photoId}: thumb=${thumbKey}, medium=${mediumKey}`);
      } catch (err) {
        console.error(`Error processing ${srcKey}:`, err);
        throw err;
      }
    })
  );
};
