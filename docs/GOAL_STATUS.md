# Matchmaking and card recognition

Active objective: finish online matchmaking and automatic card recognition. The user explicitly deferred hosting on September 22; build and verify the deployable service locally. Do not call cross-household connectivity verified until deployed and tested.

## Current evidence

- Server-authoritative public room listing, keyword inclusion/exclusion, atomic four-seat queue, cancellation, private tables, host lock/remove, hashed guest identities, reconnect grace, room expiry, heartbeat and rate limits.
- Separate Node service with origin allowlist and TURN shared-secret credential issuance; desktop accepts configurable WSS address and loopback WS for tests.
- Twenty automated JavaScript tests passed, including queue races, cancellation, private-room exclusion, moderation, seat expiration, and credential isolation.
- Four desktop profiles joined by keyword through a separate local service process. All twelve directed incoming video streams decoded and all twelve audio streams received packets. Counters/chat/commanders and reconnection passed.
- Local OpenCV recognizer performs feature retrieval plus homography verification, rejects weak geometry, and processes desktop video via a sandboxed IPC bridge to a bundled worker.
- Original reference set: 108 cards. Expanded set: 412 artwork variants from existing edit references plus Scryfall alternate artwork.
- Four development recognition checks passed: blank rejection, non-card rejection, rotation/perspective localization, and a labeled real development frame. These are not general accuracy measurements.
- Desktop end-to-end verification returned card candidates from real recorded playmat video transmitted over WebRTC.
- The final packaged Windows executable passed separate-process keyword matchmaking, all twelve video/audio streams, synchronized state, reconnect, and recognition from received footage. The worker runs without a system Python dependency.

## Remaining completion gates

- Inspect the broad footage-scan candidates, curate unseen positive and negative scenes, measure localization precision and recall. Investigate misses, alternate artwork, blur, glare, occlusion and low-resolution cards. Do not count machine labels as independent ground truth.
- Expand library coverage and give users a practical way to add their deck/card references. Current recognition is limited to installed artwork; it is not all of Magic.
- Finish recognition interaction polish and stable per-seat results; verify changing camera sources and late media start across clients.
- Repeat final packaged verification after any subsequent engine, network, or UI changes.
- Audit queue/network edge cases and run a longer soak test. Verify TURN relay transport when a relay becomes available. Hosting and real cross-network checks are deferred by the user, not silently claimed complete.

## Resumable work

Private generated files are in `.recognition` and `.local-media`, excluded from Git. `recognition/scan_footage.py` appends resumable machine candidates to `.recognition/footage-scan/detections.jsonl` at two-minute intervals in each readable source recording. Original files are preserved.

Build recognition runtime with PyInstaller as documented in the desktop guide. `npm run desktop:package -- --local-media` makes a personal test build containing the private video loops. Do not distribute that build publicly.
