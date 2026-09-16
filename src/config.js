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
  // `tv_downgraded` variant for it whenever real cookies are present,
  // and that variant is currently broken on YouTube's side ("ERROR: The
  // page needs to be reloaded."). The trailing -tv_downgraded blocks that
  // substitution from happening even if some other default pulls `tv`
  // back in.
  //
  // `android_vr` is ALSO deliberately left out now, despite not needing a
  // PO Token: its downloads (not metadata — the actual file fetch) hit a
  // separate, unrelated bug where YouTube's CDN 403s the request. A
  // yt-dlp maintainer confirmed this directly on a GitHub issue: "This is
  // android_vr; it needs to be completely disabled... so it doesn't get
  // in the way." Since yt-dlp was preferring it (it doesn't need a token,
  // so it looks like the "easy" choice) and then failing on the actual
  // download, explicitly excluding it forces yt-dlp to fall back to
  // clients that actually complete a download instead.
  //
  // This whole list is a moving target as YouTube keeps closing loopholes
  // and yt-dlp keeps patching around them, so it's an env var rather than
  // hardcoded — adjust YT_PLAYER_CLIENTS on Railway if this stops working
  // again without needing a code change.
  //
  // UPDATE (Sept 2026): even with the PO Token provider working and real
  // tokens being retrieved, `web`/`mweb`/`web_safari` can still return NO
  // usable URL at all for a given video — YouTube now forces some videos
  // into a session-based "SABR" streaming mode on those clients regardless
  // of token validity (yt-dlp tracks this at github.com/yt-dlp/yt-dlp/issues/12482,
  // still open/unresolved upstream as of this writing; a fully native fix
  // — a from-scratch SABR downloader — exists only as an experimental,
  // not-yet-merged yt-dlp pull request, so it isn't something we can
  // depend on from a plain release binary).
  //
  // `android` and `ios` (the native app clients) are added here because
  // SABR forcing has so far only been reported against the *web-family*
  // InnerTube clients (web/mweb/web_safari/tv_simply), not the native app
  // ones — so they're extra chances to get a real format for a video the
  // web clients refuse to serve outside SABR. Both need a PO Token like
  // `web` does, which the provider now supplies.
  //
  // `web_embedded` was dropped from the default list: it only returns
  // anything for videos with embedding enabled, which isn't true of every
  // track, and it wasn't adding coverage SABR-forcing didn't already take
  // away on the videos we were testing.
  //
  // UPDATE (Sept 2026, again): every client above came back LOGIN_REQUIRED
  // ("Sign in to confirm you're not a bot") for a video that previously
  // worked without cookies — YouTube's unauthenticated-request wall got
  // tighter again. No client-name trick gets past that, only real cookies
  // from a logged-in session do (see youtubeCookiesB64 above), so cookies
  // are back in the deployed config.
  //
  // UPDATE (Sept 2026, yet again): yt-dlp tries clients in the order
  // they're listed here, and now that things are actually working end to
  // end, deploy logs consistently show `tv` coming back UNPLAYABLE before
  // `web`/`mweb` succeed — so every single track was paying for one wasted
  // request (a full webpage + player config + player API round trip) for a
  // client that wasn't going to work anyway. `tv` is moved to the back of
  // the list instead of removed (it's still worth trying as a last resort,
  // and this is exactly the kind of thing that flips back to working with
  // no warning), and the clients actually succeeding right now go first —
  // this is a real, if modest, chunk of the time between songs, alongside
  // the bigger prefetch-the-next-track change in GuildMusicManager.js.
  ytPlayerClients: process.env.YT_PLAYER_CLIENTS || 'web,mweb,web_safari,android,ios,tv,-tv_downgraded,-android_vr',
  // Extra yt-dlp `youtube:formats=...` extractor-arg value (see the
  // SABR-forcing note above). `missing_pot` tells yt-dlp to include formats
  // it would otherwise pre-emptively hide as "likely to fail without a PO
  // Token" — now that a real token provider is wired up, some of those
  // hidden formats actually work. It's not a fix for true SABR-forcing (a
  // format that's hidden for lacking a URL entirely still won't appear),
  // but it's a free extra chance on any video that isn't fully SABR-locked,
  // so it stays on unconditionally rather than needing its own env var.
  ytFormatsArg: 'missing_pot',
  // URL of a companion "PO Token provider" service — a small server that
  // mints real YouTube PO Tokens on demand instead of relying on
  // client-name tricks (which YouTube keeps closing off). Deployed as its
  // own Railway service from the brainicism/bgutil-ytdlp-pot-provider
  // Docker image (see the README). Point this at that service's URL —
  // Railway's internal `<service>.railway.internal` address had a
  // connectivity issue in testing (its DNS name resolved to an
  // IPv6-only address while the provider's own HTTP server only listens
  // on IPv4), so a public Railway domain (Settings → Networking →
  // Generate Domain), used as a full `https://...` URL, is what's
  // actually deployed. Leave unset to skip it entirely (falls back to
  // plain client selection above).
  potProviderUrl: process.env.POT_PROVIDER_URL || null,
};
