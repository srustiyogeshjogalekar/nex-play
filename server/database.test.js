import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from './database.js';
import { createAppServer } from './index.js';

describe('SQLite API', () => {
  let directory;
  let database;
  let server;
  let baseUrl;

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'nexplay-test-'));
    database = createDatabase(join(directory, 'test.sqlite'));
    server = createAppServer({ database });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise(resolve => server.close(resolve));
    database.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('seeds the sample catalog and persists app state', async () => {
    const videos = await fetch(`${baseUrl}/api/videos`).then(response => response.json());
    assert.deepEqual(videos.map(video => video.id), ['nature', 'focus', 'tech', 'travel']);

    const save = await fetch(`${baseUrl}/api/state/watch-later`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: ['nature'] })
    });
    assert.equal(save.status, 200);
    const premium = await fetch(`${baseUrl}/api/state/premium-status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: true })
    });
    assert.equal(premium.status, 200);
    const state = await fetch(`${baseUrl}/api/state`).then(response => response.json());
    assert.deepEqual(state['watch-later'], ['nature']);
    assert.equal(state['premium-status'], true);
  });

  it('stores uploaded video bytes in SQLite and serves them back', async () => {
    const create = await fetch(`${baseUrl}/api/videos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'user-test-video', title: 'Test upload', type: 'upload' })
    });
    assert.equal(create.status, 201);
    assert.equal((await create.json()).src, '/api/videos/user-test-video/file');

    const bytes = new Uint8Array([0, 1, 2, 3]);
    const upload = await fetch(`${baseUrl}/api/videos/user-test-video/file`, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4', 'x-file-name': 'test.mp4' },
      body: bytes
    });
    assert.equal(upload.status, 200);

    const download = await fetch(`${baseUrl}/api/videos/user-test-video/file?download=1`);
    assert.match(download.headers.get('content-disposition'), /test\.mp4/);
    assert.deepEqual([...new Uint8Array(await download.arrayBuffer())], [...bytes]);
  });

  it('rejects unsafe video URL schemes', async () => {
    const response = await fetch(`${baseUrl}/api/videos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'bad-url', title: 'Bad URL', type: 'url', src: 'file:///secret' })
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /HTTP and HTTPS/);
  });

  it('updates custom video duration without changing seeded catalog durations', async () => {
    const create = await fetch(`${baseUrl}/api/videos`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'duration-video', title: 'Duration video', type: 'url', src: 'https://videos.example/video.mp4' })
    });
    assert.equal(create.status, 201);

    const update = await fetch(`${baseUrl}/api/videos/duration-video`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration: 123.5 })
    });
    assert.equal(update.status, 200);
    const videos = await fetch(`${baseUrl}/api/videos`).then(response => response.json());
    assert.equal(videos.find(video => video.id === 'duration-video').duration, 123.5);
    assert.equal(videos.find(video => video.id === 'nature').duration, 1470);
  });

  it('creates local accounts, verifies passwords, and expires sessions on logout', async () => {
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: '  Test@Example.com ', password: 'a-secure-password' })
    });
    assert.equal(registration.status, 200);
    const account = await registration.json();
    assert.equal(account.account.email, 'test@example.com');
    const sessionCookie = registration.headers.get('set-cookie').split(';')[0];
    const savedAccount = database.getAccountByEmail('test@example.com');
    assert.notEqual(savedAccount.password_hash, 'a-secure-password');

    const duplicate = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'a-secure-password' })
    });
    assert.equal(duplicate.status, 409);

    const invalidLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'wrong-password' })
    });
    assert.equal(invalidLogin.status, 401);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'TEST@example.com', password: 'a-secure-password' })
    });
    assert.equal(login.status, 200);
    const loginCookie = login.headers.get('set-cookie').split(';')[0];
    const currentAccount = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: loginCookie } }).then(response => response.json());
    assert.equal(currentAccount.account.email, 'test@example.com');

    const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie: loginCookie } });
    assert.equal(logout.status, 200);
    const loggedOut = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie: loginCookie } }).then(response => response.json());
    assert.equal(loggedOut.account, null);
  });

  it('requires passwords of at least eight characters during registration', async () => {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'short@example.com', password: 'short' })
    });
    assert.equal(response.status, 400);
  });
});
