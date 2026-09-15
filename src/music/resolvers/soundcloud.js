const play = require('play-dl');

/**
 * Resolve a SoundCloud track or playlist URL. SoundCloud audio can be
 * streamed directly (no need to fall back to YouTube).
 */
async function resolveSoundCloud(url) {
  const info = await play.soundcloud(url);

  if (info.type === 'playlist') {
    const tracks = await info.all_tracks();
    return tracks.map(trackToObj);
  }

  return [trackToObj(info)];
}

function trackToObj(t) {
  return {
    title: t.name,
    url: t.url,
    duration: t.durationInSec,
    thumbnail: t.thumbnail,
    source: 'soundcloud',
  };
}

module.exports = { resolveSoundCloud };
