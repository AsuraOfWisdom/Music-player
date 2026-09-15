/**
 * Apple Music has no public API for third-party audio streaming, so this
 * resolver only reads metadata via Apple's free, unauthenticated iTunes
 * Lookup API (https://itunes.apple.com/lookup) and hands it off to the
 * player, which finds a playable match on YouTube.
 *
 * Supported: song links (…?i=<trackId>) and album links.
 * Not supported: Apple Music playlist links — playlists aren't exposed
 * through the iTunes catalog API at all.
 */

function trackToObj(t) {
  return {
    title: `${t.trackName} - ${t.artistName}`,
    url: null,
    duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : null,
    thumbnail: t.artworkUrl100,
    source: 'apple_music',
    searchQuery: `${t.trackName} ${t.artistName}`,
  };
}

async function lookupById(id) {
  const res = await fetch(`https://itunes.apple.com/lookup?id=${id}`);
  const data = await res.json();
  const track = data.results?.[0];
  if (!track) throw new Error('Could not find that track on Apple Music.');
  return trackToObj(track);
}

async function resolveAppleMusic(url) {
  if (url.includes('/playlist/')) {
    throw new Error('Apple Music playlists cannot be read through the public iTunes API — please share individual song or album links instead.');
  }

  const u = new URL(url);
  const trackId = u.searchParams.get('i');

  if (trackId) {
    return [await lookupById(trackId)];
  }

  // No `i` param means this is an album (or artist) link — the numeric
  // ID at the end of the path is the album ID.
  const pathParts = u.pathname.split('/').filter(Boolean);
  const albumId = pathParts[pathParts.length - 1];

  const res = await fetch(`https://itunes.apple.com/lookup?id=${albumId}&entity=song`);
  const data = await res.json();
  const tracks = (data.results || []).filter((r) => r.wrapperType === 'track');

  if (!tracks.length) {
    throw new Error('Could not find any tracks for that Apple Music link.');
  }

  return tracks.map(trackToObj);
}

module.exports = { resolveAppleMusic };
