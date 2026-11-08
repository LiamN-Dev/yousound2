# YouSound AI beta setup

YouSound AI is available only to administrators and accounts with the AI Beta switch enabled in Admin → Beta Access.

## Configure the model key

The server needs a Google Gemini API key. The key must stay on the server and must never be added to frontend code, committed to Git, or stored in a VITE_ variable.

1. Create or obtain a Gemini API key from Google AI Studio: https://aistudio.google.com/app/apikey
2. Open your YouSound web service in the Render dashboard.
3. Open the Environment section.
4. Add an environment variable named GEMINI_API_KEY and paste the key as its value.
5. Save the environment change and let Render redeploy the service.

The server uses the official Google Gen AI JavaScript SDK and the stable gemini-3.8-flash model with its default sampling settings. Reference: https://googleapis.github.io/js-genai/

## Access and behavior

- AI access is denied by default for regular accounts.
- Administrators can use AI without an individual beta grant.
- A regular account must be approved, not suspended, not locked, and have AI Beta enabled.
- Requests are limited to 8 per account per minute.
- The assistant receives a limited list of tracks visible to the requesting account so it can make grounded catalogue recommendations.
- The AI endpoint cannot grant access, edit accounts, or perform administrator actions.

If the key is missing, the AI page reports that the AI service is not configured. Do not share the key in chat, a pull request, or a screenshot.

## AI site knowledge and monitoring
- Live status comes from the Better Stack public status-page JSON endpoint. By default YouSound reads `https://yousound.betteruptime.com/index.json`.
- If the public status page uses another URL, set `BETTERSTACK_STATUS_URL` in Render to the status-page URL (the server adds `/index.json` automatically). A direct `/index.json` URL is also accepted.
- If Better Stack's endpoint is private, blocked, or unavailable, YouSound AI reports that live status cannot be confirmed. It does not guess.
- Open Admin → AI Knowledge → Permanent site facts for stable, admin-verified information about how YouSound works and its permanent policies. Do not enter current outages, maintenance windows, or one-off replies here.
- User questions submitted through AI Studio appear under Temporary admin questions. Answers are sent only to the person who asked and are never promoted automatically.
- Old entries from the previous mixed knowledge system are not used by the AI. An administrator must explicitly promote a truly permanent fact or discard the old entry.
- Provider failures are recorded under AI provider diagnostics. Older codes from before this system may exist only in Render logs.
- The API never exposes administrator knowledge editing to regular accounts. Only admins can read and change the knowledge base and resolve requests.
