# Guía para Contribuidores

## Cómo contribuir

1. Fork el repositorio
2. Crea una rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Hace tus cambios con commits descriptivos
4. Asegurate de que los tests pasen (`pnpm test`)
5. Asegurate de que el build funcione (`pnpm build`)
6. Crea un Pull Request

## Convenciones de código

- TypeScript estricto en todo el proyecto
- Los tipos compartidos van en `packages/shared/src/types.ts`
- Los handlers de Lambda deben tener menos de 200 líneas
- Los componentes React siguen el patrón functional + hooks

## Agregar una nueva Lambda function

1. Crear el archivo en `packages/backend/src/functions/nombre.ts`
2. Exportar el handler: `export const handler = async (event) => {...}`
3. Agregar la función al SAM template en `packages/infra/template.yaml`
4. Escribir tests en `packages/backend/src/__tests__/`

## Estructura de una Lambda

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ok, badRequest, internalError } from '../lib/response';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // lógica aquí
    return ok({ result: 'data' });
  } catch (err) {
    console.error('functionName error:', err);
    return internalError();
  }
};
```

## Tests

```bash
# Correr tests del backend
pnpm --filter @metro/backend test

# Correr todos los tests
pnpm test
```

## Agregar un nuevo componente React

1. Crear el archivo en `packages/frontend/src/components/`
2. Usar TypeScript estricto
3. Estilos con Tailwind (no CSS modules ni styled-components)

## Preguntas frecuentes

**¿Por qué los uploads van directo a S3 y no por Lambda?**
Para minimizar costos y latencia. Las presigned URLs permiten subir hasta 5GB directamente al bucket.

**¿Por qué DynamoDB on-demand?**
Pagas solo por lo que usas. Ideal para un sitio con tráfico variable.

**¿Cómo agrego un nuevo GSI a DynamoDB?**
Actualizar el SAM template. Con on-demand, los GSIs se crean sin downtime.
