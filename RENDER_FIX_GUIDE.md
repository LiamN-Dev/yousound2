# YouSong: Render deployment fix

## 1. Deploy the corrected files

Commit/push the corrected repository files to the GitHub repository connected to Render. The important changes are in:

- `Dockerfile`
- `src/services/audioPipeline.ts`
- `server.ts`
- `src/components/AdminPipelineManager.tsx`
- `FEATURE_SETUP.md`

Do not delete your current Supabase database or replace its connection settings.

## 2. Make sure Render actually uses the Dockerfile

In the Render dashboard, open the existing YouSong web service and check its Runtime/Environment in Settings. It must be **Docker**. A native Node.js runtime ignores this Dockerfile, meaning `ffmpeg`, `ffprobe`, and the Python-installed `yt-dlp` tool will not be installed by the file.

Use the repository root as the Docker context and `./Dockerfile` as the Dockerfile path. Leave the build and start commands to the Dockerfile unless Render shows a required override. The container uses Node.js 22, installs `yt-dlp[default]` (including `yt-dlp-ejs`), and installs FFmpeg tools.

After pushing the changes, trigger a new deploy and make sure the Docker image build completes. A restart without rebuilding the image will not install the new packages.

## 3. Keep the existing database environment variables

Retain the working `DATABASE_URL` or `SUPABASE_DB_URL` connection used by the server. Do not substitute a Supabase frontend project URL for the PostgreSQL connection string. Existing users, songs, and settings live in that database.

## 4. Verify Google Drive settings

Use the same canonical public origin everywhere. For the current Render address, the settings should look like this:

```env
APP_URL=https://yousound.onrender.com
GOOGLE_REDIRECT_URI=https://yousound.onrender.com/api/admin/google-drive/oauth/callback
GOOGLE_CLIENT_ID=your_web_oauth_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
DRIVE_TOKEN_ENCRYPTION_KEY=64_hex_characters_from_32_random_bytes
SESSION_SECRET=at_least_32_characters_of_random_secret
```

In Google Cloud Console, open the OAuth Web application client and add the exact value of `GOOGLE_REDIRECT_URI` under Authorized redirect URIs. Do not add a trailing slash unless the redirect URI also has one. Keep `GOOGLE_CLIENT_SECRET`, `DRIVE_TOKEN_ENCRYPTION_KEY`, and `SESSION_SECRET` private, and never commit them to GitHub.

Generate new random values locally if you still need the keys:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run that command separately for `DRIVE_TOKEN_ENCRYPTION_KEY` and `SESSION_SECRET`; use each value for its intended setting, save both in Render, and keep them stable. Rotating the Drive encryption key makes the previously saved encrypted Drive refresh token unreadable. Changing the session secret signs out users, who then need to log in again.

## 5. Reconnect and test

1. Open `https://yousound.onrender.com` directly (not the AI Studio preview domain), log in, and open Admin → Requests.
2. Click **Connect site Drive**. Complete Google's approval flow and return to the Render domain. Confirm the button shows that Drive is connected.
3. Try migrating a single song first by using the normal batch button. Successful songs are now marked as migrated so the next batch will skip them.
4. If YouTube returns HTTP 429 or asks for bot verification, that is an upstream YouTube block, not a Google Drive or FFmpeg failure. The code now reports this clearly. Do not keep hammering the same blocked URL. Use the new manual audio-file uploader in the same panel: select the existing library song, choose an audio file you own or are licensed to re-host (up to 100 MB), then click **Convert & upload selected audio**. The app replaces the song URL only after the MP3 has been uploaded and link access is enabled in Drive.

## 6. Important: the domains do not share browser login cookies

`https://yousound.onrender.com` and `https://yousound2.ai.studio` are different origins. You can register both callback URLs in Google where appropriate, but a login cookie for one domain is not sent to the other. To test the current Render deployment, open the Render URL and log in there. If `AUTH_REQUIRED` persists on that exact origin after logging in again, check that `ys_session` is stored under `yousound.onrender.com` in Chrome DevTools → Application → Cookies. Never copy or share the cookie's value.

## 7. What this fixes—and what it cannot guarantee

- Installs current `yt-dlp` default components including `yt-dlp-ejs`.
- Selects Node.js as the explicit `yt-dlp` JavaScript runtime.
- Gives YouTube rate-limit / bot-verification failures a direct explanation.
- Adds manual audio-file migration to Drive when YouTube rejects the server.
- Marks successful migrations to avoid re-uploading them in later batches.
- Preserves the original song URL if conversion/upload fails.

No server-side code can guarantee that YouTube will allow a particular hosted download. The manual file upload is the dependable fallback when the source cannot be fetched by Render. Only upload/re-host audio that you own or are authorized to use.
