import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash, randomUUID } from 'node:crypto';
import { basename, extname, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDatabase } from './database.js';

const scrypt = promisify(scryptCallback);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;
const SESSION_COOKIE = 'nexplay_session';
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const AUTH_LIMIT = 10;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const authAttempts = new Map();
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readBody(request, limit) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

async function readJson(request) {
  const body = await readBody(request, MAX_JSON_BYTES);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function validateId(id) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new HttpError(400, 'Invalid video ID.');
  return id;
}

function validateSource(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, 'Enter a valid HTTP or HTTPS video URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'Only HTTP and HTTPS video URLs are supported.');
  return url.href;
}

function filenameHeader(filename) {
  const safe = basename(filename).replace(/[\r\n"]/g, '_');
  return `attachment; filename="${safe.replace(/[^\x20-\x7e]/g, '_')}"`;
}

function getSessionToken(request) {
  const cookies = String(request.headers.cookie || '').split(';');
  const value = cookies.map(cookie => cookie.trim()).find(cookie => cookie.startsWith(`${SESSION_COOKIE}=`));
  return value ? value.slice(SESSION_COOKIE.length + 1) : '';
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(response, token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('set-cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`);
}

function checkAuthLimit(request) {
  const now = Date.now();
  const address = request.socket.remoteAddress || 'unknown';
  const recent = (authAttempts.get(address) || []).filter(time => now - time < AUTH_WINDOW_MS);
  if (recent.length >= AUTH_LIMIT) throw new HttpError(429, 'Too many account attempts. Please try again later.');
  recent.push(now);
  authAttempts.set(address, recent);
}

function validateCredentials(body, registration = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Email and password are required.');
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (password.length > 128 || (registration && password.length < 8)) {
    throw new HttpError(400, registration ? 'Password must be between 8 and 128 characters.' : 'Invalid email or password.');
  }
  if (!password) throw new HttpError(400, 'Email and password are required.');
  return { email, password };
}

async function createSession(database, account, response) {
  const token = randomBytes(32).toString('base64url');
  database.createSession(hashToken(token), account.id, Date.now() + SESSION_LIFETIME_MS);
  setSessionCookie(response, token, Math.floor(SESSION_LIFETIME_MS / 1000));
  sendJson(response, 200, { account: { id: account.id, email: account.email } });
}

async function handleAuth(request, response, path, database) {
  if (request.method === 'GET' && path === '/api/auth/me') {
    const token = getSessionToken(request);
    const account = token ? database.getSessionAccount(hashToken(token)) : null;
    sendJson(response, 200, { account: account ? { id: account.id, email: account.email } : null });
    return true;
  }
  if ((request.method === 'POST' && ['/api/auth/register', '/api/auth/login'].includes(path))) {
    checkAuthLimit(request);
    const isRegistration = path.endsWith('/register');
    const { email, password } = validateCredentials(await readJson(request), isRegistration);
    if (isRegistration) {
      const passwordSalt = randomBytes(16);
      const passwordHash = await scrypt(password, passwordSalt, 64);
      const account = { id: randomUUID(), email, passwordHash: passwordHash.toString('hex'), passwordSalt: passwordSalt.toString('hex') };
      try {
        database.createAccount(account);
      } catch (error) {
        if (String(error.message).includes('UNIQUE constraint failed')) throw new HttpError(409, 'An account with this email already exists.');
        throw error;
      }
      await createSession(database, account, response);
    } else {
      const account = database.getAccountByEmail(email);
      const passwordSalt = account ? Buffer.from(account.password_salt, 'hex') : Buffer.alloc(16);
      const expectedHash = account ? Buffer.from(account.password_hash, 'hex') : Buffer.alloc(64);
      const actualHash = await scrypt(password, passwordSalt, 64);
      if (!account || !timingSafeEqual(expectedHash, actualHash)) throw new HttpError(401, 'Invalid email or password.');
      await createSession(database, account, response);
    }
    return true;
  }
  if (request.method === 'POST' && path === '/api/auth/logout') {
    const token = getSessionToken(request);
    if (token) database.deleteSession(hashToken(token));
    setSessionCookie(response, '', 0);
    sendJson(response, 200, { ok: true });
    return true;
  }
  return false;
}

async function handleApi(request, response, url, database) {
  const path = url.pathname;
  if (path.startsWith('/api/auth/') && await handleAuth(request, response, path, database)) return;
  if (request.method === 'GET' && path === '/api/health') {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === 'GET' && path === '/api/videos') {
    sendJson(response, 200, database.listVideos());
    return;
  }
  if (request.method === 'POST' && path === '/api/videos') {
    const body = await readJson(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'A video object is required.');
    const id = validateId(body.id);
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const type = body.type;
    if (!title || title.length > 120) throw new HttpError(400, 'Video title must be between 1 and 120 characters.');
    if (!['url', 'upload'].includes(type)) throw new HttpError(400, 'Video type must be url or upload.');
    const source = type === 'url' ? validateSource(body.src) : null;
    const sub = typeof body.sub === 'string' ? body.sub.slice(0, 240) : (type === 'upload' ? 'Uploaded video' : 'Added video');
    let item;
    try {
      item = database.createVideo({
        id,
        title,
        sub,
        duration: 0,
        src: source,
        poster: '',
        type
      });
    } catch (error) {
      if (String(error.message).includes('UNIQUE constraint failed')) throw new HttpError(409, 'A video with that ID already exists.');
      throw error;
    }
    sendJson(response, 201, item);
    return;
  }
  const fileMatch = path.match(/^\/api\/videos\/([^/]+)\/file$/);
  if (fileMatch) {
    const id = validateId(decodeURIComponent(fileMatch[1]));
    const video = database.getVideo(id);
    if (!video) throw new HttpError(404, 'Video not found.');
    if (request.method === 'PUT') {
      if (video.kind !== 'upload') throw new HttpError(409, 'Only uploaded videos can have a local file.');
      const mimeType = String(request.headers['content-type'] || '');
      if (!mimeType.startsWith('video/')) throw new HttpError(415, 'Upload a video file.');
      const data = await readBody(request, MAX_UPLOAD_BYTES);
      if (!data.length) throw new HttpError(400, 'The uploaded video file is empty.');
      let fileName = String(request.headers['x-file-name'] || `${video.title}.mp4`);
      try {
        fileName = decodeURIComponent(fileName);
      } catch {
        throw new HttpError(400, 'Invalid uploaded file name.');
      }
      fileName = fileName.slice(0, 255);
      database.setVideoFile(id, basename(fileName), mimeType, data);
      sendJson(response, 200, { ok: true, bytes: data.length });
      return;
    }
    if (request.method === 'GET') {
      const file = database.getVideoFile(id);
      if (!file) throw new HttpError(404, 'Video file is not available.');
      response.writeHead(200, {
        'content-type': file.mime_type,
        'content-length': file.data.length,
        'content-disposition': url.searchParams.has('download') ? filenameHeader(file.file_name) : `inline; filename="${basename(file.file_name).replace(/["\r\n]/g, '_')}"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store'
      });
      response.end(file.data);
      return;
    }
  }
  const videoMatch = path.match(/^\/api\/videos\/([^/]+)$/);
  if (videoMatch && request.method === 'PATCH') {
    const id = validateId(decodeURIComponent(videoMatch[1]));
    const video = database.getVideo(id);
    if (!video) throw new HttpError(404, 'Video not found.');
    const body = await readJson(request);
    if (typeof body.duration !== 'number' || !Number.isFinite(body.duration) || body.duration < 0) {
      throw new HttpError(400, 'Video duration must be a non-negative number.');
    }
    database.updateDuration(id, body.duration);
    sendJson(response, 200, { ok: true });
    return;
  }
  if (videoMatch && request.method === 'DELETE') {
    const id = validateId(decodeURIComponent(videoMatch[1]));
    if (!database.getVideo(id)) throw new HttpError(404, 'Video not found.');
    database.deleteVideo(id);
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === 'GET' && path === '/api/state') {
    sendJson(response, 200, database.getAllState());
    return;
  }
  const stateMatch = path.match(/^\/api\/state\/([^/]+)$/);
  if (stateMatch && request.method === 'PUT') {
    const key = decodeURIComponent(stateMatch[1]);
    if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(key)) throw new HttpError(400, 'Invalid state key.');
    const body = await readJson(request);
    if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'value')) throw new HttpError(400, 'A value field is required.');
    if (key === 'premium-status' && typeof body.value !== 'boolean') throw new HttpError(400, 'Premium status must be a boolean.');
    database.setState(key, body.value);
    sendJson(response, 200, { ok: true });
    return;
  }
  throw new HttpError(404, 'API route not found.');
}

function serveStatic(request, response, url, root) {
  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const rootPath = resolve(root);
  let target = resolve(rootPath, `.${requestedPath}`);
  if (target !== rootPath && !target.startsWith(`${rootPath}${sep}`)) throw new HttpError(403, 'Invalid file path.');
  if (!existsSync(target) || !statSync(target).isFile()) target = join(rootPath, 'index.html');
  if (!existsSync(target)) throw new HttpError(404, 'Built app not found. Run npm run build first.');
  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(target).toLowerCase()] || 'application/octet-stream',
    'x-content-type-options': 'nosniff'
  });
  createReadStream(target).pipe(response);
}

export function createAppServer({ database, staticRoot } = {}) {
  const db = database || createDatabase(process.env.NEXPLAY_DATABASE_PATH || join(ROOT, 'data', 'nexplay.sqlite'));
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');
      if (url.pathname.startsWith('/api/')) await handleApi(request, response, url, db);
      else if (staticRoot) serveStatic(request, response, url, staticRoot);
      else throw new HttpError(404, 'Route not found.');
    } catch (error) {
      if (response.headersSent) {
        response.destroy(error);
        return;
      }
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error(error);
      sendJson(response, status, { error: status === 500 ? 'Internal server error.' : error.message });
    }
  });
}

const isEntryPoint = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isEntryPoint) {
  const staticRoot = join(ROOT, 'dist');
  const server = createAppServer({ staticRoot: existsSync(join(staticRoot, 'index.html')) ? staticRoot : undefined });
  const port = Number(process.env.PORT || 4174);
  server.listen(port, '127.0.0.1', () => {
    console.log(`NexPlay API listening at http://127.0.0.1:${port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
