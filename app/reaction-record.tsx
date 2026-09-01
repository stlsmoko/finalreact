/* eslint-disable react-hooks/refs */
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEvent, useEventListener } from "expo";
import { setAudioModeAsync } from "expo-audio";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { router, useIsFocused } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import {
  beginReactionCameraRecording,
  clampOverlayToRect,
  getContainedVideoRect,
  getRecordingStartBlocker,
  type OverlayPosition,
} from "@/lib/reaction-project";
import { pruneReactionCache } from "@/lib/reaction-cache";
import { getCurrentSource, setCurrentReaction, setCurrentRoute, clearSession } from "@/lib/reaction-session";
import { composeReactionVideo } from "@/lib/video-compositor";
import SelfieCutoutNative from "selfie-cutout";
