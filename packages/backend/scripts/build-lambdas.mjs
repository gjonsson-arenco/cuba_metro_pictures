// Bundles each Lambda handler into .lambda/<name>/index.js
//
// We bundle here instead of letting `sam build` do it: SAM's esbuild workflow
// runs CopySource -> NpmInstall -> EsbuildBundle, and that NpmInstall always
// fails on the pnpm `workspace:*` dependency on @metro/shared. Bundling up
// front means `sam deploy` just zips the output, no npm involved.
//
// @metro/shared is inlined; sharp stays external and comes from the Lambda layer.

import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FUNCTIONS = [
  'listPhotos',
  'uploadPhotos',
  'tagPhotos',
  'deletePhoto',
  'downloadPhoto',
  'updatePhotoMetadata',
  'rotatePhoto',
  'processPhoto',
  'getSettings',
  'updateSettings',
  'listUsers',
  'createUser',
  'updateUser',
  'deleteUser',
  'resetUserPassword'
];

rmSync(resolve(root, '.lambda'), { recursive: true, force: true });

await Promise.all(
  FUNCTIONS.map((name) =>
    build({
      entryPoints: [resolve(root, `src/functions/${name}.ts`)],
      outfile: resolve(root, `.lambda/${name}/index.js`),
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'cjs',
      external: ['sharp'],
      sourcemap: false,
      logLevel: 'warning'
    })
  )
);

console.log(`Bundled ${FUNCTIONS.length} functions into .lambda/`);
