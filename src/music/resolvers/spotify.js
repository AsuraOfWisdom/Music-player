/**
 * Spotify gives no way to stream audio through a third-party bot - like the
 * other resolvers here, this only reads metadata and hands it to the
 * player, which finds a playable match on YouTube by title/artist.
 *
 * IMPORTANT: this deliberately does NOT use Spotify's official Web API
 * (the `spotify-web-api-node` package this used to use). As of Spotify's
 * February 2026 policy change, EVERY Development Mode app now requires its
 * owner to have an active Spotify Premium subscription - without one, every
 * single API call (even basic, read-only track lookups using nothing but a
 * Client ID/Secret) fails with a bare `403 Forbidden` and an empty body.
 * That's exactly what was happening here: the client-credentials token
 * exchange succeeded, but the very next call to fetch track data was
 * rejected outright by Spotify's backend, with no further account activity
 * possible until the developer account goes Premium.
 *
 * Instead, this fetches the same public "embed" page Spotify serves for
 * link-preview widgets (the kind you see when a Spotify link is pasted into
 * Discord/Twitter/etc.) - no login, no API key, no Premium requirement,
 * just a normal public web page - and pulls the track/artist data out of a
 * JSON blob embedded in that page's markup. This is exactly what the
 * `spotify-url-info` npm package (a small, actively maintained library)
 * does, so it's used here instead of hand-rolling the HTML scraping.
 */

const spotifyUrlInfo = require('spotify-url-info')(fetch);

function trackToObj(t) {
  const artist = t.artist || 'Unknown Artist';
  return {
    title: `${t.name} - ${artist}`,
    url: null,
    // `duration` here is Spotify's raw embed-page field, in milliseconds
    // (same unit the official API used) - but it isn't documented anywhere,
    // so this is defensive about anything other than a plain number.
    duration: typeof t.duration === 'number' ? Math.round(t.duration / 1000) : null,
    thumbnail: null,
    source: 'spotify',
    searchQuery: `${t.name} ${artist}`,
  };
}

/**
 * Resolve a Spotify track, album, or playlist link into track metadata.
 */
async function resolveSpotify(url) {
  let tracks;
  try {
    tracks = await spotifyUrlInfo.getTracks(url);
  } catch (err) {
    console.error('[spotify] getTracks failed:', err);
    throw new Error(
      "Couldn't read that Spotify link. Make sure it's a public track, album, or playlist link.",
    );
  }

  if (!tracks || !tracks.length) {
    throw new Error('Could not find any tracks for that Spotify link.');
  }

  return tracks.map(trackToObj);
}

module.exports = { resolveSpotify };
