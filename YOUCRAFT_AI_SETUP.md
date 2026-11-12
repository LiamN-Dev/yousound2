# YouCraft AI recipe planner setup

YouCraft's recipe planner uses a separate Gemini API key. It does not fall back to the chat assistant's `GEMINI_API_KEY`.

## 1. Create an isolated Google AI Studio project

1. Open [Google AI Studio API keys](https://aistudio.google.com/apikey).
2. Create or select a dedicated project for YouCraft. Do not create this key inside the project currently used by the chat assistant.
3. Create a Gemini API key for the YouCraft project and copy it privately.

Google applies Gemini API rate limits per project, not per API key. A second key in the chat project's existing Google project would still share that project's rate limits. A separate project is what isolates the YouCraft traffic.

## 2. Add the key to the real YouSound Render service

In the Render dashboard for the production service named `yousound`:

1. Open Environment.
2. Add `YOUCRAFT_GEMINI_API_KEY`.
3. Paste the key as its value and save it as a secret.
4. Deploy the updated service after this code is merged.

Do not add the key to GitHub, source files, a checked-in `.env`, or the alternate/testing service.

## 3. Model selection

The default planner model is `gemini-3.8-flash`. An optional `YOUCRAFT_GEMINI_MODEL` environment variable can override it. The planner submits small batches of ingredient pairs in the background and stores the results, so normal crafting uses the saved recipe instead of making a new model request.

The game deliberately refuses to invent a result when the model cannot produce a clear, meaningful recipe. The API key's project may still be subject to Google's usage limits and billing rules; configure its limits in AI Studio.
