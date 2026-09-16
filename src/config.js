require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  // Base64-encoded Netscape-format cookies.txt, used by yt-dlp (see src/music/ytdlp.js).
  youtubeCookiesB64: process.env.YOUTUBE_COOKIES_B64 || null,
  // Which YouTube "player clients" yt-dlp should pretend to be.
  //
  // Earlier this was narrowed to only android_vr/web_embedded/web_safari —
  // the few clients that don't need a PO Token at all — but each of those
  // has its own content restriction (android_vr blocks "made for kids"
  // videos, web_embedded only works if the uploader allowed embedding,
  // web_safari only offers HLS formats). A video that fails all three of
  // those restrictions at once (e.g. an official music video with
  // embedding disabled) has NO usable formats from that list at all,
  // which is what caused "Requested format is not available".
  //
  // Now that potProviderUrl (below) points at a real, working PO Token
  // provider, the normal full-capability clients (`web`, `mweb`) can be
  // used again too — their PO Token requirement is exactly what the
  // provider exists to satisfy, and they aren't subject to those content
  // restrictions. Listing several clients just gives yt-dlp more chances
  // to find a working set of formats for any given video; results are
  // merged, not replaced.
  //
  // `tv` is deliberately left out: yt-dlp silently substitutes a
  // `tv_downgraded` variant for it whenever real cookies are present
  // (which we always supply), and that variant is currently broken on
  // YouTube's side ("ERROR: The page needs to be reloaded."). The
  // trailing -tv_downgraded blocks that substitution from happening even
  // if some other default pulls `tv` back in.
  //
  // This whole list is a moving target as YouTube keeps closing loopholes
  // and yt-dlp keeps patching around them, so it's an env var rather than
  // hardcoded — adjust YT_PLAYER_CLIENTS on Railway if this stops working
  // again without needing a code change.
  ytPlayerClients: process.env.YT_PLAYER_CLIENTS || 'web,mweb,web_safari,android_vr,web_embedded,-tv_downgraded',
  // Internal URL of a companion "PO Token provider" service — a small
  // server that mints real YouTube PO Tokens on demand instead of relying
  // on client-name tricks (which YouTube keeps closing off). Deployed as
  // its own Railway service from the brainicism/bgutil-ytdlp-pot-provider
  // Docker image; set this to that service's internal Railway URL, e.g.
  // http://bgutil-pot.railway.internal:4416 (see the README). Leave unset
  // to skip it entirely (falls back to plain client selection above).
  potProviderUrl: process.env.POT_PROVIDER_URL || null,
};
