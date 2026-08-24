import 'dotenv/config';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, ResourceInUseException } from '@aws-sdk/client-dynamodb';
import { S3Client, CreateBucketCommand, PutBucketCorsCommand, BucketAlreadyOwnedByYou, BucketAlreadyExists } from '@aws-sdk/client-s3';

const ENDPOINT = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
const REGION = process.env.AWS_REGION ?? 'us-east-1';
const TABLE = process.env.DYNAMODB_TABLE ?? 'metro-photos-dev';
const RAW = process.env.S3_RAW_BUCKET ?? 'metro-photos-raw-dev';
const PROCESSED = process.env.S3_PROCESSED_BUCKET ?? 'metro-photos-processed-dev';

const credentials = { accessKeyId: 'test', secretAccessKey: 'test' };

const ddb = new DynamoDBClient({ region: REGION, endpoint: ENDPOINT, credentials });
const s3 = new S3Client({ region: REGION, endpoint: ENDPOINT, credentials, forcePathStyle: true });

async function ensureTable() {
  try {
    await ddb.send(new DescribeTableCommand({ TableName: TABLE }));
    console.log(`[bootstrap] table exists: ${TABLE}`);
    return;
  } catch {
    // fallthrough to create
  }
  try {
    await ddb.send(new CreateTableCommand({
      TableName: TABLE,
      BillingMode: 'PAY_PER_REQUEST',
      AttributeDefinitions: [
        { AttributeName: 'photoId', AttributeType: 'S' },
        { AttributeName: 'entityType', AttributeType: 'S' },
        { AttributeName: 'uploadedAt', AttributeType: 'S' }
      ],
      KeySchema: [{ AttributeName: 'photoId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [{
        IndexName: 'byUploadDate-index',
        KeySchema: [
          { AttributeName: 'entityType', KeyType: 'HASH' },
          { AttributeName: 'uploadedAt', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' }
      }]
    }));
    console.log(`[bootstrap] created table: ${TABLE}`);
  } catch (err) {
    if (err instanceof ResourceInUseException) return;
    throw err;
  }
}

async function ensureBucket(name: string, withCors: boolean) {
  try {
    await s3.send(new CreateBucketCommand({ Bucket: name }));
    console.log(`[bootstrap] created bucket: ${name}`);
  } catch (err) {
    if (err instanceof BucketAlreadyOwnedByYou || err instanceof BucketAlreadyExists) {
      console.log(`[bootstrap] bucket exists: ${name}`);
    } else {
      throw err;
    }
  }
  if (withCors) {
    await s3.send(new PutBucketCorsCommand({
      Bucket: name,
      CORSConfiguration: {
        CORSRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
          AllowedOrigins: ['*'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600
        }]
      }
    }));
  }
}

async function main() {
  console.log(`[bootstrap] endpoint=${ENDPOINT} region=${REGION}`);
  await ensureTable();
  await ensureBucket(RAW, true);
  await ensureBucket(PROCESSED, true);
  console.log('[bootstrap] done');
}

main().catch(err => {
  console.error('[bootstrap] failed:', err);
  process.exit(1);
});
