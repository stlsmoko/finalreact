export type PublicVideoImport = {
  uri: string;
  fileName?: string;
  size?: number;
};

export declare function downloadPublicVideo(url: string): Promise<PublicVideoImport>;

declare const _default: {
  downloadPublicVideo: (url: string) => Promise<PublicVideoImport>;
};

export default _default;
