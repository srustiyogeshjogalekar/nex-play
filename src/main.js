import { formatTime, remainingTime, completionStatus, nextSpeed, progressPercent, SPEEDS, COMPLETION_PERCENT } from './player.js';
import './style.css';

const app = document.querySelector('#app');
let videos = [
  { id: 'nature', title: 'Nature Beauty in 4K', sub: 'Relaxing landscapes • 4K HDR', duration: 1470, src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', poster: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=85' },
  { id: 'focus', title: 'Deep Focus Music', sub: 'Ambient • Study', duration: 3600, src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', poster: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=80' },
  { id: 'tech', title: 'Tech Trends 2026', sub: 'Technology • 18 min', duration: 1090, src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', poster: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80' },
  { id: 'travel', title: 'Travel the World', sub: 'Travel • 22 min', duration: 1335, src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', poster: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80' }
];
const USER_VIDEOS_KEY = 'nexplay-user-videos';
const VIDEO_DB_NAME = 'nexplay-video-library';
const navigation = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'explore', label: 'Explore', icon: '⌕' },
  { id: 'my-videos', label: 'My Videos', icon: '▰' },
  { id: 'downloads', label: 'Downloads', icon: '⇩' },
  { id: 'subscriptions', label: 'Subscriptions', icon: '▣' },
  { id: 'watch-later', label: 'Watch Later', icon: '◷' },
  { id: 'liked-videos', label: 'Liked Videos', icon: '♡' },
  { id: 'history', label: 'History', icon: '◴' },
  { id: 'meetings', label: 'Meetings', icon: '▣' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
  { id: 'help', label: 'Help & Support', icon: '?' }
];
const THRESHOLD_KEY = 'nexplay-completion-threshold';
const WATCH_LATER_KEY = 'nexplay-watch-later';
const LIKED_VIDEOS_KEY = 'nexplay-liked-videos';
const HISTORY_KEY = 'nexplay-history';
const STATE_KEYS = new Map([
  [WATCH_LATER_KEY, 'watch-later'],
  [LIKED_VIDEOS_KEY, 'liked-videos'],
  [HISTORY_KEY, 'history']
]);
let appState = {};
let databaseReady = false;
let signedInAccount = null;
let signInMode = 'login';
let completionThreshold = COMPLETION_PERCENT;
let current = 0;
let theater = false;
let countdown = null;
let hideControlsTimer = null;
let statusTimer = null;
let lastSavedAt = 0;
let pendingResumeId = null;
let previewRequest = 0;
let previewRequestedSrc = '';
let pointerInput = false;

