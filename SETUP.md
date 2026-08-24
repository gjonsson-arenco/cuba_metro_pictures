# Setup Local

## Requisitos

- Node.js 18 o superior
- pnpm 9+
- Una cuenta de AWS (para deploy)

## Instalación

```bash
# 1. Clonar el repo
git clone https://github.com/gjonsson-arenco/cuba_metro_pictures.git
cd cuba_metro_pictures

# 2. Instalar pnpm si no lo tenés
npm install -g pnpm

# 3. Instalar dependencias de todos los paquetes
pnpm install

# 4. Crear archivos de configuración
cp .env.example .env
cp packages/frontend/.env.example packages/frontend/.env.local

# 5. Editar las variables de entorno (ver sección de configuración)
```

## Desarrollo local

```bash
# Correr todo en paralelo (frontend + watcher de shared)
pnpm dev

# Solo el frontend
pnpm --filter @metro/frontend dev

# Build de todos los paquetes
pnpm build

# Tests
pnpm test

# Lint
pnpm lint
```

## Configuración local con LocalStack (opcional)

Para desarrollo offline podés usar [LocalStack](https://localstack.cloud/):

```bash
# Instalar LocalStack
pip install localstack awscli-local

# Iniciar LocalStack
localstack start -d

# Crear recursos locales
awslocal dynamodb create-table \
  --table-name metro-photos-dev \
  --billing-mode PAY_PER_REQUEST \
  --attribute-definitions AttributeName=photoId,AttributeType=S \
  --key-schema AttributeName=photoId,KeyType=HASH

awslocal s3 mb s3://metro-photos-raw-dev
awslocal s3 mb s3://metro-photos-processed-dev
```

## Estructura del proyecto

- `packages/shared/` — Types e interfaces compartidos entre frontend y backend
- `packages/backend/` — Lambda functions con handlers de AWS
- `packages/frontend/` — React SPA con Vite
- `packages/infra/` — AWS SAM template para infraestructura

## Comandos útiles

```bash
# Agregar dependencia a un paquete específico
pnpm --filter @metro/frontend add axios

# Build solo de shared
pnpm --filter @metro/shared build

# Tests del backend
pnpm --filter @metro/backend test
```
