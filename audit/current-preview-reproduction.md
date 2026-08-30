# Current Preview Reproduction

On 23 August 2026, the public web preview was opened and the **Choose a video** control was activated.

The label immediately changed to **Opening videos…**, proving that the press handler ran in the live preview. The browser file chooser is an operating-system dialog and was not exposed to the automated browser context, so a local file could not be selected to reach the reaction recorder in this run.

This reproduction does not demonstrate native camera recording. The web preview remains unsuitable for validating camera/microphone recording or combined-MP4 output.
