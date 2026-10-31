# YouSong: Render deployment and upload checks

## 1. Deploy the corrected repository

In the Render dashboard, open the existing YouSong web service. Set:

- Runtime / Environment: **Docker**
- Root directory / build context: repository root
- Dockerfile path: `./Dockerfile`

The Docker image installs Node.js dependencies and FFmpeg/ffprobe, builds the Vite frontend, and starts the Express server. It does not need a separate converter service.

Push the repository changes to the branch connected to Render, then trigger a new deployment that rebuilds the Docker image. A restart of an old image is not enough.

## 2. Keep existing database settings

Retain the working `DATABASE_URL` or `SUPABASE_DB_URL` connection used by the backend. Do not replace it with the Supabase frontend project URL. Existing accounts, songs, settings, and the encrypted Drive refresh token are stored in the database.

## 3. Verify Google Drive OAuth settings

Use the same canonical deployed origin in these settings:

```env
APP_URL=https://yousound.onrender.com
GOOGLE_REDIRECT_URI=https://yousound.onrender.com/api/admin/google-drive/oauth/callback
GOOGLE_CLIENT_ID=your_web_oauth_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
DRIVE_TOKEN_ENCRYPTION_KEY=64_hex_characters_from_32_random_bytes
SESSION_SECRET=at_least_32_characters_of_random_secret
```

Use your actual Render service URL if it differs from the example. In Google Cloud Console, add the exact callback URL under the OAuth Web application's authorized redirect URIs. Do not add a trailing slash unless the configured redirect URI also has one.

Keep the client secret, encryption key, and session secret private. Generate random keys locally with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generate the Drive encryption key and session secret separately. Keep them stable. Changing the Drive encryption key makes the saved encrypted refresh token unreadable; changing the session secret signs users out.

## 4. Reconnect and test

1. Open the canonical Render URL directly and log in as an administrator.
2. Open the admin uploader and check that the site-wide Google Drive account shows as connected.
3. Upload a small MP3 and cover image first. Confirm that the song appears in the library and plays from Drive.
4. Test a larger file after the small-file test succeeds. The maximum MP3 size is 150 MB; the maximum cover size is 25 MB.
5. In Render deploy logs, confirm that the new Docker image is running and inspect any server-side Drive or database errors.

The library uploader's server response now includes the created song and its media URLs. A successful Drive upload must also complete the database insert before the site reports the song as published.

## 5. Understanding upload errors

- **HTTP 413 with an application JSON message:** the app's multipart file-size limit was reached. MP3s may be up to 150 MB; covers may be up to 25 MB.
- **HTTP 413 with an HTML page or no app JSON:** a host/proxy layer rejected the request before Express handled it. Check that the request reached the deployed service and review host-level upload/body-size settings.
- **Google Drive upload/session error:** the app reached the backend, but Drive did not complete or acknowledge the resumable upload. Read the detailed status and response in the Render logs.
- **Drive upload succeeded, but the song did not appear:** check the persistent database connection and the `[LibraryUpload]` log. Do not repeatedly retry without checking whether Drive already contains the file.

## 6. Domain and login cookies

The Render domain and any AI Studio preview domain are different origins. A login cookie for one origin is not sent to the other. Test the deployed Render site on its own domain and log in there. Do not copy or share session-cookie values.
