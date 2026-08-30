# Share Intake Research Notes

## iOS

Apple documents **Share extensions** as the mechanism users select from the system share sheet. The extension receives initial text and attachments, including links, images, and videos, through its extension context. This is a separate native extension target with its own configuration, rather than a normal in-app deep link. [1]

## Android

Android documents incoming sharing through an activity declaration that accepts `ACTION_SEND` intent filters and appropriate MIME types. An application that supports `video/*` can be listed in the Android Sharesheet when another app sends compatible video content; the receiving activity must validate and handle the received item. [2]

## Product consequence

The initial Expo-managed build can safely support a manual **copied-link** fallback and locally selected video files. Making Reel Reactor appear directly as a destination in social apps’ Share menus needs platform-specific native share-intake work: an iOS Share extension and an Android `ACTION_SEND` receiver. Even then, the source app determines whether it shares a link, a video file, or neither. A shared link is not treated as authorization to retrieve or copy a platform-hosted video.

## References

[1]: https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/Share.html "Apple: App Extension Programming Guide — Share"
[2]: https://developer.android.com/develop/ui/compose/sharing/receive "Android Developers: Receive simple data from other apps"
