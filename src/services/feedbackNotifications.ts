import { storage } from './storage';
import { FeedbackItem } from '../types';

/**
 * Keeps a person's own feature requests / bug reports up to date in the browser and
 * tells the app when an admin changed one (so it can show a badge and a pop-up).
 */
type Listener = () => void;

const TOASTED_KEY = 'yousong_fb_toasted';

let items: FeedbackItem[] = [];
let loaded = false;
let timer: number | null = null;
const listeners = new Set<Listener>();

function readToasted(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TOASTED_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeToasted(map: Record<string, string>) {
  try {
    localStorage.setItem(TOASTED_KEY, JSON.stringify(map));
  } catch (_) {}
}

// The snapshot object only changes when something really changed (required by useSyncExternalStore)
let cachedState: ReturnType<typeof computeState> | null = null;

const emit = () => {
  cachedState = null;
  listeners.forEach((fn) => fn());
};

export const subscribeFeedback = (fn: Listener) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

function computeState() {
  const toasted = readToasted();
  const unread = items.filter((i) => i.unread);
  // The newest unread update that has not been announced with a pop-up yet
  const pendingToast =
    unread
      .filter((i) => toasted[i.id] !== i.updatedAt)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] || null;
  return { items, loaded, unreadCount: unread.length, pendingToast };
}

export const getFeedbackState = () => {
  if (!cachedState) cachedState = computeState();
  return cachedState;
};

export async function refreshFeedback(): Promise<void> {
  const list = await storage.getMyFeedback();
  items = list;
  loaded = true;
  emit();
}

export function markToasted(item: FeedbackItem) {
  const map = readToasted();
  map[item.id] = item.updatedAt;
  writeToasted(map);
  emit();
}

/** The person opened their reports: everything counts as seen */
export async function markAllSeen(): Promise<void> {
  items = items.map((i) => ({ ...i, unread: false }));
  emit();
  await storage.markMyFeedbackSeen();
}

export function startFeedbackPolling() {
  stopFeedbackPolling();
  refreshFeedback().catch(() => {});
  timer = window.setInterval(() => refreshFeedback().catch(() => {}), 30000);
}

export function stopFeedbackPolling() {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  items = [];
  loaded = false;
  emit();
}
