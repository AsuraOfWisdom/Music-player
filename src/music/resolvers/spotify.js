/**
 * Spotify gives no way to stream audio through a third-party bot - like the
 * other resolvers here, this only reads metadata and hands it to the
 * player, which finds a playable match on YouTube by title/artist.
 *
 * There are two ways this can get that metadata:
 *
 * 1. Spotify's OFFICIAL Web API (via SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET
 *    and the `spotify-web-api-node` package). This gives the most accurate
 *    data (real artist list, real duration, real album art) - but as of a
 *    February 2026 Spotify policy change, every Development Mode app now
 *    requires its OWNER's Spotify account to have an active Premium
 *    subscription, or every single call - even basic read-only track
 *    lookups - fails outright with a bare `403 Forbidden`. This is only
 *    used when both credentials are configured.
 *
 * 2. The public "embed" page Spotify serves for link-preview widgets (the
 *    kind you see when a Spotify link is pasted into Discord/Twitter/etc.)
 *    - no login, no API key, no Premium requirement, just a normal public
 *    web page - read via the small `spotify-url-info` npm package. Slightly
 *    less detailed (no thumbnail, artist names are pre-joined into one
 *    string instead of a real list), but it never needs any setup at all
 *    and doesn't depend on anyone's account staying Premium.
 *
 * Strategy: try the official API first when credentials are configured
 * (better data, and the whole reason to set it up), but automatically fall
 * back to the embed-page scrape if that fails for ANY reason - wrong/
 * expired credentials, the owning account losing Premium, Spotify rate-
 * limiting, a temporary API hiccup, whatever. That way a Spotify API
 * problem degrades to "slightly less detailed metadata" instead of
 * "Spotify links stop working entirely," which is what happened before.
 */

const SpotifyWebApi = require('spotify-web-api-node');
const spotifyUrlInfo = require('spotify-url-info')(fetch);
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

function officialTrackToObj(t) {
  const artists = (t.artists || []).map((a) => a.name).join(', ') || 'Unknown Artist';
  return {
    title: `${t.name} - ${artists}`,
    url: null,
    duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
    thumbnail: t.album?.images?.[0]?.url || null,
    source: 'spotify',
    searchQuery: `${t.name} ${artists}`,
  };
}

// Returns null (rather than throwing) when the URL doesn't look like a
// track/album/playlist link at all, so the caller can decide what to do
// next instead of this function guessing.
async function resolveViaOfficialApi(url) {
  await ensureToken();

  const trackMatch = url.match(/track\/([a-zA-Z0-9]+)/);
  const albumMatch = url.match(/album\/([a-zA-Z0-9]+)/);
  const playlistMatch = url.match(/playlist\/([a-zA-Z0-9]+)/);

  if (trackMatch) {
    const { body } = await spotifyApi.getTrack(trackMatch[1]);
    return [officialTrackToObj(body)];
  }

  if (albumMatch) {
    const { body } = await spotifyApi.getAlbum(albumMatch[1]);
    return body.tracks.items.map((t) => officialTrackToObj({ ...t, album: body }));
  }

  if (playlistMatch) {
    const { body } = await spotifyApi.getPlaylistTracks(playlistMatch[1]);
    return body.items.filter((i) => i.track).map((i) => officialTrackToObj(i.track));
  }

  return null;
}

function scrapedTrackToObj(t) {
  const artist = t.artist || 'Unknown Artist';
  return {
    title: `${t.name} - ${artist}`,
    url: null,
    // `duration` here is Spotify's raw embed-page field, in milliseconds
    // (same unit the official API uses) - but it isn't documented anywhere,
    // so this is defensive about anything other than a plain number.
    duration: typeof t.duration === 'number' ? Math.round(t.duration / 1000) : null,
    thumbnail: null,
    source: 'spotify',
    searchQuery: `${t.name} ${artist}`,
  };
}

async function resolveViaEmbedScrape(url) {
  const tracks = await spotifyUrlInfo.getTracks(url);
  return tracks && tracks.length ? tracks.map(scrapedTrackToObj) : null;
}

// Pulls a readable string out of whatever shape spotify-web-api-node's
// error actually has - see the git history of this file for the full story
// on why this matters (a raw, un-massaged error from this library can
// render as the literal text "[object Object]" in Discord otherwise).
function describeSpotifyError(err) {
  const body = err?.body;
  if (body?.error_description) return `${body.error || 'Spotify error'}: ${body.error_description}`;
  if (typeof body?.error === 'string') return body.error;
  if (typeof body?.error?.message === 'string') return body.error.message;
  if (typeof err?.message === 'string' && err.message && err.message !== '[object Object]') return err.message;
  if (err?.statusCode) return `status ${err.statusCode}`;
  return 'unknown error';
}

/**
 * Resolve a Spotify track, album, or playlist link into track metadata.
 */
async function resolveSpotify(url) {
  const hasCredentials = Boolean(config.spotifyClientId && config.spotifyClientSecret);

  if (hasCredentials) {
    try {
      const tracks = await resolveViaOfficialApi(url);
      if (tracks) return tracks;
    } catch (err) {
      console.warn(
        `[spotify] official API failed (${describeSpotifyError(err)}), falling back to embed-page scraping`,
      );
    }
  }

  let tracks = null;
  try {
    tracks = await resolveViaEmbedScrape(url);
  } catch (err) {
    console.error('[spotify] embed-page scrape failed:', err);
  }

  if (tracks) return tracks;

  throw new Error("Couldn't read that Spotify link. Make sure it's a public track, album, or playlist link.");
}

module.exports = { resolveSpotify };