app.innerHTML = `
<header><div class="brand"><span class="logo">▶</span>NexPlay</div><div class="search">⌕ <input placeholder="Search videos, courses, or topics…"></div><button id="add-video-header">＋ Add video</button><a class="profile" href="#sign-in" aria-label="Sign in">🔔 <span class="avatar">↪</span> Sign in</a></header>
<aside><nav aria-label="Main navigation">${navigation.map((item, i) => `<a href="#${item.id}" class="nav-link ${i === 0 ? 'active' : ''}" data-view="${item.id}" aria-label="${item.label}" title="${item.label}" ${i === 0 ? 'aria-current="page"' : ''}><span aria-hidden="true">${item.icon}</span><span>${item.label}</span></a>`).join('')}</nav><div class="upgrade"><b>👑 Upgrade to Premium</b><p>Get unlimited access to premium content!</p><button id="upgrade-now">Upgrade Now</button></div><small>© 2026 NexPlay. All rights reserved.</small></aside>
<main><section class="layout" id="home-view"><div class="left">
<div class="player" id="player">
  <video id="video" playsinline preload="metadata"></video>
  <div class="quality">Auto · <span id="quality">—</span></div>
  <div class="centerplay" id="centerplay" role="button" tabindex="0" aria-label="Play video">▶</div>
  <div class="player-status" id="player-status" role="status" aria-live="polite" hidden></div>
  <div class="nextbox" id="nextbox" hidden>Next video in <b id="count">10</b>s <button id="cancel">Cancel</button></div>
  <div class="preview" id="preview" aria-hidden="true"><video id="preview-frame" muted playsinline preload="none"></video><span id="preview-time">0:00</span></div>
  <div class="controls" id="controls">
    <div class="timeline" id="timeline"><div class="buffered" id="buffered"></div><input id="seek" type="range" min="0" max="1000" value="0" aria-label="Timeline"></div>
    <div class="controlrow">
      <button id="play" title="Play/Pause (Space)" aria-label="Play">▶</button>
      <button id="back" title="Back 10 seconds (←)" aria-label="Back 10 seconds">↶10</button>
      <button id="forward" title="Forward 10 seconds (→)" aria-label="Forward 10 seconds">↷10</button>
      <button id="mute" title="Mute (M)" aria-label="Mute">🔊</button>
      <input id="volume" type="range" min="0" max="1" step=".05" value=".8" aria-label="Volume">
      <span class="time"><span id="now">0:00</span> / <span id="duration">0:00</span> <em id="remaining">-0:00</em></span>
      <button id="speed" title="Playback speed (1)">1×</button>
      <button id="captions" title="Captions (C)" aria-label="Toggle captions">CC</button>
      <button id="pip" title="Picture in Picture (P)" aria-label="Picture in Picture">▣</button>
      <button id="theater" title="Theater mode (T)" aria-label="Theater mode">▭</button>
      <button id="fullscreen" title="Fullscreen (F)" aria-label="Fullscreen">⛶</button>
    </div>
  </div>
</div>
<h1 id="title"></h1><div class="meta">◉ 25.5K views　 ▦ Oct 4, 2026　 ◷ <span id="length">24 min 30 sec</span>　 <b>HD</b><span class="actions"> <button id="like-video" aria-label="Like video">♡ Like</button> <button>♧ Share</button> <button id="save-video" aria-label="Save video to Watch Later">▣ Watch Later</button></span></div>
<div class="tabs"><b>About</b><span>Comments (124)</span><span>Related Videos</span></div><p class="desc">Experience breathtaking visuals in stunning quality. Relax and enjoy the amazing landscapes, wildlife and more…</p>
<div class="watch"><span>🟢 Watch Progress: <b id="watchpct">0%</b></span><div class="bar"><i id="watchbar"></i></div><span id="complete">In progress</span><label for="completion-threshold">Complete at</label><select id="completion-threshold" aria-label="Completion percentage"><option value="80">80%</option><option value="90">90%</option><option value="95">95%</option></select></div>
<h2>Recommended for You</h2><div class="recommend" id="recommend"></div></div>
<div class="right"><div class="playlist"><div class="plhead"><b>Up Next</b><span>Related</span></div><div id="items"></div></div><div class="shortcuts"><b>⌨ Keyboard Shortcuts</b><p><span>Space</span> Play / Pause　 <span>M</span> Mute<br><span>← →</span> Seek ±10s　 <span>1</span> Speed<br><span>Shift + ← →</span> Skip ±30s　 <span>P</span> PiP<br><span>↑ ↓</span> Volume　 <span>F</span> Fullscreen<br><span>T</span> Theater　 <span>C</span> Captions<br><span>N</span> Next video</p></div></div></section><section id="page-view" class="page-view" aria-live="polite" hidden></section></main>
<dialog id="add-video-dialog"><form id="add-video-form"><h2>Add a video</h2><label class="form-field">Video title<input name="title" type="text" maxlength="120" required placeholder="Give your video a title"></label><fieldset><legend>Video source</legend><label><input type="radio" name="source-type" value="url" checked> Video URL</label><label><input type="radio" name="source-type" value="upload"> Upload file</label></fieldset><label class="form-field" id="url-source">Video URL<input name="url" type="url" required placeholder="https://example.com/video.mp4"></label><label class="form-field" id="file-source" hidden>Video file<input name="file" type="file" accept="video/*"></label><p class="form-error" id="add-video-error" role="alert"></p><div class="dialog-actions"><button type="button" id="cancel-add-video">Cancel</button><button type="submit" class="primary-button">Add video</button></div></form></dialog>
<dialog id="premium-dialog" aria-labelledby="premium-title"><div class="premium-content"><div class="premium-crown" aria-hidden="true">👑</div><h2 id="premium-title">NexPlay Premium</h2><p class="premium-lead">Enjoy an uninterrupted, upgraded viewing experience.</p><ul><li>Ad-free video viewing</li><li>Unlimited access to premium content</li><li>Offline downloads for supported videos</li><li>Premium playback features</li></ul><p class="premium-notice" id="premium-notice" role="status">Checkout is not connected in this demo. No payment will be taken.</p><div class="dialog-actions"><button type="button" id="close-premium">Maybe later</button><button type="button" id="premium-checkout" class="primary-button">Continue to checkout</button></div></div></dialog>`;

const $ = id => document.getElementById(id);
const video = $('video');
const previewVideo = $('preview-frame');
const player = $('player');
video.volume = 0.8;

function showStatus(message) {
  $('player-status').textContent = message;
  $('player-status').hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $('player-status').hidden = true; }, 3500);
}

