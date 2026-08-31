import type { ComponentType } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export type PersonMaskResult = {
  directory: string;
  pattern: string;
  fps: number;
  frameCount: number;
};

export type CutoutRecordingResult = {
  uri: string;
  fileName?: string;
  size?: number;
};

export type SelfieCutoutViewProps = {
  facing?: "front" | "back" | string;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "none" | "box-none" | "box-only" | "auto";
  onReady?: () => void;
  onError?: (event: { nativeEvent?: { message?: string } }) => void;
};

export declare const SelfieCutoutView: ComponentType<SelfieCutoutViewProps>;
export declare function createPersonMask(videoUri: string): Promise<PersonMaskResult>;
export declare function startRecording(): Promise<CutoutRecordingResult>;
export declare function stopRecording(): Promise<void>;

declare const _default: {
  createPersonMask: typeof createPersonMask;
  startRecording: typeof startRecording;
  stopRecording: typeof stopRecording;
  SelfieCutoutView: typeof SelfieCutoutView;
};

export default _default;
