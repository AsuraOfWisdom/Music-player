require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  // Base64-encoded Netscape-format cookies.txt, used by yt-dlp (see src/music/ytdlp.js).
  youtubeCookiesB64: process.env.YOUTUBE_COOKIES_B64 || null,
};
