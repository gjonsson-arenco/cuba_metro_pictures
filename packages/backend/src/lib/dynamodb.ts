import { DynamoDBClient, DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB ?? process.env.AWS_ENDPOINT_URL;

const config: DynamoDBClientConfig = { region: process.env.AWS_REGION ?? 'us-east-1' };
if (endpoint) {
  config.endpoint = endpoint;
  // LocalStack/dynalite accept any credentials but the SDK requires them to be set
  config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test'
  };
}

const client = new DynamoDBClient(config);

export const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true }
});

export const TABLE_NAME = process.env.DYNAMODB_TABLE ?? 'metro-photos';
