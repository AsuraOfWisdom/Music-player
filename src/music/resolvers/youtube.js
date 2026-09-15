const play = require('play-dl');

/**
 * Resolve a direct YouTube video URL into a track object.
 */
async function resolveYouTube(url) {
  const info = await play.video_basic_info(url);
  const d = info.video_details;

  return [{
    title: d.title,
    url: d.url,
    duration: d.durationInSec,
    thumbnail: d.thumbnails?.[0]?.url,
    source: 'youtube',
  }];
}

/**
 * Search YouTube for a text query and return the top `limit` results.
 * Used both for plain-text /play queries and for finding a playable
 * match for tracks that came from Spotify/Apple Music (metadata only).
 */
async function searchYouTube(query, limit = 1) {
  const results = await play.search(query, { source: { youtube: 'video' }, limit });

  return results.map((d) => ({
    title: d.title,
    url: d.url,
    duration: d.durationInSec,
    thumbnail: d.thumbnails?.[0]?.url,
    source: 'youtube',
  }));
}

module.exports = { resolveYouTube, searchYouTube };
