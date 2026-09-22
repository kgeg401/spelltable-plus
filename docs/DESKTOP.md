# Standalone Windows preview

This is an Electron app with its own matchmaking server and local card recognition. It does not connect to SpellTable. Hosting is deferred by the owner; online service behavior is tested using a separate server process on this PC. The original userscript remains available in `dist`.

## Run

- `npm install`
- `npm run desktop`: one desktop window. Create a table or join an existing code.
- `npm run desktop:four`: four windows with independent persistent profiles, automatically joined to one table.
- `npm run desktop:verify`: runs those windows, verifies received video/audio and synchronized state, disconnects/reconnects a player, saves local evidence, exits.
- `npm run desktop:package`: produces a Windows portable application folder in `release`.
- `npm run server`: starts the standalone matchmaking service on loopback port 47832.
- `npm run desktop:verify-online`: verifies keyword matchmaking through that separate local service and recognizes cards in received video. Start the server first.
- `npm run desktop:package -- --local-media`: personal test build with the owner's footage. Do not publish this build.

Keep the complete portable folder together; the executable depends on its neighboring files. No installer or code signing is provided yet.

## Footage and cards

`python scripts/prepare-footage.py` samples the September recordings in the user's Videos folder, records unreadable files, collects existing card metadata from previous edit projects, and makes four short silent playmat loops. The source paths are specific to the owner's development machine. Originals are never modified. Private media, review images, source paths and desktop screenshots are gitignored and excluded from public packages.

The local test adds a quiet synthetic audio tone to each loop. Incoming test players are muted at playback to avoid four-window feedback. Receiving audio packets proves transport, not real microphone quality or acoustic echo cancellation.

Card recognition uses local image features and geometric verification against an installed artwork library. Start it in a room; detections cycle through available video feeds and selecting a detected name opens its reference. Nothing is uploaded for recognition. The starter library covers the owner's 108 edit-reference card names and alternate artworks. Expand it using **Add cards to recognition** in the lobby: paste names or a decklist and download public reference artwork from Scryfall. Imports persist in the app's user-data folder. This is not a trained neural model or a preinstalled exhaustive Magic card library. No-match is an explicit result; accuracy on unseen footage is still being evaluated.

To prepare recognition on a development Windows PC:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r recognition/requirements.txt
.venv/Scripts/python.exe recognition/import_variants.py
.venv/Scripts/python.exe recognition/engine.py --index .recognition/index --build "$env:USERPROFILE/Videos" --additional .recognition
.venv/Scripts/python.exe -m PyInstaller --noconfirm --onedir --name recognizer --distpath .recognition/runtime --workpath .recognition/build recognition/engine.py
```

The importer is resumable and obtains public Scryfall artwork at a paced request rate. Private recordings are never sent to Scryfall. The packaged worker includes its runtime, so the resulting Windows app does not require Python installed separately. References retain source attribution URLs. Source-frame candidates from `recognition/scan_footage.py` must be reviewed before treating them as labels.

## Implemented

Private/public rooms; four-seat keyword auto-match queue and cancellation; peer-to-peer video/audio; life and poison; commander/deck persistence; validated Moxfield chat sharing; local card-reference search and image recognition; host locking/removal; reconnection with seat and counter retention. Four-window test uses separate sessions/renderers inside one desktop host process.

## Boundaries

Server binds to 127.0.0.1 by default. No hosted endpoint, verified cross-household connectivity, user accounts, commander damage, or installer yet. Room state survives player reconnects but not server shutdown. Disconnected seats expire after two minutes; rooms expire after twelve hours. Guest removal blocks that session identity, not a person who resets their profile. Camera mode uses the default Windows devices; real camera/microphone quality remains unverified.

## Deployable matchmaking service

`server/start.js` exposes only a health endpoint and WebSocket signaling/matchmaking; it serves no local footage or recognition data. `server/Dockerfile` is a deployment recipe (container build not tested on this machine). Terminate TLS at the host and use a `wss://` address in the desktop app. Only loopback addresses may use plaintext `ws://`.

Environment settings: `HOST`, `PORT`, `ALLOWED_ORIGINS` (comma-separated; desktop origin defaults to `http://127.0.0.1:47831`), `STUN_URLS`, `TURN_URLS`, and `TURN_SECRET`. TURN credentials are short-lived HMAC credentials for a compatible relay such as coturn; the shared secret remains server-side. No relay provider is currently configured. The app refreshes credentials during long sessions. Issuing credentials is tested; actual relay transport is not.

## Visual implementation

Compact game-client design: gunmetal #23262b, nearblack #17191d, amber #dfa64a, Segoe UI, 2px control corners, 8px board gutters. Existing plain JavaScript conventions are retained.

Compared concept and captured Electron screen: 2x2 board and sidebar match; compact toolbar and footer match; amber actions and flat surfaces match; 13px controls are explicit; live media retains full frame rather than clipping cards. Intentional differences: real recording loops replace concept imagery, test identities replace invented player names, Windows supplies the titlebar, controls reflect actual media state, unsupported decorative settings are omitted. Tested at 1440x940 window size. Native Electron capture is used because the deliverable is the desktop app.
