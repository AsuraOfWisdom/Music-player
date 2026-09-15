# Discord Music Bot

A Discord bot that plays audio in voice channels from links or search terms
across **YouTube**, **Spotify**, **Apple Music**, and **SoundCloud**, using
slash commands.

## Important: how cross-platform playback actually works

Spotify and Apple Music do not let third-party apps stream their audio —
their public APIs only return metadata (track name, artist, duration,
artwork). So for links from those two platforms, the bot looks up the
track's metadata, then searches YouTube for a matching upload and streams
that instead. This is how essentially every Discord music bot handles
Spotify/Apple Music links. It means:

- Playback quality/availability for Spotify and Apple Music tracks depends
  on a matching version existing on YouTube.
- **Apple Music playlists are not supported** — Apple's free lookup API
  (which this bot uses, no Apple developer account needed) doesn't expose
  playlist contents at all. Individual song and album links work fine.
- YouTube and SoundCloud links/searches stream directly — no lookup needed.

Also worth knowing: extracting audio from YouTube via unofficial libraries
(as this bot does, via `play-dl`) is common practice for hobby/personal
bots but is not officially sanctioned by YouTube's Terms of Service. Use
this at your own discretion, especially if you plan to run the bot
publicly at scale.

## Commands

| Command | Description |
|---|---|
| `/play <query>` | Play a search term or a YouTube/Spotify/Apple Music/SoundCloud link. Queues it if something's already playing. |
| `/skip` | Skip the current track. |
| `/pause` / `/resume` | Pause or resume playback. |
| `/stop` | Stop playback and clear the queue. |
| `/queue` | Show what's playing and up next. |
| `/nowplaying` | Show details about the current track. |
| `/volume <0-200>` | Set playback volume. |
| `/loop <off\|track\|queue>` | Set loop mode. |
| `/leave` | Disconnect the bot from voice. |

## Setup

### 1. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Under **Bot**, click **Reset Token** to get your bot token, and enable **Message Content Intent** if you plan to add prefix commands later (not required for the slash commands here).
3. Copy the **Application ID** from the **General Information** page — that's your `CLIENT_ID`.
4. Under **OAuth2 → URL Generator**, check the `bot` and `applications.commands` scopes, and under bot permissions check `Connect`, `Speak`, and `Send Messages`. Open the generated URL to invite the bot to your server.

### 2. Get Spotify API credentials (optional, but needed for Spotify links)

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) → **Create app**.
2. Fill in any name/description; for the redirect URI you can put `http://localhost` (unused — this bot only uses the client-credentials flow, no user login).
3. Copy the **Client ID** and **Client Secret**.

Apple Music, YouTube, and SoundCloud need no API keys — Apple Music metadata comes from Apple's free public iTunes lookup API, and YouTube/SoundCloud audio comes via `play-dl`.

### 3. Install and configure

```bash
npm install
cp .env.example .env
```

Fill in `.env` with your bot token, client ID, and (optionally) your Spotify credentials. If you set `GUILD_ID` (your server's ID — enable Developer Mode in Discord to copy it), slash commands register instantly to that server instead of taking up to an hour globally.

### 4. Register the slash commands and start the bot

```bash
npm run deploy
npm start
```

## Deploying with GitHub + Railway

### 1. Push this repo to GitHub

`.env` is already listed in `.gitignore`, so your real token/secrets never get committed — only `.env.example` (the blank template) does.

```bash
git init
git add .
git commit -m "Initial commit: Discord music bot"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(Create the empty repo on GitHub first — github.com → **New repository** — without a README/license, since this project already has one.)

### 2. Deploy on Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → select this repo.
2. Railway auto-detects Node.js (via Nixpacks) using `package.json`, runs `npm install`, then `npm start`. The included `railway.json` pins that start command and sets it to auto-restart on crashes.
3. Open the service's **Variables** tab and add the same keys from your `.env`: `DISCORD_TOKEN`, `CLIENT_ID`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `GUILD_ID` if you're using one.
4. This bot is a background worker, not a web server — it doesn't listen on an HTTP port. You can ignore or remove any public domain Railway offers to generate; nothing needs to be exposed.

### 3. Register slash commands against production

Slash-command registration (`npm run deploy`) is a separate one-time step — it shouldn't run automatically on every deploy, since it's only needed when commands are added or changed. Do it either:

- **Locally**, once, before your first push (using your real `CLIENT_ID`/`DISCORD_TOKEN` in your local `.env`) — commands are registered on Discord's side, independent of where the bot itself runs, or
- **Against Railway's variables**, using the [Railway CLI](https://docs.railway.app/guides/cli): `railway login`, `railway link` (select this project), then `railway run npm run deploy`.

After that, every `git push` to the branch Railway is watching triggers an automatic redeploy — no need to re-register commands unless you change them.

## Troubleshooting

- **"Missing Permissions" joining voice** — make sure the bot's invite included the `Connect` and `Speak` permissions in the channel you're using.
- **YouTube playback suddenly breaks** — YouTube periodically changes things in ways that break unofficial extraction libraries. Run `npm update play-dl` to get the latest fix, or check the [play-dl GitHub issues](https://github.com/play-dl/play-dl/issues) for the current status.
- **SoundCloud errors** — the bot auto-fetches a free SoundCloud client ID on startup. If that fails (logged as a warning on boot), find a client ID yourself (search "soundcloud client_id" for current guides) and set it as `SOUNDCLOUD_CLIENT_ID` in `.env`, then load it in `src/index.js` via `play.setToken({ soundcloud: { client_id: process.env.SOUNDCLOUD_CLIENT_ID } })`.
- **Spotify links fail with a config error** — double check `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` are set in `.env` and that you restarted the bot after editing it.
- **Bot leaves voice on its own** — it auto-disconnects after 5 minutes of an empty queue. Adjust `IDLE_TIMEOUT_MS` in `src/music/GuildMusicManager.js` if you want that longer/shorter.

## Project structure

```
src/
  index.js              Bot entry point, command loader
  deploy-commands.js    Registers slash commands with Discord
  config.js             Loads .env values
  commands/             One file per slash command
  music/
    GuildMusicManager.js  Per-server queue, voice connection, playback state
    player.js             Turns a track into a playable audio resource
    resolveQuery.js        Detects the source of a /play query and dispatches
    resolvers/
      youtube.js
      spotify.js
      appleMusic.js
      soundcloud.js
  utils/
    formatDuration.js
```
