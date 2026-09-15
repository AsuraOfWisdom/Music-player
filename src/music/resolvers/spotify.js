const SpotifyWebApi = require('spotify-web-api-node');
const config = require('../../config');

const spotifyApi = new SpotifyWebApi({
  clientId: config.spotifyClientId,
  clientSecret: config.spotifyClientSecret,
});

let tokenExpiresAt = 0;

async function ensureToken() {
  if (Date.now() < tokenExpiresAt) return;
  const data = await spotifyApi.clientCredentialsGrant();
  spotifyApi.setAccessToken(data.body.access_token);
  tokenExpiresAt = Date.now() + (data.body.expires_in - 60) * 1000;
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

  throw new Error('Unrecognized Spotify link. Please share a track, album, or playlist link.');
}

module.exports = { resolveSpotify };
