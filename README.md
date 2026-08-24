# 🏆 Galería de Fotos del Campeonato Metropolitano

Aplicación web serverless para subir, gestionar y explorar fotos del campeonato metropolitano de vela organizado por [C.U.B.A. (Club Uruguayo de Botes a Motor)](https://www.cuba.org.ar/).

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Auth | AWS Cognito |
| Backend | AWS Lambda + Node.js 18 |
| API | AWS API Gateway (HTTP APIs) |
| Base de datos | AWS DynamoDB (on-demand) |
| Almacenamiento | AWS S3 |
| CDN | AWS CloudFront |
| Image Processing | Sharp (async, S3-triggered) |
| IaC | AWS SAM |
| CI/CD | GitHub Actions |
| Package Manager | pnpm + Turbo (monorepo) |
| Lenguaje | TypeScript end-to-end |

## Estructura del Monorepo

```
metro-photos/
├── packages/
│   ├── frontend/           # React SPA (Vite + Tailwind)
│   ├── backend/            # Lambda functions (Node.js 18)
│   ├── shared/             # Tipos y utilidades compartidas
│   └── infra/              # AWS SAM template
├── .github/workflows/      # CI/CD pipelines
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## Funcionalidades

### Galería Pública
- Grid responsivo (1/2/3 columnas según pantalla)
- Lazy loading de thumbnails
- Infinite scroll
- Filtrado multi-tag (AND logic)
- Lightbox con navegación y teclas de flecha

### Panel de Administrador (requiere login)
- Upload masivo (drag & drop, hasta 100 fotos)
- Validación de formato (jpg, png, webp) y tamaño (máx. 10MB)
- Preview en tiempo real con progreso individual
- Tagging masivo post-upload con autocomplete
- Máx. 10 tags por foto, máx. 50 caracteres por tag

## Setup Local

Ver [SETUP.md](SETUP.md) para instrucciones detalladas.

```bash
# Requisitos: Node.js 18+, pnpm 9+
npm install -g pnpm
pnpm install
pnpm build
pnpm dev
```

## Deploy a AWS

Ver [DEPLOYMENT.md](DEPLOYMENT.md) para instrucciones completas.

## Licencia

MIT
