import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultDist = fileURLToPath(new URL('../dist/', import.meta.url));
const defaultTemplate = fileURLToPath(new URL('./offline-worker.template.js', import.meta.url));
const contentTypes = {
  '.html': ['text/html'],
  '.js': ['text/javascript', 'application/javascript'],
  '.mjs': ['text/javascript', 'application/javascript'],
  '.css': ['text/css'],
  '.json': ['application/json'],
  '.webmanifest': ['application/manifest+json', 'application/json'],
  '.png': ['image/png'], '.svg': ['image/svg+xml'],
  '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'], '.webp': ['image/webp'],
  '.gif': ['image/gif'], '.ico': ['image/x-icon', 'image/vnd.microsoft.icon'],
  '.woff': ['font/woff', 'application/font-woff'], '.woff2': ['font/woff2'],
};

async function listFiles(directory, base = directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(filename, base));
    else if (entry.isFile()) files.push(path.relative(base, filename).split(path.sep).join('/'));
    else throw new Error(`离线资源不能使用符号链接：${filename}`);
  }
  return files.sort();
}

/** Generate a complete, version-pinned app shell from the exact dist contents. */
export async function buildOffline({ distDir = defaultDist, templatePath = defaultTemplate, write = true } = {}) {
  const template = await readFile(templatePath, 'utf8');
  if (!template.includes('__OFFLINE_VERSION__') || !template.includes('__OFFLINE_ASSETS__')) {
    throw new Error('离线缓存模板缺少版本或资源占位符。');
  }
  const paths = (await listFiles(distDir)).filter(filename => filename !== 'sw.js');
  if (!paths.includes('index.html')) throw new Error('离线资源缺少 index.html。');
  const assets = [];
  for (const filename of paths) {
    const body = await readFile(path.join(distDir, filename));
    assets.push({
      path: filename,
      sha256: createHash('sha256').update(body).digest('hex'),
      types: contentTypes[path.extname(filename).toLowerCase()] ?? ['application/octet-stream'],
    });
  }
  // Include worker behavior and every asset digest, so either kind of change creates a fresh cache.
  const version = createHash('sha256').update(template).update('\0').update(JSON.stringify(assets)).digest('hex').slice(0, 24);
  const source = template.replace('__OFFLINE_VERSION__', JSON.stringify(version)).replace('__OFFLINE_ASSETS__', JSON.stringify(assets, null, 2));
  if (write) await writeFile(path.join(distDir, 'sw.js'), source);
  return { version, assets, source, cacheName: `knit-studio-shell-${version}` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildOffline();
  console.log(`离线资源已生成：${result.assets.length} 项，版本 ${result.version}`);
}