function updateAuthHeader() {
  const profile = document.querySelector('.profile');
  profile.setAttribute('aria-label', signedInAccount ? `Sign out ${signedInAccount.email}` : 'Sign in');
  profile.innerHTML = signedInAccount
    ? `🔔 <span class="avatar">${escapeHtml(signedInAccount.email[0].toUpperCase())}</span> ${escapeHtml(signedInAccount.email)} · Sign out`
    : '🔔 <span class="avatar">↪</span> Sign in';
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      message = `Request failed (${response.status}).`;
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function saveState(key, value) {
  appState[key] = value;
  if (!databaseReady) return Promise.resolve();
  return apiRequest(`/api/state/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value })
  }).catch(error => {
    showStatus(`Could not save your data to the database: ${error.message}`);
  });
}

function cancelCountdown() {
  clearInterval(countdown);
  countdown = null;
  $('nextbox').hidden = true;
}

function storedIds(key) {
  const values = appState[STATE_KEYS.get(key) || key];
  return Array.isArray(values) ? values.filter(value => videos.some(item => item.id === value)) : [];
}

function storeIds(key, ids) {
  return saveState(STATE_KEYS.get(key) || key, ids);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function readLegacyUpload(id) {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Browser video storage is not available for migration.'));
      return;
    }
    const request = indexedDB.open(VIDEO_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('uploads');
    request.onerror = () => reject(request.error || new Error('Could not open legacy browser video storage.'));
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction('uploads', 'readonly');
      const get = transaction.objectStore('uploads').get(id);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => reject(get.error || new Error('Could not read a saved browser video.'));
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
    };
  });
}

function parseLegacyValue(value) {
  try { return JSON.parse(value); } catch { return undefined; }
}

async function migrateLegacyData() {
  const legacyState = [
    [THRESHOLD_KEY, 'completion-threshold', value => Number(value)],
    [WATCH_LATER_KEY, 'watch-later', parseLegacyValue],
    [LIKED_VIDEOS_KEY, 'liked-videos', parseLegacyValue],
    [HISTORY_KEY, 'history', parseLegacyValue]
  ];
  for (const [oldKey, newKey, convert] of legacyState) {
    const oldValue = localStorage.getItem(oldKey);
    if (oldValue === null || Object.hasOwn(appState, newKey)) continue;
    const value = convert(oldValue);
    if (value === undefined) continue;
    await apiRequest(`/api/state/${newKey}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value })
    });
    appState[newKey] = value;
  }
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith('nexplay-progress-')) continue;
    const id = key.slice('nexplay-progress-'.length);
    const stateKey = `progress:${id}`;
    if (Object.hasOwn(appState, stateKey)) continue;
    const value = parseLegacyValue(localStorage.getItem(key));
    if (value === undefined) continue;
    await apiRequest(`/api/state/${encodeURIComponent(stateKey)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value })
    });
    appState[stateKey] = value;
  }

  const legacyRecords = parseLegacyValue(localStorage.getItem(USER_VIDEOS_KEY)) || [];
  if (!Array.isArray(legacyRecords)) return;
  const knownIds = new Set((await apiRequest('/api/videos')).map(item => item.id));
  for (const record of legacyRecords) {
    if (!record || typeof record.id !== 'string' || knownIds.has(record.id)) continue;
    const type = record.type === 'upload' ? 'upload' : 'url';
    const source = type === 'url' ? safeVideoUrl(record.src) : null;
    await apiRequest('/api/videos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: record.id, title: record.title, type, src: source, sub: record.sub })
    });
    knownIds.add(record.id);
    if (type !== 'upload') continue;
    const file = await readLegacyUpload(record.id);
    if (!(file instanceof Blob)) {
      await apiRequest(`/api/videos/${record.id}`, { method: 'DELETE' });
      continue;
    }
    await apiRequest(`/api/videos/${record.id}/file`, {
      method: 'PUT',
      headers: { 'content-type': file.type || 'video/mp4', 'x-file-name': encodeURIComponent(file.name || `${record.title}.mp4`) },
      body: file
    });
  }
}

async function initializeDatabase() {
  const auth = await apiRequest('/api/auth/me');
  signedInAccount = auth.account;
  updateAuthHeader();
  const state = await apiRequest('/api/state');
  appState = state && typeof state === 'object' ? state : {};
  await migrateLegacyData();
  appState = await apiRequest('/api/state');
  const loadedVideos = await apiRequest('/api/videos');
  if (!Array.isArray(loadedVideos) || loadedVideos.length === 0) throw new Error('The database returned an empty video catalog.');
  const selectedId = videos[current]?.id;
  videos = loadedVideos.map(item => ({ ...item, duration: Number(item.duration) || 0 }));
  databaseReady = true;
  const savedThreshold = Number(appState['completion-threshold']);
  completionThreshold = [80, 90, 95].includes(savedThreshold) ? savedThreshold : COMPLETION_PERCENT;
  $('completion-threshold').value = String(completionThreshold);
  renderLists();
  loadVideo(Math.max(0, videos.findIndex(item => item.id === selectedId)));
  renderNavigation();
}

function safeVideoUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP or HTTPS video URL.');
  return url.href;
}

function renderCurrentVideoActions() {
  const item = videos[current];
  const liked = storedIds(LIKED_VIDEOS_KEY).includes(item.id);
  const saved = storedIds(WATCH_LATER_KEY).includes(item.id);
  $('like-video').textContent = liked ? '♥ Liked' : '♡ Like';
  $('like-video').setAttribute('aria-pressed', String(liked));
  $('save-video').textContent = saved ? '✓ In Watch Later' : '▣ Watch Later';
  $('save-video').setAttribute('aria-pressed', String(saved));
  const isPremium = appState['premium-status'] === true;
  $('premium-notice').textContent = isPremium ? 'Premium is active for this account.' : 'Checkout is not connected in this demo. No payment will be taken.';
  $('premium-checkout').hidden = isPremium;
}

function renderPage(view) {
  const page = $('page-view');
  if (view === 'sign-in') {
    const registering = signInMode === 'register';
    page.innerHTML = `<section class="sign-in-card"><span class="sign-in-logo">▶</span><h1>${registering ? 'Create your account' : 'Welcome back'}</h1><p class="page-description">${registering ? 'Create a local NexPlay account.' : 'Sign in to continue to NexPlay.'}</p><form id="sign-in-form"><label class="form-field">Email address<input name="email" type="email" autocomplete="email" required placeholder="you@example.com"></label><label class="form-field">Password<input name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" minlength="${registering ? '8' : '1'}" maxlength="128" required placeholder="${registering ? 'At least 8 characters' : 'Enter your password'}"></label><button class="primary-button" type="submit">${registering ? 'Create account' : 'Sign in'}</button><p class="sign-in-status" id="sign-in-status" role="status"></p><p class="sign-in-switch">${registering ? 'Already have an account?' : 'New to NexPlay?'} <button id="toggle-auth-mode" type="button">${registering ? 'Sign in' : 'Create account'}</button></p></form><p class="sign-in-note">This local demo stores account credentials securely in its SQLite database.</p></section>`;
    return;
  }
  if (view === 'downloads') {
    page.innerHTML = `<div class="page-heading"><div><h1>Downloads</h1><p class="page-description">Download a video file to your device, or add your own video to NexPlay.</p></div><button id="add-video-page" class="primary-button">＋ Add video</button></div><p id="download-status" role="status" aria-live="polite"></p><div class="download-grid">${videos.map((item, index) => `<article class="download-card"><img src="${escapeHtml(item.poster || videos[0].poster)}" alt=""><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.sub || 'Video')} · ${formatTime(item.duration)}</small><div><button class="download-action" data-download-index="${index}">⇩ Download</button><button class="play-action" data-play-index="${index}">▶ Play</button></div></article>`).join('')}</div>`;
    return;
  }
  const pageData = {
    explore: { title: 'Explore', description: 'Discover videos from across NexPlay.', ids: videos.map(item => item.id) },
    'my-videos': { title: 'My Videos', description: 'Your video library.', ids: videos.map(item => item.id) },
    'watch-later': { title: 'Watch Later', description: 'Videos you have saved to watch later.', ids: storedIds(WATCH_LATER_KEY) },
    'liked-videos': { title: 'Liked Videos', description: 'Videos you have liked.', ids: storedIds(LIKED_VIDEOS_KEY) },
    history: { title: 'History', description: 'Your recently watched videos.', ids: storedIds(HISTORY_KEY) }
  };
  if (pageData[view]) {
    const { title, description, ids } = pageData[view];
    const entries = ids.map(id => ({ item: videos.find(videoItem => videoItem.id === id), index: videos.findIndex(videoItem => videoItem.id === id) })).filter(entry => entry.item);
    page.innerHTML = `<h1>${title}</h1><p class="page-description">${description}</p>${entries.length ? `<div class="library-grid">${entries.map(({ item, index }) => `<button class="library-card" data-i="${index}"><img src="${escapeHtml(item.poster || videos[0].poster)}" alt=""><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.sub || 'Video')} · ${formatTime(item.duration)}</small></button>`).join('')}</div>` : `<div class="empty-state"><h2>Nothing here yet</h2><p>Videos you add will appear here.</p><a href="#explore">Explore videos</a></div>`}`;
    return;
  }
  const pages = {
    subscriptions: ['Subscriptions', 'You are not subscribed to any channels yet.', 'Explore videos'],
    meetings: ['Meetings', 'There are no upcoming meetings.', 'Go to Home'],
    settings: ['Settings', 'Choose when a video is marked as completed.', `<label class="settings-control" for="settings-completion-threshold">Completion threshold <select id="settings-completion-threshold"><option value="80">80%</option><option value="90">90%</option><option value="95">95%</option></select></label>`],
    help: ['Help & Support', 'Use the player shortcuts: Space to play or pause, arrow keys to seek or adjust volume, and M to mute.', 'Go to Home']
  };
  const [title, description, action] = pages[view] || pages.home;
  page.innerHTML = `<h1>${title}</h1><div class="empty-state"><p>${description}</p>${view === 'settings' ? action : `<a href="${view === 'downloads' || view === 'subscriptions' ? '#explore' : '#home'}">${action}</a>`}</div>`;
  if (view === 'settings') $('settings-completion-threshold').value = String(completionThreshold);
}

