## YouTube Mode setup

YouTube Mode is activated by entering the administrator-configured code in the normal YouSound global song search and pressing Enter. A matching code opens an activation prompt; confirming it opens the in-app YouTube discovery and embedded player.

### Render environment variable

Set `YOUTUBE_API_KEY` on the real YouSound Render web service. The key must belong to a Google Cloud project with YouTube Data API v3 enabled. Keep it server-side; it is never sent to the browser.

The server uses the YouTube Data API to search, retrieve video details, load popular charts, and inspect public uploads for channels a listener follows. Videos play through YouTube's official privacy-enhanced embedded player (`youtube-nocookie.com`). This is an embedded-player experience, not the full youtube.com website.

The YouTube Data API does not expose YouTube's private per-viewer Home recommendation feed or its complete ranking algorithm. YouSound therefore builds its own per-account recommendation ranking using public YouTube data and each listener's YouSound activity. The "Popular" section uses YouTube's public `mostPopular` chart. YouTube's current API docs describe that chart as the popular music, movies, and gaming charts; it is not the old general Trending page.

If `YOUTUBE_API_KEY` is absent or invalid, discovery displays a setup/search error and the rest of YouSound continues working. Google Cloud quota applies to API calls; search and list methods have separate quota buckets under the current quota transition.

### Per-account personalization

Each YouSound account has a separate profile keyed by its internal account ID. The profile stores interests, recent searches, video likes, hidden videos, recently opened videos, followed channels, and recommendation weights. The For You feed uses these signals to rank videos independently for that account.

The Following section reads recent public uploads from channels the account followed inside YouSound. The Liked section reloads videos that account liked in YouSound. These are YouSound preferences; they do not automatically synchronize with a person's separate Google/YouTube account.

### Administrator activation code and access audit

An administrator configures or replaces the activation code in Control Room → YouTube Access. The server stores a salted scrypt hash, not the code itself. Users enter the code in the ordinary global search bar. Wrong codes simply remain ordinary search terms. No rate limit is applied to this code check.

The YouTube Access panel also shows successful activations by YouSound account: username, account ID, first successful activation, most recent successful activation, and activation count. It does not store the code or failed guesses. Only administrators can read this access log.
