#!/usr/bin/env bash
#
# Deploy de Metro Photos a producción — la Parte 7 de DEPLOY-PROD.md, ejecutable.
#
# Se corre a mano desde Git Bash. Todo lo que el runbook sacaba de
# `.prod-outputs.env` (bucket del frontend, id de CloudFront, ids de Cognito,
# ARN del layer de Sharp) se lee del stack en vivo: ese archivo hoy no existe
# en esta máquina, y una copia desactualizada despliega contra el lugar
# equivocado sin avisar.
#
#   ./scripts/deploy.sh                  backend + frontend
#   ./scripts/deploy.sh --frontend       sólo el frontend
#   ./scripts/deploy.sh --backend        sólo el backend
#   ./scripts/deploy.sh --dry-run        construye y valida, no toca AWS
#   ./scripts/deploy.sh --skip-tests     salteá el gate de calidad (no recomendado)
#   ./scripts/deploy.sh --yes            sin confirmación interactiva
#
set -euo pipefail

STACK=${STACK:-metro-photos-prod}
# Explícita siempre: el perfil local apunta a sa-east-1 y el stack vive en
# us-east-1, y `sam deploy` en la región equivocada no falla — crea un stack
# nuevo y vacío. Respeta REGION si ya la exportaste (Parte 1 de la guía).
REGION=${DEPLOY_REGION:-${REGION:-us-east-1}}
# El CLI lee AWS_DEFAULT_REGION, no REGION: exportarla acá evita que un comando
# al que se nos escape el --region se vaya a la región del perfil.
export AWS_DEFAULT_REGION=$REGION

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

DO_BACKEND=1
DO_FRONTEND=1
DRY_RUN=0
SKIP_TESTS=0
ASSUME_YES=0

# ── salida ────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; OFF=$'\033[0m'
else
  B=''; DIM=''; RED=''; GREEN=''; YELLOW=''; OFF=''
fi
step() { printf '\n%s==> %s%s\n' "$B" "$1" "$OFF"; }
info() { printf '    %s\n' "$1"; }
warn() { printf '%s    ! %s%s\n' "$YELLOW" "$1" "$OFF"; }
ok()   { printf '%s    ✓ %s%s\n' "$GREEN" "$1" "$OFF"; }
die()  { printf '\n%serror: %s%s\n' "$RED" "$1" "$OFF" >&2; exit 1; }

usage() {
  cat <<'EOF'
Deploy de Metro Photos a producción (actualiza un stack ya creado).

  ./scripts/deploy.sh                  backend + frontend
  ./scripts/deploy.sh --backend        sólo el backend
  ./scripts/deploy.sh --frontend       sólo el frontend
  ./scripts/deploy.sh --dry-run        construye y valida, no toca AWS
  ./scripts/deploy.sh --skip-tests     saltea lint/build/test (no recomendado)
  ./scripts/deploy.sh --yes            sin confirmación interactiva

Variables: STACK (default metro-photos-prod), REGION (default us-east-1).
El resto — bucket, CloudFront, ids de Cognito, layer de Sharp — sale del stack.

Credenciales: las toma el AWS CLI como siempre. Sirve tanto que estén en
~/.aws/credentials (aws configure) como exportadas en la sesión; si están las
dos, ganan las de la sesión. El preflight imprime con qué cuenta vas a operar.
EOF
  exit 0
}

while [ $# -gt 0 ]; do
  case "$1" in
    --backend)    DO_FRONTEND=0 ;;
    --frontend)   DO_BACKEND=0 ;;
    --dry-run)    DRY_RUN=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    --yes|-y)     ASSUME_YES=1 ;;
    -h|--help)    usage ;;
    *)            die "opción desconocida: $1 (probá --help)" ;;
  esac
  shift
done

# ── preflight ─────────────────────────────────────────────────────────────
step "Preflight"

for bin in aws pnpm node; do
  command -v "$bin" >/dev/null 2>&1 || die "falta '$bin' en el PATH"
done

# SAM en Windows se instala como `sam.cmd`, un batch de una línea:
#
#     "%~dp0/../runtime/python.exe" -m samcli %*
#
# Ejecutarlo desde Git Bash obliga a pasar por cmd.exe, y ahí el path del
# instalador — que tiene un espacio, "C:\Program Files\..." — se rompe en
# algunos comandos: `validate` sale bien y `deploy` muere con
# «"C:\Program" no se reconoce como un comando interno o externo».
#
# Le hablamos directo al python embebido: es un .exe nativo, Git Bash lo lanza
# sin intermediarios y desaparece toda esa clase de problema.
SAM_HOME=${SAM_HOME:-/c/Program Files/Amazon/AWSSAMCLI}
SAM_CMD=()
if [ -n "${SAM:-}" ]; then
  SAM_CMD=("$SAM")
