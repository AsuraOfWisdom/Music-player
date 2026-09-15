const { dumpJson } = require('../ytdlp');

function toTrack(info) {
  const thumbnails = info.thumbnails;
  const thumbnail = Array.isArray(thumbnails) && thumbnails.length
    ? thumbnails[thumbnails.length - 1].url
    : info.thumbnail;

  return {
    title: info.title,
    url: info.webpage_url || info.original_url || info.url,
    duration: info.duration ? Math.round(info.duration) : null,
    thumbnail,
    source: 'youtube',
  };
}

/**
 * Resolve a direct YouTube video URL into a track object, via yt-dlp.
 */
async function resolveYouTube(url) {
  const [info] = await dumpJson(url);
  if (!info) throw new Error('Could not read that YouTube video.');
  return [toTrack(info)];
}

/**
 * Search YouTube for a text query and return the top `limit` results.
 * Used both for plain-text /play queries and for finding a playable
 * match for tracks that came from Spotify/Apple Music (metadata only).
 */
async function searchYouTube(query, limit = 1) {
  const results = await dumpJson(`ytsearch${limit}:${query}`);
  return results.map(toTrack);
}

module.exports = { resolveYouTube, searchYouTube };
