
export const SPEEDS = [0.5, 1, 1.25, 1.5, 2];
export const COMPLETION_PERCENT = 90;
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec=s%60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
}
export function remainingTime(duration,current) { return `-${formatTime(Math.max(0,duration-current))}`; }
export function completionStatus(current,duration,threshold=COMPLETION_PERCENT) {
  return duration>0 && current/duration*100>=threshold;
}
export function nextSpeed(current) {
  const i=SPEEDS.indexOf(Number(current)); return SPEEDS[(i+1+SPEEDS.length)%SPEEDS.length];
}
export function progressPercent(current,duration) { return duration>0 ? Math.min(100,Math.max(0,current/duration*100)):0; }
export function saveProgress(videoId,current,duration,storage=globalThis.localStorage,threshold=COMPLETION_PERCENT) {
  if(!videoId || !storage) return;
  storage.setItem(`nexplay-progress-${videoId}`,JSON.stringify({current,duration,updatedAt:Date.now(),completed:completionStatus(current,duration,threshold)}));
}
export function loadProgress(videoId,storage=globalThis.localStorage) {
  if(!videoId || !storage) return 0;
  try { const data=JSON.parse(storage.getItem(`nexplay-progress-${videoId}`)||"null"); return data && !data.completed && Number.isFinite(data.current) ? data.current : 0; }
  catch { return 0; }
}