elif [ -x "$SAM_HOME/runtime/python.exe" ]; then
  SAM_CMD=("$SAM_HOME/runtime/python.exe" -m samcli)
elif command -v sam >/dev/null 2>&1; then
  SAM_CMD=(sam)
elif [ -f "$SAM_HOME/bin/sam.cmd" ]; then
  SAM_CMD=("$SAM_HOME/bin/sam.cmd")
else
  die "no encuentro SAM. Pasá SAM_HOME=/ruta/a/AWSSAMCLI o SAM=/ruta/a/sam"
fi

# Que un SAM roto se note acá y no después de tres minutos de build. `deploy
# --help` no toca nada y recorre el mismo camino que el deploy real.
"${SAM_CMD[@]}" deploy --help >/dev/null 2>&1 \
  || die "SAM no responde: ${SAM_CMD[*]}"

aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1 \
  || die "las credenciales de AWS no funcionan: revisá 'aws configure' o lo que tengas exportado en la sesión"

# `tr -d '\r'`: el CLI de AWS en Windows escribe CRLF, y ese \r se queda pegado
# al final de cada valor. Con `$(...)` sobrevive (sólo se recortan los \n), y
# después rompe de formas ilegibles: un bucket "nombre\r" no matchea el regex de
# S3, y el \r del mensaje de error pisa el principio de la línea al imprimirse.
ACCOUNT=$(aws sts get-caller-identity --region "$REGION" --query Account --output text | tr -d '\r')
info "cuenta   $ACCOUNT"
info "región   $REGION"
info "stack    $STACK"

aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" >/dev/null 2>&1 \
  || die "el stack '$STACK' no existe en $REGION. Este script actualiza un stack ya creado; para el alta seguí DEPLOY-PROD.md"

# `.env.local` lleva VITE_LOCAL_MODE=1, que bypassea Cognito entero: cualquiera
# entra como admin. Vite le da prioridad sobre .env.production incluso en build.
ENV_LOCAL="packages/frontend/.env.local"
RESTORE_ENV_LOCAL=0
if [ -f "$ENV_LOCAL" ]; then
  warn "$ENV_LOCAL existe: lo aparto durante el build y lo restauro al terminar"
  RESTORE_ENV_LOCAL=1
fi
cleanup() {
  if [ "$RESTORE_ENV_LOCAL" = 1 ] && [ -f "$ENV_LOCAL.deploying" ]; then
    mv "$ENV_LOCAL.deploying" "$ENV_LOCAL"
  fi
}
trap cleanup EXIT

if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  warn "el working tree tiene cambios sin commitear: vas a desplegar código que no está en git"
fi

ok "preflight"

# ── confirmación ──────────────────────────────────────────────────────────
if [ "$DRY_RUN" = 0 ] && [ "$ASSUME_YES" = 0 ] && [ -z "${CI:-}" ] && [ -t 0 ]; then
  target=""
  [ "$DO_BACKEND" = 1 ] && target="backend"
  [ "$DO_FRONTEND" = 1 ] && target="${target:+$target + }frontend"
  printf '\n%sVas a desplegar %s a PRODUCCIÓN (%s).%s\n' "$B" "$target" "$STACK" "$OFF"
  printf 'Escribí %sdeploy%s para seguir: ' "$B" "$OFF"
  read -r answer
  [ "$answer" = "deploy" ] || die "cancelado"
fi

# ── outputs del stack ─────────────────────────────────────────────────────
step "Leyendo el stack"

API_URL=''; CF_URL=''; CF_ID=''; POOL_ID=''; CLIENT_ID=''; FE_BUCKET=''
while IFS=$'\t' read -r key value; do
  case "$key" in
    ApiUrl)                   API_URL=$value ;;
    CloudFrontUrl)            CF_URL=$value ;;
    CloudFrontDistributionId) CF_ID=$value ;;
    UserPoolId)               POOL_ID=$value ;;
    UserPoolClientId)         CLIENT_ID=$value ;;
    FrontendBucketName)       FE_BUCKET=$value ;;
  esac
done < <(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
           --query "Stacks[0].Outputs[].[OutputKey,OutputValue]" --output text | tr -d '\r')

