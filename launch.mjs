import http from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STUDIO_URL = 'http://127.0.0.1:4173/';
const projectRoot = dirname(fileURLToPath(import.meta.url));
const pageTitle = '<title>织间 · Knit Studio</title>';
const sleep = milliseconds => new Promise(done => setTimeout(done, milliseconds));

/** Only a refused connection means the port is available for a new server. */
export function probeStudio() {
  return new Promise((resolveProbe, reject) => {
    const request = http.get(STUDIO_URL, { timeout: 1500 }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error('4173 端口已被占用，或本地页面响应异常。请检查正在运行的程序后重试。'));
        return;
      }
      response.setEncoding('utf8');
      let body = '';
      response.on('data', chunk => {
        body += chunk;
        if (body.length > 512 * 1024) {
          response.destroy();
          reject(new Error('4173 端口返回的页面不是编织工具，请检查占用此端口的程序。'));
        }
      });
      response.once('end', () => {
        if (body.includes(pageTitle)) resolveProbe('ready');
        else reject(new Error('4173 端口正在被其他程序使用，无法打开编织工具。'));
      });
      response.once('error', error => reject(new Error('读取本地编织工具页面失败，请稍后重试。', { cause: error })));
    });
    request.once('timeout', () => request.destroy(new Error('本地地址响应超时，请检查正在运行的程序后重试。')));
    request.once('error', error => {
      if (error.code === 'ECONNREFUSED') resolveProbe('offline');
      else reject(new Error(`无法连接本地编织工具：${error.message}`, { cause: error }));
    });
  });
}

export function launchServer() {
  return new Promise((resolveLaunch, reject) => {
    const child = spawn(process.execPath, [resolve(projectRoot, 'server.mjs')], {
      cwd: projectRoot,
      env: { ...process.env, PORT: '4173' },
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolveLaunch(); });
  });
}

/** Small injectable workflow keeps checks deterministic without touching the user's running server. */
export async function ensureStudioRunning({
  probe = probeStudio,
  launch = launchServer,
  delay = sleep,
  maxAttempts = 40,
  intervalMs = 200,
} = {}) {
  const initial = await probe();
  if (initial === 'ready') return { started: false, url: STUDIO_URL };
  if (initial !== 'offline') throw new Error('无法确认本地工具状态，启动已停止。');
  try { await launch(); }
  catch (error) { throw new Error('编织工具启动失败，请确认 Node.js 已安装且工具文件完整。', { cause: error }); }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await delay(intervalMs);
    const status = await probe();
    if (status === 'ready') return { started: true, url: STUDIO_URL };
    if (status !== 'offline') throw new Error('本地工具启动后状态异常，请重新打开。');
  }
  throw new Error('编织工具启动超时，请重新双击打开；若仍失败，请检查工具目录中的 server.mjs。');
}

function openBrowser() {
  return new Promise((resolveOpen, reject) => {
    const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(command, [STUDIO_URL], { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', error => reject(new Error(`工具已经启动，但浏览器未能自动打开。请访问 ${STUDIO_URL}`, { cause: error })));
    child.once('spawn', () => { child.unref(); resolveOpen(); });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(argument => argument !== '--no-open')) throw new Error('启动参数不正确。请直接双击“打开编织工具.cmd”。');
  const result = await ensureStudioRunning();
  console.log(`${result.started ? '编织工具已在后台启动' : '编织工具已在运行'}：${result.url}`);
  if (!args.includes('--no-open')) await openBrowser();
}

const invokedPath = process.argv[1] && resolve(process.argv[1]);
const modulePath = fileURLToPath(import.meta.url);
const isMain = invokedPath && (process.platform === 'win32' ? invokedPath.toLowerCase() === modulePath.toLowerCase() : invokedPath === modulePath);
if (isMain) main().catch(error => { console.error(error.message); process.exitCode = 1; });
