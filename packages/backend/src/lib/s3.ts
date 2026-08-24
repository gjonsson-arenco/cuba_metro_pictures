import { S3Client, S3ClientConfig } from '@aws-sdk/client-s3';

const endpoint = process.env.AWS_ENDPOINT_URL_S3 ?? process.env.AWS_ENDPOINT_URL;

const config: S3ClientConfig = { region: process.env.AWS_REGION ?? 'us-east-1' };
if (endpoint) {
  config.endpoint = endpoint;
  // Path-style is required by LocalStack/MinIO for presigned URLs to work from the browser
  config.forcePathStyle = true;
  config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test'
  };
  // SDK v3 auto-adds x-amz-checksum-crc32 to presigned PUTs which LocalStack rejects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any).requestChecksumCalculation = 'WHEN_REQUIRED';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any).responseChecksumValidation = 'WHEN_REQUIRED';
}

export const s3Client = new S3Client(config);

export const RAW_BUCKET = process.env.S3_RAW_BUCKET ?? 'metro-photos-raw';
export const PROCESSED_BUCKET = process.env.S3_PROCESSED_BUCKET ?? 'metro-photos-processed';
export const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL ?? '';
