# Standalone Windows preview

This is a local-only Electron app with its own room server. It does not connect to SpellTable. The original userscript remains available in `dist`.

## Run

- `npm install`
- `npm run desktop`: one desktop window. Create a table or join an existing code.
- `npm run desktop:four`: four windows with independent persistent profiles, automatically joined to one table.
- `npm run desktop:verify`: runs those windows, verifies received video/audio and synchronized state, disconnects/reconnects a player, saves local evidence, exits.
- `npm run desktop:package`: produces a Windows portable application folder in `release`.

Keep the complete portable folder together; the executable depends on its neighboring files. No installer or code signing is provided yet.

## Footage and cards

`python scripts/prepare-footage.py` samples the September recordings in the user's Videos folder, records unreadable files, collects existing card metadata from previous edit projects, and makes four short silent playmat loops. The source paths are specific to the owner's development machine. Originals are never modified. Private media, review images, source paths and desktop screenshots are gitignored and excluded from public packages.

The local test adds a quiet synthetic audio tone to each loop. Incoming test players are muted at playback to avoid four-window feedback. Receiving audio packets proves transport, not real microphone quality or acoustic echo cancellation.

Card search uses references already gathered for video edits. Frames have not been exhaustively labeled, and no automatic card recognizer has been trained. The inventory samples three times per readable recording; it does not claim every card or every frame has been analyzed.

## Implemented

Private room creation/codes; up to four seats; peer-to-peer video and audio; life and poison; commander/deck loadout persistence; validated Moxfield sharing to room chat; local card-reference search; reconnection with seat and counter retention. Four-window test uses separate browser sessions/renderers inside one desktop host process.

## Boundaries

Server binds only to 127.0.0.1. No online matchmaking, TURN service, accounts, internet deployment, host moderation, commander damage, or installer yet. Room state survives player reconnects, but not server shutdown. Disconnected seats stay reserved until the player reconnects and leaves; a production room-expiry policy remains to be implemented. Closing the process hosting the local server ends its rooms. Camera mode uses the default Windows camera/microphone; hardware selection and real-device verification remain pending.

## Visual implementation

Compact game-client design: gunmetal #23262b, nearblack #17191d, amber #dfa64a, Segoe UI, 2px control corners, 8px board gutters. Existing plain JavaScript conventions are retained.

Compared concept and captured Electron screen: 2x2 board and sidebar match; compact toolbar and footer match; amber actions and flat surfaces match; 13px controls are explicit; live media retains full frame rather than clipping cards. Intentional differences: real recording loops replace concept imagery, test identities replace invented player names, Windows supplies the titlebar, controls reflect actual media state, unsupported decorative settings are omitted. Tested at 1440x940 window size. Native Electron capture is used because the deliverable is the desktop app.