SHARP_LAYER=''; ADMIN_EMAIL=''
while IFS=$'\t' read -r key value; do
  case "$key" in
    SharpLayerArn) SHARP_LAYER=$value ;;
    AdminEmail)    ADMIN_EMAIL=$value ;;
  esac
done < <(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
           --query "Stacks[0].Parameters[].[ParameterKey,ParameterValue]" --output text | tr -d '\r')

for var in API_URL CF_URL CF_ID POOL_ID CLIENT_ID FE_BUCKET SHARP_LAYER ADMIN_EMAIL; do
  [ -n "${!var}" ] || die "el stack no devolvió $var"
done

info "api      $API_URL"
info "cdn      $CF_URL"
info "bucket   $FE_BUCKET"
info "layer    $SHARP_LAYER"
ok "outputs"

# ── gate de calidad ───────────────────────────────────────────────────────
if [ "$SKIP_TESTS" = 1 ]; then
  warn "gate de calidad salteado (--skip-tests)"
else
  step "Lint, build y tests"
  pnpm install --frozen-lockfile
  pnpm lint
  pnpm build
  pnpm test
  ok "verde"
fi

# ── backend ───────────────────────────────────────────────────────────────
if [ "$DO_BACKEND" = 1 ]; then
  step "Backend"

  # No se usa `sam build`: su workflow corre npm install, y npm no entiende el
  # "workspace:*" de pnpm sobre @metro/shared. esbuild bundlea, SAM sólo zipea.
  pnpm --filter @metro/backend build:lambda

  bundles=$(find packages/backend/.lambda -mindepth 1 -maxdepth 1 -type d | wc -l)
  [ "$bundles" -gt 0 ] || die "no se generó ningún bundle en .lambda/"
  info "$bundles funciones bundleadas"

  if grep -l 'require("@metro/shared")' packages/backend/.lambda/*/index.js 2>/dev/null; then
    die "@metro/shared quedó como require externo: en Lambda no existe"
  fi
  grep -q 'require("sharp")' packages/backend/.lambda/processPhoto/index.js \
    || die "processPhoto no dejó sharp como external: tiene que venir del layer"
  ok "artefactos"

  "${SAM_CMD[@]}" validate --lint --template packages/infra/template.yaml --region "$REGION"
  ok "template"

  if [ "$DRY_RUN" = 1 ]; then
    warn "dry-run: no se ejecuta sam deploy"
  else
    # Los parámetros van explícitos: samconfig.toml está gitignoreado y no
    # existe en CI, y SAM sin valor para SharpLayerArn falla el update.
    info "sam deploy → $STACK ($REGION)"
    if ! "${SAM_CMD[@]}" deploy \
      --template packages/infra/template.yaml \
      --stack-name "$STACK" \
      --region "$REGION" \
      --resolve-s3 \
      --capabilities CAPABILITY_IAM \
      --no-confirm-changeset \
      --no-fail-on-empty-changeset \
      --parameter-overrides \
        Environment=prod \
        "AdminEmail=$ADMIN_EMAIL" \
        "SharpLayerArn=$SHARP_LAYER"
    then
      die "sam deploy falló — mirá el error de arriba. El stack no queda a medias: CloudFormation aplica el changeset entero o nada, así que podés corregir y volver a correr."
    fi
    ok "backend desplegado"
  fi
fi

# ── frontend ──────────────────────────────────────────────────────────────
if [ "$DO_FRONTEND" = 1 ]; then
  step "Frontend"

  [ "$RESTORE_ENV_LOCAL" = 1 ] && mv "$ENV_LOCAL" "$ENV_LOCAL.deploying"

  # Vite hornea esto en el bundle, así que se regenera en cada deploy a partir
  # del stack: si el backend se recreó, los ids cambian.
  cat > packages/frontend/.env.production <<EOF
VITE_API_URL=$API_URL
VITE_COGNITO_USER_POOL_ID=$POOL_ID
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
EOF

  pnpm --filter @metro/frontend build

  if grep -rq 'localhost:4000' packages/frontend/dist/assets/*.js; then
    die "el bundle apunta a localhost: se coló el modo local"
  fi
  grep -rq 'execute-api' packages/frontend/dist/assets/*.js \
    || die "el bundle no tiene la URL del API"
  ok "bundle"

  if [ "$DRY_RUN" = 1 ]; then
    warn "dry-run: no se sube nada a S3"
  else
    # /assets lleva hash en el nombre -> cache eterno.
    # index.html, sw.js y manifest NO: un sw.js cacheado deja al que ya instaló
    # la app con ese service worker y ningún deploy posterior le llega.
    aws s3 sync packages/frontend/dist/ "s3://$FE_BUCKET/" --delete \
      --cache-control "public, max-age=31536000, immutable" \
      --exclude "index.html" --exclude "sw.js" --exclude "manifest.webmanifest"

    for f in index.html sw.js manifest.webmanifest; do
      aws s3 cp "packages/frontend/dist/$f" "s3://$FE_BUCKET/$f" \
        --cache-control "no-cache, no-store, must-revalidate"
    done

    # MSYS_NO_PATHCONV: sin esto Git Bash convierte /index.html a una ruta de
    # Windows y CloudFront rechaza la invalidación.
    MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation \
      --distribution-id "$CF_ID" \
      --paths "/index.html" "/sw.js" "/manifest.webmanifest" \
      --query 'Invalidation.Id' --output text >/dev/null
    ok "frontend desplegado e invalidado"
  fi
fi

# ── smoke test ────────────────────────────────────────────────────────────
if [ "$DRY_RUN" = 1 ]; then
  step "Listo (dry-run: no se tocó AWS)"
  exit 0
fi

step "Smoke test"

# Dos categorías distintas, porque significan cosas distintas: que un endpoint
# conteste lo que no esperábamos es un problema del deploy, y que no conteste
# nada puede ser de esta máquina (proxy, DNS, TLS) con el deploy intacto.
mismatches=0
unreachable=0

check() { # nombre, esperado, url, args extra...
  local name=$1 expected=$2 url=$3; shift 3
  local code errfile
  errfile=$(mktemp)
  # `|| true`: curl sale distinto de cero cuando no hay respuesta, y eso ya lo
  # leemos del código. Sin esto, set -e mata el script antes de reportar.
  code=$(curl -sS --connect-timeout 10 --max-time 30 \
           -o /dev/null -w '%{http_code}' "$@" "$url" 2>"$errfile") || true

  if [ "$code" = "$expected" ]; then
    ok "$name ($code)"
  elif [ -z "$code" ] || [ "$code" = "000" ]; then
    warn "$name: sin respuesta — $(tr -d '\r\n' < "$errfile" | cut -c1-120)"
    unreachable=$((unreachable + 1))
  else
    printf '%s    ✗ %s: esperaba %s, vino %s%s\n' "$RED" "$name" "$expected" "$code" "$OFF"
    mismatches=$((mismatches + 1))
  fi
  rm -f "$errfile"
}

check_body() { # nombre, url, patrón que tiene que aparecer
  local name=$1 url=$2 pattern=$3
  local body
  body=$(curl -sS --connect-timeout 10 --max-time 30 "$url" 2>/dev/null) || body=''
  if [ -z "$body" ]; then
    warn "$name: sin respuesta"
    unreachable=$((unreachable + 1))
  elif printf '%s' "$body" | grep -q "$pattern"; then
    ok "$name"
  else
    # CloudFront tiene CustomErrorResponses 403/404 -> index.html con status
    # 200, así que un archivo que no existe se ve como un 200 impecable. Por
    # eso estos dos se miran por contenido y no por código.
    printf '%s    ✗ %s: contesta, pero no es el archivo (¿falta desplegar el frontend?)%s\n' "$RED" "$name" "$OFF"
    mismatches=$((mismatches + 1))
  fi
}

check "galería pública"        200 "$API_URL/photos?limit=1"
check "settings públicos"      200 "$API_URL/settings"
check "upload sin token → 401" 401 "$API_URL/upload/presigned" -X POST
check "SPA"                    200 "$CF_URL/"
check "deep link SPA"          200 "$CF_URL/admin"

if [ "$DO_FRONTEND" = 1 ]; then
  check_body "manifest"       "$CF_URL/manifest.webmanifest" '"start_url"'
  check_body "service worker" "$CF_URL/sw.js"                'metro-'
fi

if [ "$mismatches" -gt 0 ]; then
  die "$mismatches chequeo(s) contestaron algo distinto a lo esperado — mirá los logs: sam logs --stack-name $STACK --tail"
fi

if [ "$unreachable" -gt 0 ]; then
  warn "$unreachable chequeo(s) no obtuvieron respuesta desde esta máquina (proxy, DNS o TLS)."
  warn "El deploy ya se aplicó: abrí $CF_URL en el browser antes de dar nada por roto."
fi

printf '\n%s✓ Deploy completo%s  %s\n' "$GREEN" "$OFF" "$CF_URL"
printf '%s  La invalidación de CloudFront tarda ~1-2 min en propagar.%s\n' "$DIM" "$OFF"
