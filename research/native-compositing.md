# Native Picture-in-Picture Compositing Decision

The user-required output is one MP4 containing the selected source clip, a positioned reaction camera overlay, and mixed audio. The current Expo camera/video modules can capture and play tracks but do not render those tracks into a new composite video file.

An FFmpeg overlay/mix filter was validated locally against generated video and audio inputs. However, the Android package compatible with this Expo 54 project (`ffmpeg-kit-react-native`) is archived and its required Maven artifact is no longer available. The newer `ffmpeg-expo` package supports filtergraphs but requires Expo 56+, React 19.2+, and React Native 0.85+, while this project is Expo 54 / React 19.1 / React Native 0.81.

The compositor experiment was removed rather than leaving an APK build that would fail. A maintained native render engine or a deliberate Expo/React Native upgrade is required before this app can truthfully produce the requested merged reaction file.

## Sources

- https://github.com/arthenica/ffmpeg-kit
- https://www.npmjs.com/package/ffmpeg-kit-react-native
- https://github.com/kingjnr4/ffmpeg-expo
- https://www.npmjs.com/package/ffmpeg-expo
