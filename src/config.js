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
  // off. As of yt-dlp's own PO Token Guide, `tv` (works DRM-free when real
  // account cookies are supplied, which we already do), `android_vr`
  // (blocks only "made for kids" videos), and `web_embedded`/`web_safari`
  // (embeddable-only / HLS-only, as fallbacks) are the clients NOT currently
  // requiring a token. Listing several gives yt-dlp more than one chance per
  // video. This is a moving target as YouTube keeps closing loopholes, so
  // it's an env var rather than hardcoded — adjust YT_PLAYER_CLIENTS on
  // Railway if this stops working again without needing a code change.
  ytPlayerClients: process.env.YT_PLAYER_CLIENTS || 'tv,android_vr,web_embedded,web_safari',
};
