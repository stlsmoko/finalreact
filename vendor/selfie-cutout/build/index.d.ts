export type PersonMaskResult = {
  directory: string;
  pattern: string;
  fps: number;
  frameCount: number;
};

export declare function createPersonMask(videoUri: string): Promise<PersonMaskResult>;

declare const _default: {
  createPersonMask: typeof createPersonMask;
};

export default _default;
