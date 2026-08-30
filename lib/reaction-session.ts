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

let currentSource: SourceVideo | null = null;
let currentReaction: ReactionTake | null = null;
let currentSharedLink: SharedLink | null = null;

export function setCurrentSource(source: SourceVideo) {
  currentSource = source;
  currentReaction = null;
}

export function getCurrentSource() {
  return currentSource;
}

export function setCurrentReaction(reaction: ReactionTake) {
  currentReaction = reaction;
}

export function getCurrentReaction() {
  return currentReaction;
}

export function setCurrentSharedLink(sharedLink: SharedLink) {
  currentSharedLink = sharedLink;
}

export function getCurrentSharedLink() {
  return currentSharedLink;
}
