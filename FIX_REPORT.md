# YouSong upload and playback fix report

## Confirmed defects

1. The direct library uploader expected `audioUrl` and `coverUrl` at the top level of the upload response, but the server returned those values only inside the newly created `song` object. The Drive files could upload successfully while the browser still displayed an upload failure.
2. The configured MP3 upload cap was 100 MB in both the server and the two administrator upload interfaces.
3. The Drive upload helper read the entire media file into memory and sent it in one multipart request. That method is not appropriate for the site's larger advertised uploads.
4. The song editor's cover-image uploader still used retired legacy endpoints rather than the current site-wide Drive account.
5. The repository retained an unused video-source playback and conversion worker even though the library is intended to use audio files and Google Drive.

## Changes made

- Replaced the single multipart Google Drive transfer with resumable uploads in 8 MB chunks, read from temporary disk storage.
- Increased the MP3 limit consistently to 150 MB in the library uploader, request uploader, and server-side Multer configuration.
- Kept cover uploads limited to 25 MB and allowed JPG, PNG, WEBP, and GIF.
- Made server upload failures return an appropriate HTTP status and a specific message for file-size errors.
- Made the library uploader accept the saved song object and explicit media URLs; the server now returns both top-level URLs and the canonical song.
- Added a Drive-backed cover-image endpoint and updated the song editor to use it.
- Removed the video playback/conversion components and their deployment dependencies.
- Kept Google Drive direct playback, PostgreSQL/Supabase song metadata, and daily listen-limit enforcement.

## Validation status

The changes were inspected against the current source code and API response shapes. A live upload to the connected Drive account, a Render deployment, and a full production build still need to be run in the deployed environment; this repository editing session does not have access to the site's runtime credentials or Render logs. Do not treat the code edits alone as proof of a live Drive upload.
