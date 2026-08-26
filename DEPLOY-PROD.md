# Guía de Deploy MANUAL a PRODUCCIÓN — Metro Photos

> El alta del stack, paso a paso con SAM CLI. Para **redeploys** no sigas esta guía a mano:
> usá `./scripts/deploy.sh` desde Git Bash. Ver [Parte 7](#parte-7--redeploys-posteriores).
> Reemplaza a `DEPLOYMENT.md` (incompleto: seguirlo produce un PROD roto).
> Última revisión: 2026-08-24 · Stack: `metro-photos-prod` · Región: `us-east-1`

---

## Arquitectura que vas a desplegar

| Recurso | Nombre en AWS | Rol |
|---|---|---|
| DynamoDB | `metro-photos-prod` | Metadatos de fotos (PAY_PER_REQUEST + PITR) |
| S3 raw | `metro-photos-raw-prod-<acct>` | Originales (`originals/{photoId}.{ext}`) |
| S3 processed | `metro-photos-processed-prod-<acct>` | `thumbnails/*` y `medium/*` |
| S3 frontend | `metro-photos-frontend-prod-<acct>` | SPA compilada |
| CloudFront | 1 distribución, 2 orígenes | SPA + imágenes procesadas (OAC, sin buckets públicos) |
| Cognito | `metro-photos-users-prod` + grupo `admin` | Login; el frontend manda **access token** |
| API Gateway | HTTP API, stage `prod` | JWT authorizer de Cognito |
| Lambda | 8 funciones | 7 HTTP + 1 disparada por evento S3 |

**Flujo de subida:** browser → `POST /upload/presigned` → PUT directo a S3 raw → evento S3 → `processPhoto` (Sharp) → escribe `thumbnails/` + `medium/` + el item en DynamoDB.

**Total: 20 recursos CloudFormation.**

---

# PARTE 0 — Correcciones del template ✅ YA APLICADAS

El template original tenía 8 bloqueadores. **Ya están corregidos** en `packages/infra/template.yaml`; esta sección queda como registro de qué cambió y por qué. Revisá el diff antes de desplegar:

```bash
git diff packages/infra/template.yaml packages/backend/package.json
```

| # | Problema encontrado | Corrección aplicada |
|---|---|---|
| B1 | El template definía 5 Lambdas pero el código tiene 8: faltaban `downloadPhoto`, `rotatePhoto` y `updatePhotoMetadata`, que el frontend sí llama → **404 en prod** | Agregadas `DownloadPhotoFunction`, `RotatePhotoFunction`, `UpdatePhotoMetadataFunction` con sus rutas y policies |
| B2 | `deletePhoto.ts:19` hace `GetCommand` pero tenía sólo `DynamoDBWritePolicy` → **AccessDenied al borrar** | `DynamoDBCrudPolicy` |
| B3 | `sam build` corre `npm install` (workflow `CopySource -> NpmInstall -> EsbuildBundle`) y npm no entiende `"@metro/shared": "workspace:*"` de pnpm → **el build ni arrancaba** | Se saltea `sam build`: pre-bundleamos con esbuild vía `pnpm build:lambda` y `sam deploy` empaqueta el resultado. Ver [Nota sobre B3](#nota-sobre-b3) |
| B4 | `Globals.Api.Cors` sólo aplica a `AWS::Serverless::Api` (REST); este stack usa `HttpApi` → **preflight OPTIONS fallaba en todo PUT/DELETE** | Bloque `Globals.Api` eliminado; `CorsConfiguration` puesta en el recurso `HttpApi`, restringida al dominio de CloudFront |
| B4b | Los `Events` no tenían `ApiId`, así que SAM creaba una API **implícita** aparte: el `CognitoAuthorizer` no se aplicaba y el output `ApiUrl` apuntaba a una API vacía | `ApiId: !Ref HttpApi` en las 7 rutas HTTP |
| B5 | `ExplicitAuthFlows` sin `ALLOW_USER_SRP_AUTH`, pero Amplify v6 usa SRP por defecto → **nadie podía loguearse** | Agregado `ALLOW_USER_SRP_AUTH`. `AccessTokenValidity` subido de 15 a 60 min (15 es muy corto para subidas masivas) |
| B6 | Layer de Sharp hardcodeada a `:1` (si no existía, **fallaba el CREATE_STACK entero**) y ausente en `rotatePhoto`, que también hace `require('sharp')` | Parámetro `SharpLayerArn`; layer adjunta a `ProcessPhotoFunction` **y** `RotatePhotoFunction` |
| B7 | `nodejs18.x`, runtime que AWS ya no permite para funciones nuevas | `nodejs24.x`. Se pasó primero a `nodejs20.x`, pero `sam validate --lint` avisó que ese también quedó deprecado el 2026-04-30 (creación deshabilitada el 2027-02-01). El layer de Sharp debe construirse con la misma versión |
| B11 | El `UserPool` permitía auto-registro público vía `SignUp` con el client ID del bundle; cualquiera podía crearse cuenta y descargar todos los originales | `AdminCreateUserConfig.AllowAdminCreateUserOnly: true` |
| B8 | Lifecycle movía los originales a `GLACIER` a los 30 días, pero `downloadPhoto` presigna un `GetObject` sobre ese bucket → **las descargas morían el día 31** con `InvalidObjectState` | `GLACIER_IR` a 90 días (GET instantáneo) + expiración de versiones viejas a 30 días |

También se agregó el output `CloudFrontDistributionId` (lo necesitás para las invalidaciones) y la variable de entorno `ALLOWED_ORIGIN`, que cierra el `Access-Control-Allow-Origin: *` que devolvían los handlers.

### Verificación ya hecha

```
✅ pnpm build            — 3 paquetes OK
✅ pnpm test             — 10 tests OK
✅ YAML parsea           — 20 recursos, 8 funciones, 3 parámetros, 7 outputs
✅ esbuild bundlea las 8 funciones (1.4–1.8 MB c/u)
✅ @metro/shared inlineado — cero `require("@metro/shared")` en los bundles
✅ sharp queda external  — se resuelve desde el layer en runtime
✅ las 8 exportan .handler
✅ grafo de dependencias acíclico — 20 recursos, 60 aristas (incluyendo las de `Globals`)
```

### Nota sobre B3

El primer intento fue poner `BuildMethod: esbuild` en cada función. **No alcanza.** El workflow
`NodejsNpmEsbuildBuilder` de SAM corre tres pasos —`CopySource` → `NpmInstall` → `EsbuildBundle`—
y ese `NpmInstall` se ejecuta siempre, aunque el bundleo posterior no lo necesite. `CopySource`
además copia `packages/backend/` **sin** `node_modules`, así que en el temp dir no existe
`../shared` y ninguna variante del `package.json` lo salva.

La solución es no usar `sam build`: bundleamos nosotros con esbuild y `sam deploy` zipea el
resultado tal cual.

- `packages/backend/scripts/build-lambdas.mjs` genera `.lambda/<nombre>/index.js` (8 bundles)
- El template apunta `CodeUri` a cada uno de esos directorios, con `Handler: index.handler`
- No hay bloques `Metadata`, no hace falta `sam build` ni `--beta-features`

### B10 · Dependencia circular S3 ↔ Lambda

`ProcessPhotoFunction` tiene un evento S3 sobre `RawBucket`, así que SAM le pone al bucket una
`NotificationConfiguration` que apunta a la función. Si la función (o su rol, o una variable de
entorno de `Globals`) hace `!Ref RawBucket`, se cierra el ciclo:

```
RawBucket -> ProcessPhotoFunction -> ProcessPhotoFunctionRole -> RawBucket
```

CloudFormation lo rechaza al crear el changeset, y en el mensaje arrastra medio stack porque
`Globals` inyectaba `S3_RAW_BUCKET: !Ref RawBucket` en las 8 funciones.

**La corrección**, que es la que recomienda AWS: como el nombre del bucket ya es determinístico,
todo lo referencia por nombre literal en vez de por `!Ref`:

```yaml
S3_RAW_BUCKET: !Sub "metro-photos-raw-${Environment}-${AWS::AccountId}"
```

Aplicado en la variable de entorno de `Globals` y en los cuatro `BucketName` de las policies
(`uploadPhotos`, `downloadPhoto`, `rotatePhoto`, `processPhoto`). La **única** que sigue siendo
`!Ref RawBucket` es `Events.S3Event.Properties.Bucket`, porque SAM la necesita así para cablear
la notificación — y esa arista va en el sentido contrario, del bucket hacia la función.

> Si algún día agregás una función que toque el bucket raw, referencialo por nombre, nunca con
> `!Ref RawBucket`.

### B9 · `DefaultAuthorizer: NONE` no existe en HttpApi

Venía del template original. En `AWS::Serverless::HttpApi`, `NONE` es válido sólo a nivel de
**ruta** (`Auth: { Authorizer: NONE }`, para que una ruta se salga del default). Como
`DefaultAuthorizer`, SAM lo busca como nombre dentro de `Authorizers`, no lo encuentra, y el
transform falla con *"'NONE' was not defined in 'Authorizers'"*. Se eliminó la línea: sin default,
las rutas quedan públicas salvo que declaren authorizer, que es justo lo que queremos
(`GET /photos` abierto, las otras 6 con Cognito).

---

# PARTE 1 — Prerrequisitos

Hacen falta AWS CLI, SAM CLI y Docker.

```powershell
# PowerShell
winget install --id Amazon.AWSCLI -e
winget install --id Amazon.SAM-CLI -e
```

Cerrá y reabrí la terminal (los instaladores actualizan el PATH, pero las terminales ya abiertas
conservan el viejo), después confirmá:

```powershell
aws --version
sam --version
docker --version
```

### ⚠️ Usá Git Bash, no WSL

Toda la guía asume **Git Bash** (el que viene con Git for Windows). WSL es una VM Linux aparte:
no ve las herramientas instaladas en Windows, monta el disco en `/mnt/c` en vez de `/c`, y tiene
su propio `~/.aws` — o sea, el `aws configure` que hiciste en Windows no existe ahí.

Abrilo desde el menú Inicio ("Git Bash"), con botón derecho → "Git Bash Here" dentro de la carpeta
del proyecto, o desde VS Code eligiendo Git Bash en el dropdown de la terminal.

### ⚠️ Si Git Bash dice `sam: command not found`

El instalador de SAM deja un **`sam.cmd`**, y Git Bash resuelve comandos sin extensión probando
`.exe` y `.com` — pero no `.cmd` ni `.bat`. Por eso `aws` funciona (es `aws.exe`) y `sam` no.

```bash
where.exe sam                 # ¿dónde quedó?
sam.cmd --version             # ¿responde así?
```

Si responde, es sólo resolución de nombre. Wrapper que funciona también dentro de scripts:

```bash
mkdir -p ~/bin
cat > ~/bin/sam <<'EOF'
#!/usr/bin/env bash
exec "/c/Program Files/Amazon/AWSSAMCLI/bin/sam.cmd" "$@"
EOF
chmod +x ~/bin/sam
echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
export PATH="$HOME/bin:$PATH"

sam --version
```

### Rutas y Git Bash

Git Bash reescribe los argumentos que **parecen** rutas Unix antes de pasárselos a un binario
nativo de Windows (`aws.exe`, `docker.exe`). A veces es lo que querés, y a veces te rompe el
comando de formas poco obvias:

| Comando | Qué le llega en realidad | Síntoma |
|---|---|---|
| `docker run -v "$PWD":/out` | destino → `C:/Program Files/Git/out` | `zip: Could not create output file` |
| `aws cloudfront ... --paths "/index.html"` | `C:/Program Files/Git/index.html` | `InvalidArgument: invalid invalidation paths` |

La solución en todos los casos es prefijar con `MSYS_NO_PATHCONV=1`, que desactiva la conversión
para ese comando. En esta guía ya viene puesto donde hace falta.

> La regla práctica: si un argumento tiene que llegar **literal** empezando con `/`, va con
> `MSYS_NO_PATHCONV=1`. Las rutas `s3://...`, las relativas (`packages/infra/...`) y los flags sin
> barra inicial no se ven afectados.

### Credenciales

Necesitás un usuario/rol con permisos sobre CloudFormation, Lambda, API Gateway, DynamoDB, S3, CloudFront, Cognito e IAM.

```powershell
aws configure
# AWS Access Key ID     : ...
# AWS Secret Access Key : ...
# Default region name   : us-east-1
# Default output format : json

aws sts get-caller-identity
```

### Variables de sesión

Todos los comandos de acá en adelante son para **Git Bash** (`bash`), no PowerShell. Abrí una sola sesión y dejala abierta:

```bash
cd /c/Projects/Cuba/MetroPictures

# AWS_DEFAULT_REGION es la que lee el CLI. REGION es sólo nuestra, para los comandos
# que reciben --region explícito. Las dos tienen que apuntar al mismo lado.
export AWS_DEFAULT_REGION=us-east-1
export AWS_REGION=us-east-1
export REGION=us-east-1

export ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export STACK=metro-photos-prod
export ADMIN=gjonsson@arenco-it.com

echo "Account: $ACCOUNT | Region CLI: $(aws configure get region) -> override: $AWS_DEFAULT_REGION"
```

> ⚠️ **Verificá la región antes de arrancar.** Si tu perfil de AWS tiene otra región por defecto
> (`aws configure get region`), los comandos que **no** llevan `--region` van a esa otra región y
> te devuelven cosas como `Stack ... does not exist` o `User pool ... does not exist` aunque los
> recursos existan. El `export AWS_DEFAULT_REGION` de arriba lo resuelve para toda la sesión;
> `export REGION=...` por sí solo **no alcanza**, porque el CLI no lee esa variable.

> Si perdés la terminal, volvé a correr este bloque antes de seguir.

---

# PARTE 2 — Lambda Layer de Sharp

**Hacelo antes del primer deploy: si el layer no existe, el stack falla entero.**

> ⚠️ El layer tiene que declarar el **mismo runtime que las funciones** (`nodejs24.x`): Lambda
> valida `CompatibleRuntimes` al adjuntarlo. Si alguna vez cambiás el `Runtime` del template,
> republicá el layer con el runtime nuevo y actualizá `SharpLayerArn`.

Sharp tiene binarios nativos. El `node_modules` de Windows no sirve — hay que compilarlo para `linux/x64`.

```bash
cd /c/Users/Usuario/AppData/Local/Temp
rm -rf sharp-layer && mkdir sharp-layer && cd sharp-layer

docker rm -f sharp-build 2>/dev/null

docker run --name sharp-build --platform linux/amd64 node:24-bookworm bash -c "
  apt-get update -qq && apt-get install -y -qq zip &&
  mkdir -p /build/nodejs && cd /build/nodejs &&
  npm init -y >/dev/null &&
  npm install --os=linux --cpu=x64 sharp &&
  cd /build && zip -qr /sharp-layer.zip nodejs
"

MSYS_NO_PATHCONV=1 docker cp sharp-build:/sharp-layer.zip ./sharp-layer.zip
docker rm sharp-build

ls -lh sharp-layer.zip     # esperado: ~10-15 MB
```

> **Por qué sin `-v`:** Git Bash reescribe los argumentos que parecen rutas Unix. En
> `-v "$PWD":/out` te convierte el **destino** a `C:/Program Files/Git/out`, el contenedor arranca
> igual pero `/out` no existe adentro y `zip` falla con *"Could not create output file"*.
> Copiar con `docker cp` esquiva el problema. Si preferís el volumen, necesitás las dos cosas
> juntas: `MSYS_NO_PATHCONV=1 docker run ... -v "$(pwd -W)":/out ...`

Verificá la estructura antes de publicar:

```bash
unzip -l sharp-layer.zip | head -20
```

Tiene que arrancar en **`nodejs/node_modules/sharp/`**: Lambda monta el layer en `/opt` y Node
busca en `/opt/nodejs/node_modules`. Si el `node_modules/` quedara en la raíz del zip, el layer
sube igual pero después da `Cannot find module 'sharp'` en runtime.

Publicalo:

```bash
aws lambda publish-layer-version \
  --layer-name sharp-layer \
  --zip-file fileb://sharp-layer.zip \
  --compatible-runtimes nodejs24.x \
  --compatible-architectures x86_64 \
  --region $REGION
```

Guardá el ARN (con número de versión):

```bash
export SHARP_LAYER=$(aws lambda list-layer-versions --layer-name sharp-layer \
  --region $REGION --query "LayerVersions[0].LayerVersionArn" --output text)

echo $SHARP_LAYER
# arn:aws:lambda:us-east-1:123456789012:layer:sharp-layer:1
```

Volvé al repo:

```bash
cd /c/Projects/Cuba/MetroPictures
```

---

# PARTE 3 — Deploy del backend

### 3.1 · Bucket de artefactos de SAM

```bash
aws s3 mb s3://metro-photos-sam-artifacts-$ACCOUNT --region $REGION

aws s3api put-bucket-versioning \
  --bucket metro-photos-sam-artifacts-$ACCOUNT \
  --versioning-configuration Status=Enabled
```

### 3.2 · Build

```bash
pnpm install
pnpm build      # compila @metro/shared -> dist, de donde esbuild lo toma
pnpm test       # que quede verde ANTES de tocar prod

pnpm --filter @metro/backend build:lambda
```

**No se usa `sam build`** (ver [Nota sobre B3](#nota-sobre-b3)). El bundleo lo hace esbuild
directamente y `sam deploy` empaqueta la salida.

Chequeo rápido de los artefactos:

```bash
ls -1 packages/backend/.lambda/                     # 8 carpetas, una por función
du -sh packages/backend/.lambda/*                   # 1.4-1.8 MB cada una

# sharp debe quedar como require externo SOLO en las dos que lo usan
grep -c 'require("sharp")' packages/backend/.lambda/processPhoto/index.js   # 1
grep -c 'require("sharp")' packages/backend/.lambda/listPhotos/index.js     # 0

# @metro/shared tiene que estar inlineado en todas
grep -c 'require("@metro/shared")' packages/backend/.lambda/*/index.js      # 0 en todas
```

Y validá el template antes de subir nada — te ahorra un round trip de varios minutos:

```bash
sam validate --lint --template packages/infra/template.yaml --region $REGION
```

### 3.3 · Primer deploy (interactivo)

```bash
sam deploy --guided \
  --stack-name $STACK \
  --region $REGION \
  --s3-bucket metro-photos-sam-artifacts-$ACCOUNT \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    Environment=prod \
    AdminEmail=$ADMIN \
    SharpLayerArn=$SHARP_LAYER
```

Respuestas al wizard:

| Pregunta | Respuesta |
|---|---|
| Confirm changes before deploy | `y` (mirá el changeset la primera vez) |
| Allow SAM CLI IAM role creation | `y` |
| Disable rollback | **`n`** — querés rollback automático |
| Save arguments to configuration file | `y` → genera `samconfig.toml` (ya está en `.gitignore`) |

⏱️ **15–25 minutos.** CloudFront es lo lento; el resto tarda 2–3 min.

> **Si el stack queda en `ROLLBACK_COMPLETE`** no se puede reintentar encima, hay que borrarlo:
> ```bash
> aws cloudformation delete-stack --stack-name $STACK
> aws cloudformation wait stack-delete-complete --stack-name $STACK
> ```
> Y para ver qué falló:
> ```bash
> aws cloudformation describe-stack-events --stack-name $STACK \
>   --query "StackEvents[?ResourceStatus=='CREATE_FAILED'].[LogicalResourceId,ResourceStatusReason]" \
>   --output table
> ```

### 3.4 · Capturar los outputs

```bash
aws cloudformation describe-stacks --stack-name $STACK --query "Stacks[0].Outputs" --output table
```

Y a variables, que las vas a usar en la Parte 4 y 5:

```bash
out() { aws cloudformation describe-stacks --stack-name $STACK \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

export API_URL=$(out ApiUrl)
export CF_URL=$(out CloudFrontUrl)
export CF_ID=$(out CloudFrontDistributionId)
export POOL_ID=$(out UserPoolId)
export CLIENT_ID=$(out UserPoolClientId)
export FE_BUCKET=$(out FrontendBucketName)

printf 'API      = %s\nCF       = %s\nCF_ID    = %s\nPOOL     = %s\nCLIENT   = %s\nBUCKET   = %s\n' \
  "$API_URL" "$CF_URL" "$CF_ID" "$POOL_ID" "$CLIENT_ID" "$FE_BUCKET"
```

Guardalos también en un archivo, por si cerrás la terminal:

```bash
cat > .prod-outputs.env <<EOF
export API_URL=$API_URL
export CF_URL=$CF_URL
export CF_ID=$CF_ID
export POOL_ID=$POOL_ID
export CLIENT_ID=$CLIENT_ID
export FE_BUCKET=$FE_BUCKET
export SHARP_LAYER=$SHARP_LAYER
EOF

echo ".prod-outputs.env" >> .gitignore
# para recuperarlos: source .prod-outputs.env
```

---

# PARTE 4 — Deploy del frontend

Vite hornea las variables en tiempo de build, así que **el backend tiene que estar desplegado primero**.

### 4.1 · ⚠️ Sacar el modo local de en medio

`packages/frontend/.env.local` tiene `VITE_LOCAL_MODE=1`, que **bypassea Cognito por completo**: cualquiera entra como admin. Y Vite le da prioridad sobre `.env.production` incluso en `vite build`.

```bash
mv packages/frontend/.env.local packages/frontend/.env.local.bak
```

### 4.2 · `.env.production`

```bash
cat > packages/frontend/.env.production <<EOF
VITE_API_URL=$API_URL
VITE_COGNITO_USER_POOL_ID=$POOL_ID
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
EOF

cat packages/frontend/.env.production
```

### 4.3 · Build y verificación del bundle

```bash
pnpm --filter @metro/frontend build

# el bundle debe apuntar al API real, no al localhost del modo local
grep -o 'execute-api[^"'\'']*' packages/frontend/dist/assets/*.js | head -1
grep -c 'localhost:4000' packages/frontend/dist/assets/*.js    # esperado: 0
```

Si aparece `localhost:4000`, el `.env.local` se te coló: repetí 4.1 y rebuildeá.

### 4.4 · Subir a S3 e invalidar

```bash
# assets con hash -> cache eterno
aws s3 sync packages/frontend/dist/ s3://$FE_BUCKET/ --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" --exclude "sw.js" --exclude "manifest.webmanifest"

# index.html + los archivos de la PWA -> nunca cachear.
# sw.js sobre todo: si se cachea, quien ya instalo la app se queda con ese
# service worker y ningun deploy posterior le llega.
for f in index.html sw.js manifest.webmanifest; do
  aws s3 cp packages/frontend/dist/$f s3://$FE_BUCKET/$f \
    --cache-control "no-cache, no-store, must-revalidate"
done

MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation --distribution-id $CF_ID \
  --paths "/index.html" "/sw.js" "/manifest.webmanifest"
```

El `MSYS_NO_PATHCONV=1` no es opcional: sin él, Git Bash convierte `/index.html` a
`C:/Program Files/Git/index.html` y CloudFront responde
`InvalidArgument: Your request contains one or more invalid invalidation paths`
(toda ruta de invalidación tiene que empezar con `/`). Ver
[Rutas y Git Bash](#rutas-y-git-bash). El `s3 sync` y el `s3 cp` de arriba no lo necesitan:
sus rutas arrancan con `s3://` y el `--exclude` no lleva barra inicial.

Seguí la invalidación:

```bash
MSYS_NO_PATHCONV=1 aws cloudfront list-invalidations --distribution-id $CF_ID \
  --query "InvalidationList.Items[0].[Id,Status,CreateTime]" --output text
```

Pasa de `InProgress` a `Completed` en 1-3 minutos. No hace falta esperarla para probar el sitio:
`index.html` se sube con `no-cache`.

---

# PARTE 5 — Usuario administrador

```bash
aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID \
  --username $ADMIN \
  --user-attributes Name=email,Value=$ADMIN Name=email_verified,Value=true \
  --temporary-password 'CambiarEsto123!' \
  --message-action SUPPRESS

aws cognito-idp admin-add-user-to-group \
  --user-pool-id $POOL_ID --username $ADMIN --group-name admin
```

La contraseña temporal dispara el challenge `NEW_PASSWORD_REQUIRED`, que la `LoginPage` actual **no maneja**. Fijá una definitiva desde la CLI:

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id $POOL_ID --username $ADMIN \
  --password 'PonéUnaPasswordFuerte123' --permanent
```

Política del pool: mínimo 8 caracteres, con mayúscula, minúscula y número.

Verificá que quedó en el grupo:

```bash
aws cognito-idp admin-list-groups-for-user --user-pool-id $POOL_ID --username $ADMIN \
  --query "Groups[].GroupName" --output text     # esperado: admin
```

---

# PARTE 6 — Verificación

### Smoke test automático

```bash
echo "1. Galería pública (sin token)  -> espero 200"
curl -s -o /dev/null -w "   %{http_code}\n" "$API_URL/photos?limit=5"

echo "2. Endpoint protegido sin token -> espero 401"
curl -s -o /dev/null -w "   %{http_code}\n" -X POST "$API_URL/upload/presigned"

echo "3. Preflight CORS               -> espero 204 + allow-origin"
curl -si -X OPTIONS "$API_URL/photos/x/rotate" \
  -H "Origin: $CF_URL" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  | grep -i "^HTTP/\|access-control-allow"

echo "4. SPA sirve                    -> espero 200"
curl -s -o /dev/null -w "   %{http_code}\n" "$CF_URL/"

echo "5. Deep link SPA                -> espero 200"
curl -s -o /dev/null -w "   %{http_code}\n" "$CF_URL/admin"
```

Si el paso 3 no devuelve `access-control-allow-origin`, revisá que `AllowOrigins` del `HttpApi` coincida **exactamente** con `$CF_URL` (con `https://`, sin barra final).

### Checklist manual en el navegador

Abrí `$CF_URL` y andá tildando. Cada ítem valida un bloqueador corregido:

- [ ] **Login** con el usuario admin → valida **B5** (SRP)
- [ ] **Subir 2–3 fotos** → los thumbnails aparecen en segundos → valida layer de Sharp + evento S3
- [ ] **Taggear en lote** (`PUT /photos/tag`)
- [ ] **Editar metadata** de una foto → valida **B1**
- [ ] **Rotar** una foto → valida **B1** + **B6**
- [ ] **Descargar** una foto suelta y un **ZIP** → valida **B1** + **B8**
- [ ] **Borrar** una foto → valida **B2**
- [ ] **Logout** → la galería sigue visible, pero descargar pide login
- [ ] Recargar en `/admin` (F5) → no da 404 → valida el fallback de CloudFront

### Si algo falla

```bash
# logs de la función que procesa las imágenes
sam logs -n ProcessPhotoFunction --stack-name $STACK --tail

# o directo por CloudWatch
aws logs tail /aws/lambda/metro-photos-process-prod --follow --since 15m
```

| Síntoma | Causa probable |
|---|---|
| `Cannot find module 'sharp'` | El layer no coincide en runtime/arquitectura → rehacé la Parte 2 con `--platform linux/amd64` y `nodejs24.x` |
| Thumbnails nunca aparecen | El evento S3 no dispara: verificá que la key arranque con `originals/` |
| CORS error en el browser | `AllowOrigins` del HttpApi ≠ dominio de CloudFront |
| `Auth flow not enabled` | El stack no tomó el cambio de B5: `aws cognito-idp describe-user-pool-client --user-pool-id $POOL_ID --client-id $CLIENT_ID --query "UserPoolClient.ExplicitAuthFlows"` |
| 404 en rotate/metadata/download | El deploy no incluyó las 3 funciones nuevas: `aws lambda list-functions --query "Functions[?starts_with(FunctionName,'metro-photos')].FunctionName"` |

---

# PARTE 7 — Redeploys posteriores

## La rutina: `./scripts/deploy.sh`

```bash
./scripts/deploy.sh                 # backend + frontend, con confirmación
./scripts/deploy.sh --frontend      # sólo el frontend
./scripts/deploy.sh --dry-run       # construye y valida sin tocar AWS
```

El script hace, en orden: preflight (credenciales, que el stack exista, que
`.env.local` no se cuele) → `pnpm lint && build && test` → bundle de las Lambdas
con esbuild → `sam validate --lint` → `sam deploy` → build del frontend →
`s3 sync` con los headers de cache correctos → invalidación → smoke test.

Tres cosas que resuelve y a mano se olvidan:

- **La región va explícita.** El perfil local puede estar en otra (`aws configure get region`),
  y `sam deploy` en la región equivocada no falla: crea un stack nuevo, vacío.
- **Nada sale de `.prod-outputs.env`.** Bucket, CloudFront, ids de Cognito y el ARN del layer
  de Sharp se leen del stack en vivo. Ese archivo está gitignoreado, no existe en CI, y una
  copia vieja despliega contra el lugar equivocado en silencio.
- **`.env.local` se aparta durante el build y se restaura al final**, con `trap`. Si igual se
  cuela, el chequeo del bundle corta el deploy antes de subir nada.

### Credenciales y región

Las toma el AWS CLI como siempre: sirve que estén en `~/.aws/credentials` (`aws configure`) o
exportadas en la sesión, y si están las dos ganan las de la sesión. **No hace falta el bloque
de `export` de la [Parte 1](#variables-de-sesión)**: el script exporta `AWS_DEFAULT_REGION` él
mismo y pasa `--region` en cada llamada, que es justamente el paso que, olvidado, te manda a la
región del perfil (`sa-east-1` en esta máquina) y te dice `Stack does not exist` con el stack
sano del otro lado.

El preflight imprime cuenta, región y stack antes de tocar nada. Si la cuenta no es la que
esperabas, cortá ahí.

> **El deploy no está automatizado en CI, y es a propósito.** `.github/workflows/` sólo corre
> lint/build/test. Desplegar desde Actions obligaría a subir credenciales de AWS a GitHub, y
> el deploy lo dispara una persona.

## Los comandos sueltos

Lo que el script hace por dentro, por si necesitás correr un paso aislado:

### Backend

```bash
cd /c/Projects/Cuba/MetroPictures && source .prod-outputs.env

pnpm install && pnpm build && pnpm test
pnpm --filter @metro/backend build:lambda
sam deploy --template packages/infra/template.yaml --stack-name $STACK --no-confirm-changeset
```

(`samconfig.toml` ya recuerda el bucket, la región, las capabilities y los parámetros.)

### Frontend

```bash
cd /c/Projects/Cuba/MetroPictures && source .prod-outputs.env

pnpm --filter @metro/frontend build
aws s3 sync packages/frontend/dist/ s3://$FE_BUCKET/ --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "index.html" --exclude "sw.js" --exclude "manifest.webmanifest"
for f in index.html sw.js manifest.webmanifest; do
  aws s3 cp packages/frontend/dist/$f s3://$FE_BUCKET/$f \
    --cache-control "no-cache, no-store, must-revalidate"
done
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation --distribution-id $CF_ID \
  --paths "/index.html" "/sw.js" "/manifest.webmanifest"
```

### Actualizar el layer de Sharp

El ARN incluye la versión, así que publicar una nueva no afecta al stack hasta que se lo pases:

```bash
# ...republicás el layer (Parte 2)...
export SHARP_LAYER=$(aws lambda list-layer-versions --layer-name sharp-layer \
  --region $REGION --query "LayerVersions[0].LayerVersionArn" --output text)

sam deploy --stack-name $STACK --no-confirm-changeset \
  --parameter-overrides Environment=prod AdminEmail=$ADMIN SharpLayerArn=$SHARP_LAYER
```

---

# PARTE 8 — Operación

### Rollback del backend

CloudFormation revierte solo si el deploy falla. Para volver a un commit anterior:

```bash
git checkout <sha-anterior>
pnpm install && pnpm build && pnpm --filter @metro/backend build:lambda
sam deploy --template packages/infra/template.yaml --stack-name $STACK --no-confirm-changeset
```

### Rollback del frontend

El bucket de frontend **no tiene versionado**, así que el rollback es rebuildear desde el commit anterior y volver a sincronizar. Si querés rollback de un click, agregá al `FrontendBucket` del template:

```yaml
      VersioningConfiguration:
        Status: Enabled
```

### Borrar todo

```bash
# S3 no deja borrar buckets con objetos: vaciarlos primero
aws s3 rm s3://$FE_BUCKET --recursive
aws s3 rm s3://metro-photos-processed-prod-$ACCOUNT --recursive
# ⚠️ este tiene los ORIGINALES — bajate una copia antes
aws s3 rm s3://metro-photos-raw-prod-$ACCOUNT --recursive

aws cloudformation delete-stack --stack-name $STACK
aws cloudformation wait stack-delete-complete --stack-name $STACK
```

### Backups

- **DynamoDB**: PITR ya activo (35 días). Para retención larga, sumá un plan de AWS Backup.
- **S3 raw**: versionado activo. Si las fotos son irreemplazables, considerá replicación cross-region.

### Costo estimado

Uso bajo (~10k fotos, tráfico de un campeonato): **USD 5–15/mes**, dominado por storage de S3 y egress de CloudFront. Lambda, DynamoDB on-demand, API Gateway y Cognito (<50k MAU) quedan prácticamente en free tier.

---

# PARTE 9 — Roles y administración de usuarios

## Modelo de roles

Un rol = un grupo de Cognito. `viewer` es la **ausencia** de grupo: un usuario logueado sin grupo
puede ver la galería y descargar originales, nada más.

| | admin | editor | viewer |
|---|:---:|:---:|:---:|
| ver galería (pública) | ✓ | ✓ | ✓ |
| descargar originales | ✓ | ✓ | ✓ |
| subir · taggear · editar · rotar | ✓ | ✓ | — |
| borrar fotos | ✓ | ✓ | — |
| gestionar usuarios | ✓ | — | — |

La fuente de verdad es [types.ts](packages/shared/src/types.ts): `roleFromGroups()`,
`canManagePhotos()` y `canManageUsers()`. El backend nunca consulta una tabla de usuarios — lee
el claim `cognito:groups` del access token.

## El ABM

`/admin/users`, visible sólo para admin. Permite alta, cambio de rol, habilitar/deshabilitar,
resetear contraseña y borrar.

| Método | Ruta | Handler |
|---|---|---|
| GET | `/users` | `listUsers` |
| POST | `/users` | `createUser` |
| PUT | `/users/{username}` | `updateUser` |
| DELETE | `/users/{username}` | `deleteUser` |
| POST | `/users/{username}/reset-password` | `resetUserPassword` |

Los cinco exigen rol admin y tienen policies IAM acotadas al ARN del user pool, con sólo las
acciones `cognito-idp:*` que cada uno usa.

### Ciclo de vida de la contraseña

No hay envío de mails. El flujo es de credencial **de un solo uso**:

1. `createUser` genera una contraseña de 14 caracteres (sin glifos ambiguos como `0/O` o `1/l`,
   porque se retipean a mano) y la carga como `TemporaryPassword`. El usuario queda en estado
   `FORCE_CHANGE_PASSWORD` — la tabla del ABM lo muestra como *"Pendiente de 1er ingreso"*.
2. El admin la copia de la UI (se muestra una sola vez) y se la pasa a la persona por fuera.
3. Al entrar, Cognito devuelve el challenge `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED` y la
   `LoginPage` muestra la segunda pantalla: la persona **elige su propia contraseña**.
4. Después puede cambiarla cuando quiera desde `/cambiar-password`, accesible clickeando su
   nombre en el encabezado. Usa `updatePassword` de Amplify: pide la actual y la nueva, sin
   depender de email.

"Resetear pass" en el ABM hace lo mismo: `AdminSetUserPassword` con `Permanent: false`, así que
la persona vuelve a elegir la suya al ingresar.

La contraseña temporal vence a los 30 días (`TemporaryPasswordValidityDays`). Si vence sin
usarse, resetéala desde el ABM.

La política (mínimo 8, mayúscula, minúscula y número) vive en `PASSWORD_MIN_LENGTH` +
`validatePassword()` de `shared`, y tiene que seguir coincidiendo con
`UserPool.Policies.PasswordPolicy` del template.

> No hay "olvidé mi contraseña": sin envío de mails no hay forma seria de verificar identidad.
> Si alguien queda afuera, un admin le resetea la contraseña desde el ABM.

### Protecciones

- Nadie puede quitarse a sí mismo el rol admin, deshabilitarse ni borrarse.
- No se puede degradar, deshabilitar ni borrar al **último admin** del pool.

### Latencia de los cambios

El access token dura 60 minutos. Quitarle el rol a alguien **no** corta su sesión hasta que el
token vence. Para cortar el acceso en el momento, **deshabilitá** al usuario: Cognito rechaza el
refresh y la sesión muere en cuanto el token expira.

## Auto-registro cerrado

El `UserPool` lleva `AdminCreateUserConfig.AllowAdminCreateUserOnly: true`. Sin eso, el default de
Cognito **permite que cualquiera se registre** con la API pública `SignUp` usando el client ID que
va horneado en el bundle JS — y como `downloadPhoto` sólo exige estar logueado, eso regalaba todos
los originales.

> Desde el ABM, un admin puede además abrir las descargas a visitantes sin sesión
> (`publicDownloads`, en Usuarios → Descargas). Es una decisión de runtime guardada en DynamoDB:
> la ruta `/photos/{photoId}/download` ya no lleva authorizer de API Gateway y es el propio
> handler el que verifica el token (y rechaza uno inválido) o consulta el setting. Con el switch
> apagado — el default — el comportamiento es el de siempre.

Con el flag, la API `SignUp` devuelve `NotAuthorizedException` y la única vía de alta es el ABM.

> Si algún día hay que revertirlo, hacelo por template. `aws cognito-idp update-user-pool` resetea
> a default todo parámetro que no le pases explícitamente, así que te borraría la política de
> contraseñas y los atributos autoverificados.

## Redeploy

```bash
source .prod-outputs.env

pnpm build && pnpm test
pnpm --filter @metro/backend build:lambda
sam validate --lint --template packages/infra/template.yaml --region $REGION
sam deploy --template packages/infra/template.yaml --stack-name $STACK --no-confirm-changeset

pnpm --filter @metro/frontend build

# Todo lo de /assets lleva hash en el nombre: immutable sin miedo.
# index.html, sw.js y manifest.webmanifest NO: si se cachean un año, el service
# worker queda congelado y el deploy siguiente no llega nunca al que ya instaló la app.
aws s3 sync packages/frontend/dist/ s3://$FE_BUCKET/ --delete   --cache-control "public, max-age=31536000, immutable"   --exclude "index.html" --exclude "sw.js" --exclude "manifest.webmanifest"
for f in index.html sw.js manifest.webmanifest; do
  aws s3 cp packages/frontend/dist/$f s3://$FE_BUCKET/$f     --cache-control "no-cache, no-store, must-revalidate"
done
MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation --distribution-id $CF_ID   --paths "/index.html" "/sw.js" "/manifest.webmanifest"
```

---

# PARTE 10 — Deuda técnica (post-deploy)

Nada de esto bloquea el deploy, pero conviene tenerlo en el radar:

| Tema | Detalle |
|---|---|
| `listPhotos` usa `Scan` | `listPhotos.ts:53` escanea la tabla entera. El GSI `byUploadDate-index` está definido pero **nunca se usa**. Con miles de fotos crecen costo y latencia → migrar a `Query`. |
| Sin límite de tamaño de upload | `MAX_FILE_SIZE_MB = 0` (`shared/src/types.ts:120`) desactiva la validación. `processPhoto` tiene 1024 MB / 120 s: una foto muy grande puede darle timeout u OOM. |
| `CustomErrorResponses` global | El 403/404 → `index.html` aplica a **todos** los behaviors, incluido `/thumbnails/*`: una imagen faltante devuelve HTML con status 200. |
| `authorizer.ts` es código muerto | Se usa el JWT authorizer nativo de API Gateway; el archivo no lo referencia nadie. |
| CORS de S3 en `*` | `RawBucket.CorsConfiguration.AllowedOrigins: ['*']` — restringir al dominio de CloudFront. |
| Sin alarmas | No hay CloudWatch Alarms. Mínimo: errores de Lambda y 5xx del API. |
| Bundles de 1.4–1.8 MB | El SDK de AWS va bundleado. Marcar `@aws-sdk/*` como external los baja a ~50 KB, pero atás la app a la versión del runtime. Opcional. |
| Dominio propio | Certificado ACM en **us-east-1** + `Aliases` en la distribución + sumar el dominio a `AllowOrigins` del HttpApi. |
| Sin entorno de staging | `deploy.sh` apunta al stack de prod. El template ya acepta `Environment=dev\|staging`: levantar un segundo stack y desplegar ahí primero daría dónde probar un cambio riesgoso antes de que lo vea la gente. |

---

## Checklist de ejecución

```
[ ] 1. winget install AWS CLI + SAM CLI, aws configure, exportar variables
[ ] 2. Construir y publicar el layer de Sharp con Docker -> SHARP_LAYER
[ ] 3. Crear bucket de artefactos
[ ] 4. pnpm build && pnpm test
[ ] 5. pnpm --filter @metro/backend build:lambda  +  sam validate --lint
[ ] 6. sam deploy --guided                      (15-25 min)
[ ] 7. Capturar outputs -> .prod-outputs.env
[ ] 8. mv .env.local .env.local.bak  (¡crítico!)
[ ] 9. Crear .env.production -> build frontend -> verificar bundle
[ ] 10. s3 sync + invalidation
[ ] 11. Crear usuario admin + agregarlo al grupo `admin`
[ ] 12. Smoke test (Parte 6) + checklist en el navegador
```
