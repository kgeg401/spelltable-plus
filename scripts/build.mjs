import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
const metadata = `// ==UserScript==
// @name         SpellTable Plus
// @namespace    https://github.com/kgeg401/spelltable-plus
// @version      ${version}
// @description  Deck loadouts, a refreshed lobby, Moxfield sharing and keyword auto-join.
// @author       kgeg401
// @match        https://spelltable.wizards.com/*
// @match        https://spelltable.com/*
// @match        https://www.spelltable.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_setClipboard
// @downloadURL  https://raw.githubusercontent.com/kgeg401/spelltable-plus/main/dist/spelltable-plus.user.js
// @updateURL    https://raw.githubusercontent.com/kgeg401/spelltable-plus/main/dist/spelltable-plus.user.js
// ==/UserScript==`;
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/main.js'], outfile: 'dist/spelltable-plus.user.js', bundle: true,
  format: 'iife', target: 'es2022', banner: { js: metadata }, loader: { '.css': 'text' }, legalComments: 'none' });
await writeFile('dist/spelltable-plus.meta.js', metadata + '\n');
