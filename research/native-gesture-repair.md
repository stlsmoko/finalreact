# Native Overlay Gesture Repair

The prior overlay movement depended on React Native `PanResponder` around a live camera preview, which did not prove reliable in Android device testing. The repair uses `react-native-gesture-handler`, already included in the project and rooted at the app level.

Official documentation describes its gesture API as exposing native platform touch recognition, with gesture logic running in the native thread. Its Pan gesture tracks continuous X/Y translation values during the active gesture, which maps directly to repositioning the reaction bubble. [1] [2]

## References

[1]: https://docs.swmansion.com/react-native-gesture-handler/docs/legacy-gestures/pan-gesture/ "React Native Gesture Handler — Pan gesture"
[2]: https://docs.expo.dev/versions/latest/sdk/gesture-handler/ "Expo Documentation — react-native-gesture-handler"
