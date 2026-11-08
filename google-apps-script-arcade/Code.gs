/**
 * YouSound Google-hosted Arcade compatibility test.
 *
 * This project serves a self-contained HTML game from Apps Script.
 * It intentionally has no external JavaScript, CSS, image, or game-host dependencies.
 */

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('YouSound // Google Arcade Test')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Confirms that the embedded page can call its Apps Script server.
 * Does not expose account or project information.
 */
function arcadePing() {
  return {
    ok: true,
    service: 'YouSound Google Arcade',
    timestamp: new Date().toISOString()
  };
}
