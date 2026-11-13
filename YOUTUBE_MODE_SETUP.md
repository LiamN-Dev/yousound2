## YouTube Mode setup

YouTube Mode is activated by entering the administrator-configured code in the normal YouSound global song search and pressing Enter. A matching code opens an activation prompt; confirming it opens the in-app YouTube search and embedded player.

### Render environment variable

Set `YOUTUBE_API_KEY` on the real YouSound Render web service. The key must belong to a Google Cloud project with YouTube Data API v3 enabled. Keep it server-side; it is never sent to the browser.

The server proxies searches through YouTube Data API v3 and returns only the video metadata needed by the interface. Selected videos play through YouTube's official privacy-enhanced embed host (`youtube-nocookie.com`). This is an embedded player, not the full YouTube website. Searches use the YouTube Data API, because YouTube's player search-list functionality is deprecated.

If `YOUTUBE_API_KEY` is absent or invalid, the YouTube view displays a setup/search error and the rest of YouSound continues working.

### Administrator activation code

An administrator configures or replaces the activation code in Control Room → YouTube Access. The server stores a salted scrypt hash, not the code itself. Users enter the code in the ordinary global search bar. Wrong codes simply remain ordinary search terms. No rate limit is applied to this code check.
