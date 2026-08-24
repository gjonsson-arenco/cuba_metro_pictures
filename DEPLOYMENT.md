# Guía de Deploy a AWS

## Pre-requisitos

1. Cuenta AWS con permisos para: Lambda, API Gateway, DynamoDB, S3, CloudFront, Cognito, IAM
2. AWS CLI configurado (`aws configure`)
3. AWS SAM CLI instalado (`pip install aws-sam-cli`)
4. Node.js 18+ y pnpm instalados

## Primer deploy (setup inicial)

### 1. Crear bucket para artefactos de SAM

```bash
aws s3 mb s3://metro-photos-sam-artifacts-$(aws sts get-caller-identity --query Account --output text) --region us-east-1
```

### 2. Build y deploy del backend

```bash
# Build
pnpm install
pnpm build

# Build SAM
sam build --template packages/infra/template.yaml

# Deploy (primera vez - modo interactivo)
sam deploy --guided \
  --stack-name metro-photos-prod \
  --parameter-overrides \
    Environment=prod \
    AdminEmail=tu@email.com
```

### 3. Obtener outputs

```bash
aws cloudformation describe-stacks \
  --stack-name metro-photos-prod \
  --query "Stacks[0].Outputs" \
  --output table
```

### 4. Configurar variables del frontend

Crear `packages/frontend/.env.production` con los valores del stack:

```bash
VITE_API_URL=<ApiUrl del output>
VITE_COGNITO_USER_POOL_ID=<UserPoolId del output>
VITE_COGNITO_CLIENT_ID=<UserPoolClientId del output>
```

### 5. Deploy del frontend

```bash
pnpm --filter @metro/frontend build

FRONTEND_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name metro-photos-prod \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
  --output text)

aws s3 sync packages/frontend/dist/ s3://$FRONTEND_BUCKET/ --delete

CLOUDFRONT_DIST=$(aws cloudformation describe-stacks \
  --stack-name metro-photos-prod \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue" \
  --output text)

echo "Frontend disponible en: $CLOUDFRONT_DIST"
```

### 6. Crear usuario administrador en Cognito

```bash
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name metro-photos-prod \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)

# Crear usuario
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username tu@email.com \
  --temporary-password "TempPass123!" \
  --user-attributes Name=email,Value=tu@email.com Name=email_verified,Value=true

# Agregar al grupo admin
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username tu@email.com \
  --group-name admin
```

## CI/CD con GitHub Actions

### Configurar secrets en GitHub

En el repositorio, ir a Settings > Secrets > Actions y agregar:

| Secret | Descripción |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS Access Key ID |
| `AWS_SECRET_ACCESS_KEY` | AWS Secret Access Key |
| `AWS_REGION` | Región AWS (ej: us-east-1) |
| `VITE_API_URL` | URL del API Gateway |
| `VITE_COGNITO_USER_POOL_ID` | ID del User Pool |
| `VITE_COGNITO_CLIENT_ID` | ID del App Client |
| `FRONTEND_BUCKET` | Nombre del bucket S3 del frontend |
| `CLOUDFRONT_DISTRIBUTION_ID` | ID de la distribución CloudFront |
| `SAM_DEPLOYMENT_BUCKET` | Bucket para artefactos SAM |
| `ADMIN_EMAIL` | Email del administrador |

### Deploys automáticos

- **Frontend**: Se despliega automáticamente al hacer push a `main` si hay cambios en `packages/frontend/` o `packages/shared/`
- **Backend**: Se despliega automáticamente al hacer push a `main` si hay cambios en `packages/backend/`, `packages/shared/` o `packages/infra/template.yaml`

## Layer de Sharp para Lambda

La función `processPhoto` requiere Sharp. Crear un Lambda Layer:

```bash
mkdir -p /tmp/sharp-layer/nodejs
cd /tmp/sharp-layer/nodejs
npm install sharp --platform=linux --arch=x64

cd /tmp/sharp-layer
zip -r sharp-layer.zip nodejs/

aws lambda publish-layer-version \
  --layer-name sharp-layer \
  --zip-file fileb://sharp-layer.zip \
  --compatible-runtimes nodejs18.x \
  --compatible-architectures x86_64
```

## Rollback

```bash
# Ver versiones anteriores del stack
aws cloudformation list-stack-resources --stack-name metro-photos-prod

# Revertir a una revisión anterior del frontend
aws s3 cp s3://backup-bucket/previous/ s3://$FRONTEND_BUCKET/ --recursive
```

## Monitoreo y logs

```bash
# Ver logs de una función
sam logs -n ListPhotosFunction --stack-name metro-photos-prod --tail

# Ver alarmas de CloudWatch
aws cloudwatch describe-alarms --alarm-name-prefix metro-photos
```
