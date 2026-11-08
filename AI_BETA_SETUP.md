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

## Administrator knowledge and status
- Open Admin → AI Knowledge to save a short current site-status message, such as an active maintenance notice or a confirmed outage update.
- Add confirmed question-and-answer entries for features, policies, and common troubleshooting.
- Questions that YouSound AI cannot answer can be sent to the admin queue from the AI Studio. Resolving a question adds the verified answer to the knowledge base.
- Keep the status current. Old incident notes should be replaced or removed so the assistant does not present stale information as current.
- The API never exposes administrator knowledge editing to regular accounts. Only admins can read and change the knowledge base and resolve requests.
