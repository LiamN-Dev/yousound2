/**
 * YouSound Crossy Road-style arcade prototype.
 * Self-contained HTML served through Google Apps Script.
 * Scores/coins are stored in the player's browser for this standalone prototype.
 */
function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('YouSound // Crossy Road')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function arcadePing() {
  return {
    ok: true,
    service: 'YouSound Crossy Road',
    timestamp: new Date().toISOString()
  };
}
