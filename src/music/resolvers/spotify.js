const SpotifyWebApi = require('spotify-web-api-node');
const config = require('../../config');

const spotifyApi = new SpotifyWebApi({
  clientId: config.spotifyClientId,
  clientSecret: config.spotifyClientSecret,
});

let tokenExpiresAt = 0;

/**
 * spotify-web-api-node builds a proper string `.message` for the two
 * documented error shapes (bad credentials, bad track/album id) - but if
 * Spotify ever responds with a body that doesn't have the `error` key it
 * expects (an empty `{}` on a 429 rate-limit, a gateway/CDN error page that
 * still gets parsed as JSON, etc.), it falls back to using the raw response
 * body object AS the message. `Error`/`Error`-subclass constructors coerce
 * a non-string message with JS's default object-to-string conversion,
 * which is literally the string "[object Object]" - that's exactly what
 * was showing up in Discord instead of a real error.
 *
 * This pulls a readable string out of whatever shape actually comes back,
 * and logs the raw error so a genuinely new failure mode is still
 * diagnosable from the Railway deploy logs instead of being swallowed.
 */
function describeSpotifyError(err, context) {
  console.error(`[spotify] ${context} failed:`, err?.body ?? err);

  const body = err?.body;
  if (body?.error_description) {
    return `${body.error || 'Spotify error'}: ${body.error_description}`;
  }
  if (typeof body?.error === 'string') {
    return body.error;
  }
  if (typeof body?.error?.message === 'string') {
    return body.error.message;
  }
  if (typeof err?.message === 'string' && err.message && err.message !== '[object Object]') {
    return err.message;
  }
  if (err?.statusCode === 429) {
    return 'Spotify is rate-limiting this bot right now. Please try again in a moment.';
  }
  if (err?.statusCode) {
    return `Spotify API returned an unexpected error (status ${err.statusCode}).`;
  }
  return 'An unexpected error occurred while contacting Spotify.';
}

async function ensureToken() {
  if (Date.now() < tokenExpiresAt) return;
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body.access_token);
    tokenExpiresAt = Date.now() + (data.body.expires_in - 60) * 1000;
  } catch (err) {
    throw new Error(describeSpotifyError(err, 'clientCredentialsGrant'));
  }
}

function trackToObj(t) {
  const artists = (t.artists || []).map((a) => a.name).join(', ');
  return {
    // Spotify's API only gives metadata, never audio — this track has
    // no playable `url` yet. The player looks it up on YouTube by
    // `searchQuery` right before it plays.
    title: `${t.name} - ${artists}`,
    url: null,
    duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
    thumbnail: t.album?.images?.[0]?.url,
    source: 'spotify',
    searchQuery: `${t.name} ${artists}`,
  };
}

/**
 * Resolve a Spotify track, album, or playlist link into track metadata.
 * Requires SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET (client-credentials
 * flow — no user login needed, just an app registered on Spotify's
 * developer dashboard).
 */
async function resolveSpotify(url) {
  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    throw new Error('Spotify support is not configured (missing SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET in .env).');
  }

  await ensureToken();

  const trackMatch = url.match(/track\/([a-zA-Z0-9]+)/);
  const albumMatch = url.match(/album\/([a-zA-Z0-9]+)/);
  const playlistMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);

  try {
    if (trackMatch) {
      const { body } = await spotifyApi.getTrack(trackMatch[1]);
      return [trackToObj(body)];
    }

    if (albumMatch) {
      const { body } = await spotifyApi.getAlbum(albumMatch[1]);
      return body.tracks.items.map((t) => trackToObj({ ...t, album: body }));
    }

    if (playlistMatch) {
      const { body } = await spotifyApi.getPlaylistTracks(playlistMatch[1]);
      return body.items.filter((i) => i.track).map((i) => trackToObj(i.track));
    }
  } catch (err) {
    throw new Error(describeSpotifyError(err, 'track/album/playlist lookup'));
  }

  throw new Error('Unrecognized Spotify link. Please share a track, album, or playlist link.');
}

module.exports = { resolveSpotify };
