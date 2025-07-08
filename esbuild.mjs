import * as esbuild from 'esbuild';
import fs from 'fs-extra';
import { glob } from 'glob';
const { copy, readJson, writeJson } = fs;

const outdir = 'dist';

// 1. Clean the output directory
console.log(`Cleaning directory: ${outdir}`);
// No rm -rf here, esbuild has a clean option if needed, or we handle it in prod script.

// 2. Bundle all JavaScript entry points
console.log('Bundling JavaScript...');
const entryPoints = [
  'background.js',
  'popup.js',
  'content.js',
  'selection-extractor.js',
  'twitter-extractor.js',
];

await Promise.all(
  entryPoints.map(entryPoint =>
    esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile: `${outdir}/${entryPoint}`,
      format: 'iife',
      target: 'chrome100',
      logLevel: 'info',
      loader: { '.js': 'jsx' },
    })
  )
).catch(() => process.exit(1));
console.log('JavaScript bundled successfully.');

// 3. Copy all static assets to the dist folder
console.log('Copying static assets...');
try {
  const staticFiles = [
    'popup.html',
    'popup.css',
    'jszip.min.js',
  ];
  const iconFiles = await glob('*.png');
  const allFilesToCopy = [...staticFiles, ...iconFiles];

  await Promise.all(
    allFilesToCopy.map(file => copy(file, `${outdir}/${file}`))
  );
  console.log('Static assets copied successfully.');
} catch (err) {
  console.error('Error copying static assets:', err);
  process.exit(1);
}

// 4. Create the production manifest
console.log('Creating production manifest...');
try {
  const sourceManifest = await readJson('manifest.json');
  
  // Modify the manifest for the bundled version
  const distManifest = {
    ...sourceManifest,
    background: {
      service_worker: 'background.js' // Path is now relative to the dist root
    }
  };
  // The 'type: module' is removed by spreading and not including it.

  await writeJson(`${outdir}/manifest.json`, distManifest, { spaces: 2 });
  console.log('Production manifest created successfully.');
} catch (err) {
  console.error('Error creating production manifest:', err);
  process.exit(1);
}

console.log('Build complete. The "dist" directory is ready.');
