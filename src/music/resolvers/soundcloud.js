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
    source: 'soundcloud',
  };
}

/**
 * Resolve a SoundCloud track or "sets" (playlist) URL via yt-dlp, which
 * supports SoundCloud natively. noPlaylist is left off here (default
 * false) so a sets/playlist link naturally expands into all its tracks —
 * a single-track link is unaffected either way.
 */
async function resolveSoundCloud(url) {
  const results = await dumpJson(url);
  if (!results.length) throw new Error('Could not read that SoundCloud link.');
  return results.map(toTrack);
}

module.exports = { resolveSoundCloud };
