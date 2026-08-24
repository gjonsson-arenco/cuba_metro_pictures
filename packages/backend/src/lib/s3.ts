import { S3Client } from '@aws-sdk/client-s3';

export const s3Client = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

export const RAW_BUCKET = process.env.S3_RAW_BUCKET ?? 'metro-photos-raw';
export const PROCESSED_BUCKET = process.env.S3_PROCESSED_BUCKET ?? 'metro-photos-processed';
export const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL ?? '';
