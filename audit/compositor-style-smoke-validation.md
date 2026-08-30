# Compositor Style Smoke Validation

- The circular overlay filter was rendered against synthetic source and reaction media. The extracted 720×1280 frame shows the reaction layer clipped to a true circle rather than a square.
- The green-key overlay filter was rendered against a fully green synthetic reaction source. The extracted frame shows the source background with no visible green reaction rectangle, confirming that the chroma-key branch removes the configured green background.
- The pause-and-talk filter graph rendered a readable MP4 with a frozen source interval and silent source-audio interval. The synthetic output duration matched the source duration plus the requested freeze duration until the shorter reaction recording ended.
- These checks validate the FFmpeg filter syntax and output geometry only. A real Android v1.0.7 capture is still required to validate device camera input, microphone acoustics, and the user-selected green-screen environment.