function renderNavigation() {
  const requestedView = location.hash.slice(1);
  const view = navigation.some(item => item.id === requestedView) || requestedView === 'sign-in' ? requestedView : 'home';
  $('home-view').hidden = view !== 'home';
  $('page-view').hidden = view === 'home';
  if (view !== 'home') {
    video.pause();
    saveCurrentProgress();
    renderPage(view);
  }
  document.querySelectorAll('.nav-link').forEach(link => {
    const active = link.dataset.view === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = `${view === 'sign-in' ? 'Sign in' : navigation.find(item => item.id === view)?.label || 'Home'} — NexPlay`;
}

function renderLists() {
  $('items').innerHTML = videos.map((v, i) => `<div class="item ${i === current ? 'selected' : ''}" data-i="${i}"><img src="${escapeHtml(v.poster || videos[0].poster)}" alt=""><div><b>${escapeHtml(v.title)}</b><small>${formatTime(v.duration)}</small></div></div>`).join('');
  $('recommend').innerHTML = videos.map((v, i) => `<div class="rec" data-i="${i}"><img src="${escapeHtml(v.poster || videos[0].poster)}" alt=""><b>${escapeHtml(v.title)}</b><small>${escapeHtml(v.sub || 'Video')}</small></div>`).join('');
}

function saveCurrentProgress() {
  if (!video.src || !Number.isFinite(video.currentTime)) return;
  const duration = video.duration || videos[current].duration;
  saveState(`progress:${videos[current].id}`, {
    current: video.currentTime,
    duration,
    updatedAt: Date.now(),
    completed: completionStatus(video.currentTime, duration, completionThreshold)
  });
  lastSavedAt = video.currentTime;
}

function loadVideo(index, autoplay = false) {
  cancelCountdown();
  saveCurrentProgress();
  video.pause();
  current = (index + videos.length) % videos.length;
  const item = videos[current];
  const history = storedIds(HISTORY_KEY).filter(id => id !== item.id);
  storeIds(HISTORY_KEY, [item.id, ...history]);
  pendingResumeId = item.id;
  lastSavedAt = 0;
  video.src = item.src;
  video.poster = item.poster;
  previewVideo.src = item.src;
  previewVideo.preload = 'none';
  previewRequestedSrc = '';
  $('title').textContent = item.title;
  $('length').textContent = formatTime(item.duration);
  $('duration').textContent = formatTime(item.duration);
  $('quality').textContent = 'Loading';
  $('watchpct').textContent = '0%';
  $('watchbar').style.width = '0%';
  $('complete').textContent = 'In progress';
  $('seek').value = '0';
  $('buffered').style.width = '0%';
  $('captions').disabled = true;
  $('captions').classList.remove('on');
  player.classList.add('loading');
  renderCurrentVideoActions();
  renderLists();
  video.load();
  if (autoplay) video.play().catch(error => showStatus(`Playback could not start: ${error.message}`));
}

function updateQuality() {
  const height = video.videoHeight;
  $('quality').textContent = height ? `${height}p` : 'Auto';
}

function sync() {
  const duration = Number.isFinite(video.duration) ? video.duration : videos[current].duration;
  const currentTime = video.currentTime || 0;
  const percent = progressPercent(currentTime, duration);
  $('now').textContent = formatTime(currentTime);
  $('duration').textContent = formatTime(duration);
  $('remaining').textContent = remainingTime(duration, currentTime);
  $('seek').value = String(percent * 10);
  $('seek').style.setProperty('--played', `${percent}%`);
  $('seek').setAttribute('aria-valuetext', `${formatTime(currentTime)} of ${formatTime(duration)}`);
  $('watchpct').textContent = `${Math.round(percent)}%`;
  $('watchbar').style.width = `${percent}%`;
  $('complete').textContent = completionStatus(currentTime, duration, completionThreshold) ? '✓ Marked as completed' : 'In progress';
  $('play').textContent = video.paused ? '▶' : 'Ⅱ';
  $('play').setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
  $('centerplay').style.opacity = video.paused ? '1' : '0';
  const bufferedEnd = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
  $('buffered').style.width = `${progressPercent(bufferedEnd, duration)}%`;
  $('mute').textContent = video.muted || video.volume === 0 ? '🔇' : '🔊';
  $('volume').value = String(video.volume);
  $('captions').classList.toggle('on', [...video.textTracks].some(track => track.mode === 'showing'));
  updateQuality();
}

function playOrPause() {
  if (video.paused) video.play().catch(error => showStatus(`Playback could not start: ${error.message}`));
  else video.pause();
}

function seekBy(seconds) {
  if (!Number.isFinite(video.duration)) return;
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
}

function next() {
  cancelCountdown();
  loadVideo(current + 1, true);
}

function openAddVideoDialog() {
  const dialog = $('add-video-dialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else showStatus('Adding videos is not supported by this browser.');
  $('add-video-error').textContent = '';
}

function setDownloadMessage(message) {
  const status = $('download-status');
  if (status) status.textContent = message;
  else showStatus(message);
}

async function downloadVideo(index, button) {
  const item = videos[index];
  if (!item || button.disabled) return;
  button.disabled = true;
  button.textContent = 'Preparing…';
  try {
    const response = await fetch(item.src);
    if (!response.ok) throw new Error(`The video server returned ${response.status}.`);
    const file = await response.blob();
    if (!file.size) throw new Error('The downloaded file was empty.');
    if (file.type.startsWith('text/html')) throw new Error('The URL returned a web page instead of a video file.');
    const downloadUrl = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    const mimeExtension = file.type.split('/')[1]?.split(';')[0];
    const urlExtension = new URL(item.src, location.href).pathname.match(/\.([a-z0-9]{2,5})$/i)?.[1];
    const extension = mimeExtension && mimeExtension !== 'octet-stream' ? mimeExtension : (urlExtension || 'mp4');
    const filename = `${item.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'video'}.${extension}`;
    anchor.href = downloadUrl;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
    setDownloadMessage(`Download started: ${filename}`);
  } catch (error) {
    setDownloadMessage(`Could not download "${item.title}". The video host may block downloads; choose a downloadable URL or try another video. (${error.message})`);
  } finally {
    button.disabled = false;
    button.textContent = '⇩ Download';
  }
}

async function addVideo(event) {
  event.preventDefault();
  const form = $('add-video-form');
  const data = new FormData(form);
  const title = String(data.get('title') || '').trim();
  const sourceType = data.get('source-type');
  const submit = form.querySelector('[type="submit"]');
  const error = $('add-video-error');
  error.textContent = '';
  if (!title) {
    error.textContent = 'Enter a video title.';
    return;
  }
  submit.disabled = true;
  try {
    const id = `user-${crypto.randomUUID()}`;
    let item;
    if (sourceType === 'url') {
      const src = safeVideoUrl(String(data.get('url') || ''));
      item = await apiRequest('/api/videos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, title, type: 'url', src, sub: 'Added video' })
      });
    } else {
      const file = data.get('file');
      if (!(file instanceof File) || !file.size || !file.type.startsWith('video/')) {
        throw new Error('Choose a valid video file to upload.');
      }
      item = await apiRequest('/api/videos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, title, type: 'upload', sub: 'Uploaded video' })
      });
      try {
        await apiRequest(`/api/videos/${encodeURIComponent(id)}/file`, {
          method: 'PUT',
          headers: { 'content-type': file.type, 'x-file-name': encodeURIComponent(file.name) },
          body: file
        });
      } catch (uploadError) {
        await apiRequest(`/api/videos/${encodeURIComponent(id)}`, { method: 'DELETE' });
        throw uploadError;
      }
    }
    videos.push({ ...item, duration: Number(item.duration) || 0 });
    renderLists();
    $('add-video-dialog').close();
    form.reset();
    $('url-source').hidden = false;
    $('file-source').hidden = true;
    $('url-source').querySelector('input').required = true;
    $('file-source').querySelector('input').required = false;
    if (location.hash === '#downloads' || location.hash === '#my-videos' || location.hash === '#explore') renderPage(location.hash.slice(1));
    setDownloadMessage(`Added "${title}" to your videos.`);
  } catch (addError) {
    error.textContent = addError instanceof TypeError && String(data.get('url') || '').trim() ? 'Enter a valid HTTP or HTTPS video URL.' : addError.message;
  } finally {
    submit.disabled = false;
  }
}

renderLists();
$('completion-threshold').value = String(completionThreshold);
loadVideo(0);
renderNavigation();
window.addEventListener('hashchange', renderNavigation);
initializeDatabase().catch(error => showStatus(`Could not connect to the database: ${error.message}`));

video.addEventListener('loadedmetadata', () => {
  const item = videos[current];
  if (item.type && item.type !== 'sample' && Number.isFinite(video.duration)) {
    item.duration = video.duration;
    $('length').textContent = formatTime(video.duration);
    apiRequest(`/api/videos/${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ duration: video.duration })
    }).catch(error => showStatus(`Could not save video details: ${error.message}`));
  }
  if (pendingResumeId === videos[current].id) {
    const savedProgress = appState[`progress:${videos[current].id}`];
    const position = savedProgress && !savedProgress.completed && Number.isFinite(savedProgress.current) ? savedProgress.current : 0;
    if (position > 0 && position < video.duration) video.currentTime = position;
    pendingResumeId = null;
  }
  updateQuality();
  $('captions').disabled = video.textTracks.length === 0;
  sync();
});
video.addEventListener('timeupdate', () => {
  sync();
  if (video.currentTime - lastSavedAt >= 10) saveCurrentProgress();
});
video.addEventListener('durationchange', sync);
video.addEventListener('progress', sync);
video.addEventListener('play', () => { sync(); scheduleHideControls(); });
video.addEventListener('pause', () => { sync(); saveCurrentProgress(); clearTimeout(hideControlsTimer); $('controls').classList.remove('hidden'); });
video.addEventListener('volumechange', sync);
video.addEventListener('loadeddata', () => player.classList.remove('loading'));
video.addEventListener('canplay', () => player.classList.remove('loading'));
video.addEventListener('waiting', () => player.classList.add('loading'));
video.addEventListener('loadstart', () => player.classList.add('loading'));
video.addEventListener('error', () => {
  player.classList.remove('loading');
  showStatus('This video could not be loaded. Please try again.');
});
video.addEventListener('seeked', saveCurrentProgress);
video.addEventListener('ended', () => {
  saveCurrentProgress();
  $('nextbox').hidden = false;
  let seconds = 10;
  $('count').textContent = String(seconds);
  countdown = setInterval(() => {
    seconds -= 1;
    $('count').textContent = String(seconds);
    if (seconds <= 0) next();
  }, 1000);
});
video.textTracks.addEventListener?.('addtrack', () => { $('captions').disabled = video.textTracks.length === 0; });
video.textTracks.addEventListener?.('change', sync);

$('play').onclick = playOrPause;
$('centerplay').onclick = playOrPause;
$('centerplay').onkeydown = event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); playOrPause(); }
};
video.addEventListener('click', playOrPause);
$('back').onclick = () => seekBy(-10);
$('forward').onclick = () => seekBy(10);
$('seek').oninput = event => {
  if (Number.isFinite(video.duration)) video.currentTime = (Number(event.target.value) / 1000) * video.duration;
};
$('seek').addEventListener('change', saveCurrentProgress);
$('volume').oninput = event => { video.volume = Number(event.target.value); video.muted = video.volume === 0; };
$('mute').onclick = () => { video.muted = !video.muted; };
$('speed').onclick = () => {
  video.playbackRate = nextSpeed(video.playbackRate);
  $('speed').textContent = `${video.playbackRate}×`;
};
$('pip').onclick = async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else if (video.requestPictureInPicture) await video.requestPictureInPicture();
    else showStatus('Picture in Picture is not supported by this browser.');
  } catch (error) { showStatus(`Picture in Picture failed: ${error.message}`); }
};
$('theater').onclick = () => {
  theater = !theater;
  player.classList.toggle('theater', theater);
  $('theater').classList.toggle('on', theater);
};
$('fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (player.requestFullscreen) await player.requestFullscreen();
    else showStatus('Fullscreen is not supported by this browser.');
  } catch (error) { showStatus(`Fullscreen failed: ${error.message}`); }
};
document.addEventListener('fullscreenchange', () => $('fullscreen').classList.toggle('on', Boolean(document.fullscreenElement)));
$('captions').onclick = () => {
  const tracks = [...video.textTracks];
  if (!tracks.length) return;
  const showing = tracks.some(track => track.mode === 'showing');
  tracks.forEach((track, index) => { track.mode = !showing && index === 0 ? 'showing' : 'hidden'; });
  sync();
};
$('cancel').onclick = cancelCountdown;
$('completion-threshold').onchange = event => {
  completionThreshold = Number(event.target.value);
  saveState('completion-threshold', completionThreshold);
  const settingsThreshold = $('settings-completion-threshold');
  if (settingsThreshold) settingsThreshold.value = String(completionThreshold);
  sync();
  saveCurrentProgress();
};
$('page-view').addEventListener('change', event => {
  if (event.target.id !== 'settings-completion-threshold') return;
  completionThreshold = Number(event.target.value);
  saveState('completion-threshold', completionThreshold);
  $('completion-threshold').value = String(completionThreshold);
  sync();
  saveCurrentProgress();
});
$('page-view').addEventListener('submit', async event => {
  if (event.target.id !== 'sign-in-form') return;
  event.preventDefault();
  const form = event.target;
  const email = new FormData(form).get('email');
  const password = new FormData(form).get('password');
  const status = $('sign-in-status');
  const endpoint = signInMode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  status.textContent = '';
  try {
    const result = await apiRequest(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    signedInAccount = result.account;
    updateAuthHeader();
    signInMode = 'login';
    location.hash = '#home';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
$('like-video').onclick = () => {
  const ids = storedIds(LIKED_VIDEOS_KEY);
  storeIds(LIKED_VIDEOS_KEY, ids.includes(videos[current].id) ? ids.filter(id => id !== videos[current].id) : [videos[current].id, ...ids]);
  renderCurrentVideoActions();
  if (location.hash === '#liked-videos') renderPage('liked-videos');
};
$('save-video').onclick = () => {
  const ids = storedIds(WATCH_LATER_KEY);
  storeIds(WATCH_LATER_KEY, ids.includes(videos[current].id) ? ids.filter(id => id !== videos[current].id) : [videos[current].id, ...ids]);
  renderCurrentVideoActions();
  if (location.hash === '#watch-later') renderPage('watch-later');
};
$('items').onclick = event => {
  const item = event.target.closest('[data-i]');
  if (item) loadVideo(Number(item.dataset.i), true);
};
$('recommend').onclick = event => {
  const item = event.target.closest('[data-i]');
  if (item) loadVideo(Number(item.dataset.i), true);
};
$('page-view').onclick = event => {
  const downloadButton = event.target.closest('[data-download-index]');
  if (downloadButton) {
    downloadVideo(Number(downloadButton.dataset.downloadIndex), downloadButton);
    return;
  }
  const playButton = event.target.closest('[data-play-index]');
  if (playButton) {
    loadVideo(Number(playButton.dataset.playIndex), true);
    if (location.hash !== '#home') location.hash = '#home';
    return;
  }
  if (event.target.closest('#add-video-page')) {
    openAddVideoDialog();
    return;
  }
  const item = event.target.closest('[data-i]');
  if (!item) return;
  loadVideo(Number(item.dataset.i), true);
  if (location.hash !== '#home') location.hash = '#home';
};
$('add-video-header').onclick = openAddVideoDialog;
$('page-view').addEventListener('click', event => {
  if (!(event.target instanceof HTMLElement) || !event.target.closest('#toggle-auth-mode')) return;
  signInMode = signInMode === 'login' ? 'register' : 'login';
  renderPage('sign-in');
});
document.querySelector('.profile').addEventListener('click', async event => {
  if (!signedInAccount) return;
  event.preventDefault();
  const profile = event.currentTarget;
  profile.setAttribute('aria-busy', 'true');
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    signedInAccount = null;
    updateAuthHeader();
    signInMode = 'login';
    location.hash = '#sign-in';
  } catch (error) {
    showStatus(`Could not sign out: ${error.message}`);
  } finally {
    profile.removeAttribute('aria-busy');
  }
});
$('cancel-add-video').onclick = () => $('add-video-dialog').close();
$('add-video-form').addEventListener('submit', addVideo);
$('upgrade-now').onclick = () => {
  $('premium-notice').textContent = appState['premium-status'] === true
    ? 'Premium is active for this account.'
    : 'Checkout is not connected in this demo. No payment will be taken.';
  $('premium-checkout').hidden = appState['premium-status'] === true;
  $('premium-dialog').showModal();
};
$('close-premium').onclick = () => $('premium-dialog').close();
$('premium-checkout').onclick = () => {
  $('premium-notice').textContent = 'Premium checkout is not available yet. No upgrade or payment was made.';
};
$('add-video-form').addEventListener('change', event => {
  if (event.target.name !== 'source-type') return;
  const isUrl = event.target.value === 'url';
  $('url-source').hidden = !isUrl;
  $('file-source').hidden = isUrl;
  $('url-source').querySelector('input').required = isUrl;
  $('file-source').querySelector('input').required = !isUrl;
});

function isTypingTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

document.addEventListener('keydown', event => {
  if (isTypingTarget(event.target)) return;
  pointerInput = false;
  $('controls').classList.remove('hidden');
  if (!video.paused) scheduleHideControls();
  if (event.key === ' ' && event.target instanceof HTMLElement && event.target.closest('button,[role="button"]')) return;
  switch (event.key.toLowerCase()) {
    case ' ': event.preventDefault(); playOrPause(); break;
    case 'arrowleft': event.preventDefault(); seekBy(event.shiftKey ? -30 : -10); break;
    case 'arrowright': event.preventDefault(); seekBy(event.shiftKey ? 30 : 10); break;
    case 'arrowup':
      event.preventDefault();
      video.volume = Math.min(1, video.volume + .05);
      video.muted = false;
      break;
    case 'arrowdown':
      event.preventDefault();
      video.volume = Math.max(0, video.volume - .05);
      break;
    case 'm': $('mute').click(); break;
    case '1': $('speed').click(); break;
    case 'p': $('pip').click(); break;
    case 't': $('theater').click(); break;
    case 'c': if (!$('captions').disabled) $('captions').click(); break;
    case 'f': $('fullscreen').click(); break;
    case 'n': next(); break;
  }
});

function scheduleHideControls() {
  clearTimeout(hideControlsTimer);
  hideControlsTimer = setTimeout(() => {
    if (!video.paused && (pointerInput || !player.contains(document.activeElement))) $('controls').classList.add('hidden');
  }, 2800);
}

player.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  pointerInput = true;
  $('controls').classList.remove('hidden');
  if (!video.paused) scheduleHideControls();
});
player.addEventListener('pointerleave', () => { if (!video.paused) scheduleHideControls(); });
player.addEventListener('dblclick', event => {
  if (event.target === video) $('fullscreen').click();
});

function updatePreview(event) {
  const bounds = $('timeline').getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  const time = fraction * (video.duration || 0);
  const preview = $('preview');
  preview.style.left = `${fraction * 100}%`;
  $('preview-time').textContent = formatTime(time);
  preview.style.display = 'block';
  const request = ++previewRequest;
  if (previewVideo.readyState >= 1 && previewVideo.src === video.src) {
    if (Math.abs(previewVideo.currentTime - time) > .35) previewVideo.currentTime = time;
  } else if (request === previewRequest && previewRequestedSrc !== video.src) {
    previewRequestedSrc = video.src;
    previewVideo.preload = 'metadata';
    previewVideo.load();
  }
}
$('timeline').addEventListener('pointermove', updatePreview);
$('timeline').addEventListener('pointerleave', () => { $('preview').style.display = 'none'; });
previewVideo.addEventListener('loadedmetadata', () => {
  const bounds = $('timeline').getBoundingClientRect();
  const fraction = Number.parseFloat($('preview').style.left) / 100;
  if (bounds.width && Number.isFinite(fraction)) previewVideo.currentTime = fraction * (video.duration || 0);
});
previewVideo.addEventListener('play', () => previewVideo.pause());

window.addEventListener('beforeunload', saveCurrentProgress);
