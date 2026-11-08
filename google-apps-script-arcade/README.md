# YouSound Google-hosted Crossy Road prototype

This folder contains a self-contained Crossy Road-style game served by Google Apps Script HTML Service. It uses original Canvas-drawn voxel/isometric artwork and does not load an external game host, JavaScript library, image, font, or stylesheet.

The prototype includes:
- Hopping movement with keyboard and touch controls.
- Procedurally generated grass, traffic, rivers, logs, and train crossings.
- Coins, a local best score, and unlockable character skins.
- An Apps Script server ping so the page can show whether the Google-hosted runtime is connected.

Standalone /exec use stores the prototype's coins, character unlocks, and best score in that browser's local storage. It is not account-synced on its own.

## Set up or update the Apps Script project

1. Open https://script.google.com/ and open your existing YouSound Arcade project.
2. Replace all of Code.gs with this folder's Code.gs.
3. Click Index.html in the left file list and replace all of it with this folder's Index.html.
4. Save the project.

## Deploy the updated version

1. Click Deploy → Manage deployments.
2. Select the existing web app deployment and click the pencil/edit icon.
3. Under Version, choose New version.
4. Add a description such as Crossy Road voxel prototype.
5. Click Deploy and keep using the web app /exec URL for your existing deployment.

If you do not see an existing deployment, use Deploy → New deployment → Web app. Choose the narrowest access option that works for your intended test account.

## Embed in Google Sites

1. Open the Google Site you control.
2. Choose Insert → Embed → By URL.
3. Paste the Apps Script /exec URL.
4. Resize the embed to make room for the game, then publish the site.
5. Test it on the school device.

Apps Script HTML Service runs inside a sandboxed iframe. A self-contained page reduces external dependencies, but it cannot guarantee that a school's network will allow the service or its redirect domains. If blocked, ask school IT to review the official Google Apps Script domains; do not try to bypass school filtering.

## Optional: use this Google-hosted game inside the YouSound Crossy Road page

The website supports an optional Vite environment variable named VITE_GOOGLE_CROSSY_ROAD_URL. Set it to the deployed Apps Script /exec URL in the website's build environment, then redeploy the website.

When the Google-hosted page is used inside the YouSound Crossy Road player, it sends the same run-started/run-finished postMessage events the website uses to record game sessions, high scores, and account coins. The local character-unlock currency remains a browser-side prototype feature; YouSound's account coin balance and leaderboard are handled by the website's server.

The URL is optional. Without it, the website continues using its current Crossy Road game host.