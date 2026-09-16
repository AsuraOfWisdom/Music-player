require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  // Base64-encoded Netscape-format cookies.txt, used by yt-dlp (see src/music/ytdlp.js).
  youtubeCookiesB64: process.env.YOUTUBE_COOKIES_B64 || null,
  // Which YouTube "player clients" yt-dlp should pretend to be. YouTube
  // requires a PO (Proof of Origin) Token for downloads (not just metadata)
  // on most clients now — mweb and the old visionos guess both got closed
  // off. `android_vr` (blocks only "made for kids" videos) and
  // `web_embedded`/`web_safari` (embeddable-only / HLS-only, as fallbacks)
  // are the clients NOT currently requiring a token.
  // `tv` used to be in this list too, but yt-dlp silently substitutes a
  // `tv_downgraded` variant for it whenever real cookies are present (which
  // we always supply), and that variant is currently broken on YouTube's
  // side — it fails with "ERROR: The page needs to be reloaded." every
  // time. -tv_downgraded explicitly blocks that substitution from
  // happening even if a future client list re-adds `tv` some other way.
  // This whole list is a moving target as YouTube keeps closing loopholes
  // and yt-dlp keeps patching around them, so it's an env var rather than
  // hardcoded — adjust YT_PLAYER_CLIENTS on Railway if this stops working
  // again without needing a code change.
  ytPlayerClients: process.env.YT_PLAYER_CLIENTS || 'android_vr,web_embedded,web_safari,-tv_downgraded',
  // Internal URL of a companion "PO Token provider" service — a small
  // server that mints real YouTube PO Tokens on demand instead of relying
  // on client-name tricks (which YouTube keeps closing off). Deployed as
  // its own Railway service from the brainicism/bgutil-ytdlp-pot-provider
  // Docker image; set this to that service's internal Railway URL, e.g.
  // http://bgutil-pot.railway.internal:4416 (see the README). Leave unset
  // to skip it entirely (falls back to plain client selection above).
  potProviderUrl: process.env.POT_PROVIDER_URL || null,
};
