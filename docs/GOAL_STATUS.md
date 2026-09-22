# Matchmaking and card recognition

Completed local-preview objective: implement and verify matchmaking and automatic card recognition. The user explicitly deferred hosting on September 22; build and verify the deployable service locally. Do not call cross-household connectivity verified until deployed and tested.

## Current evidence

- Server-authoritative public room listing, keyword inclusion/exclusion, atomic four-seat queue, cancellation, private tables, host lock/remove, hashed guest identities, reconnect grace, room expiry, heartbeat and rate limits.
- Separate Node service with origin allowlist and TURN shared-secret credential issuance; desktop accepts configurable WSS address and loopback WS for tests.
- Twenty-two automated JavaScript tests passed, including queue races, cancellation, private-room exclusion, moderation, seat expiration, and credential isolation.
- Four desktop profiles joined by keyword through a separate local service process. All twelve directed incoming video streams decoded and all twelve audio streams received packets. Counters/chat/commanders and reconnection passed.
- Local OpenCV recognizer performs feature retrieval plus homography verification, rejects weak geometry, and processes desktop video via a sandboxed IPC bridge to a bundled worker.
- Original reference set: 108 cards. Expanded set: 412 artwork variants from existing edit references plus Scryfall alternate artwork.
- Four development recognition checks passed: blank rejection, non-card rejection, rotation/perspective localization, and a labeled real development frame. These are not general accuracy measurements.
- Desktop end-to-end verification returned card candidates from real recorded playmat video transmitted over WebRTC.
- The final packaged Windows executable passed separate-process keyword matchmaking, all twelve video/audio streams, synchronized state, reconnect, and recognition from received footage. The worker runs without a system Python dependency.
- Broad scan completed: 409 frames across 11 readable recordings, 729 machine candidates spanning 61 names, no processing errors. These counts are not accuracy estimates. One source MP4 remains unreadable.
- Added a lobby decklist/name importer that downloads artwork and extends a local atomic library bundle; an Ornithopter import added 11 references and an invalid name returned an explicit error. The packaged application verified import persistence across a worker restart.
- Visually audited 32 distinct-name low-inlier detections against reference artwork: 28 visually consistent, four indeterminate under blur/glare, no definite mismatch. This selected audit does not establish general precision or recall; private audit entries are `.recognition/audit/manifest.json`.

## Latest verification

- Fixed camera-off joins and late media start using negotiated bidirectional tracks. Three stop/start cycles preserved incoming feeds and resumed outgoing feeds.
- Recognition results are grouped by seat; weaker matches require consecutive observations, old results expire, and leaving seats are removed. Unit checks cover misses, expiry and seat isolation.
- Independently labeled 12 target cards in selected regions at three previously untested recording timestamps before inference. Result: 11 true positives, zero false positives inside those regions, one missed small Moggcatcher (IoU threshold 0.35). This is a small region-level evaluation, not full-frame or all-card recall. Private labels and report remain in `.recognition`.
- Packaged Windows executable passed actual coturn TURN-over-TCP relay transport with generated HMAC credentials: all twelve directed connections used relay candidates. A 120-second soak checked every five seconds that all twelve video streams and twelve audio streams continued advancing. Camera lifecycle, keyword matchmaking, state sync, reconnect and recognition from received footage also passed.

- The packaged worker imported the owner's saved 100-card Quandrix list (89 unique names), adding 1,175 artwork references for a total of 1,587 in an isolated test library. No import errors occurred; every name or combined-card face was present after restart, and recognition still returned matches from recorded footage. This artwork-heavy import took about nine minutes.

## Release boundaries

Hosting and real cross-network checks are deferred by the user. Real microphone/camera quality and a multi-hour public session remain unverified. Recognition only covers installed artwork and can miss small, blurred, reflective or occluded cards. The starter is a preview, not an exhaustive card database. Large imports can take several minutes, especially basic lands with many artwork variants.

## Resumable work

Private generated files are in `.recognition` and `.local-media`, excluded from Git. `recognition/scan_footage.py` appends resumable machine candidates to `.recognition/footage-scan/detections.jsonl` at two-minute intervals in each readable source recording. Original files are preserved.

Build recognition runtime with PyInstaller as documented in the desktop guide. `npm run desktop:package -- --local-media` makes a personal test build containing the private video loops. Do not distribute that build publicly.
