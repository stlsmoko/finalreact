import AsyncStorage from "@react-native-async-storage/async-storage";

export type SourceVideo = {
  uri: string;
  name: string;
  durationMs?: number | null;
  width?: number;
  height?: number;
};

export type ReactionTake = {
  uri: string;
  recordedAt: number;
  isComposite: boolean;
};

export type SharedLink = {
  url: string;
  capturedAt: number;
};

type SessionSnapshot = {
  source: SourceVideo | null;
  reaction: ReactionTake | null;
  sharedLink: SharedLink | null;
  route: string | null;
  savedAt: number;
};

const STORAGE_KEY = "reel-reactor.session.v1";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

let currentSource: SourceVideo | null = null;
let currentReaction: ReactionTake | null = null;
let currentSharedLink: SharedLink | null = null;
let currentRoute: string | null = null;
let hydratePromise: Promise<SessionSnapshot> | null = null;

function snapshot(): SessionSnapshot {
  return {
    source: currentSource,
    reaction: currentReaction,
    sharedLink: currentSharedLink,
    route: currentRoute,
    savedAt: Date.now(),
  };
}

function persist() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot())).catch(() => undefined);
}

export function setCurrentSource(source: SourceVideo | null) {
  currentSource = source;
  if (source) currentReaction = null;
  persist();
}

export function getCurrentSource() {
  return currentSource;
}

export function setCurrentReaction(reaction: ReactionTake | null) {
  currentReaction = reaction;
  persist();
}

export function getCurrentReaction() {
  return currentReaction;
}

export function setCurrentSharedLink(sharedLink: SharedLink | null) {
  currentSharedLink = sharedLink;
  persist();
}

export function getCurrentSharedLink() {
  return currentSharedLink;
}

export function setCurrentRoute(route: string | null) {
  if (currentRoute === route) return;
  currentRoute = route;
  persist();
}

export function getCurrentRoute() {
  return currentRoute;
}

export function clearSession() {
  currentSource = null;
  currentReaction = null;
  currentSharedLink = null;
  currentRoute = null;
  persist();
}

export function sessionKeepUris() {
  return [currentSource?.uri, currentReaction?.uri].filter((uri): uri is string => Boolean(uri));
}

async function uriStillExists(uri: string) {
  if (uri.startsWith("http://") || uri.startsWith("https://")) return true;
  try {
    const FileSystem = await import("expo-file-system/legacy");
    const info = await FileSystem.getInfoAsync(uri);
    return Boolean(info.exists);
  } catch {
    return true;
  }
}

export function hydrateSession(): Promise<SessionSnapshot> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return snapshot();
        const parsed = JSON.parse(raw) as SessionSnapshot;
        if (!parsed?.savedAt || Date.now() - parsed.savedAt > SESSION_MAX_AGE_MS) {
          await AsyncStorage.removeItem(STORAGE_KEY);
          return snapshot();
        }
        if (parsed.source?.uri && (await uriStillExists(parsed.source.uri))) {
          currentSource = parsed.source;
        }
        if (parsed.reaction?.uri && (await uriStillExists(parsed.reaction.uri))) {
          currentReaction = parsed.reaction;
        }
        currentSharedLink = parsed.sharedLink ?? null;
        currentRoute = parsed.route ?? null;
        if (!currentSource && currentRoute === "/reaction-record") currentRoute = null;
        if (!currentReaction && currentRoute === "/review") currentRoute = currentSource ? "/reaction-record" : null;
      } catch {
        // Keep empty in-memory session.
      }
      return snapshot();
    })();
  }
  return hydratePromise;
}
