# YouSound Google Apps Script Arcade Test

This is a self-contained compatibility test for a Google-hosted game page. The game itself is an original, tiny Canvas runner called Photon Drift. It intentionally loads no JavaScript libraries, CSS frameworks, fonts, images, or game files from external hosts.

The purpose is to test whether a deployed Apps Script web app can be opened and embedded in Google Sites on the school network. It is not yet the production YouSound arcade, and its best score is stored only in the current browser's local storage.

## Create the Apps Script project

1. Open [script.google.com](https://script.google.com/) and create a new project.
2. Replace the contents of `Code.gs` with this folder's `Code.gs`.
3. Click **+** beside Files, choose **HTML**, and name the file `Index`.
4. Paste this folder's `Index.html` into that HTML file.
5. Save the project.

## Deploy a first private test

1. Click **Deploy → New deployment**.
2. Select **Web app** as the deployment type.
3. For **Execute as**, choose **Me**.
4. For **Who has access**, start with the narrowest choice that lets you test while signed in on the school device. Do not make it public just to test.
5. Click **Deploy**, complete any required authorization, and copy the web app URL ending in `/exec`.

## Embed in Google Sites

1. Open the Google Site you control.
2. Choose **Insert → Embed → By URL**.
3. Paste the deployed Apps Script `/exec` URL and insert it.
4. Resize the embed to give the game a useful amount of space.
5. Publish the Site and open it on the school device/network.

Apps Script HTML Service runs inside a sandboxed iframe. This demo is self-contained, but browser and domain restrictions can still apply. If the school blocks the web app or its redirect target, ask the school's IT administrator to review and approve the official Google Apps Script web app domains. This test is not intended to evade school filtering.

## What success looks like

- The page opens inside Google Sites.
- The footer reads **APPS SCRIPT SERVER ONLINE**.
- The Start button launches Photon Drift.
- Arrow keys, A/D, and touch controls move between lanes.
- No request to the YouSound Cloudflare Worker or Render server is needed for this test.

## Next step

Once the school-network test works, we can choose how to package actual YouSound games for a Google-hosted build. That is a separate engineering task: the current Crossy Road files are produced by a build pipeline and are not yet included in this Apps Script project. We also need an approved way to connect gameplay results to YouSound accounts; the prototype does not save account coins or leaderboard results.
