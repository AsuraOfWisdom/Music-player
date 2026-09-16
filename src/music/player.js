const { createAudioResource, StreamType } = require('@discordjs/voice');
const { spawnAudioStream } = require('./ytdlp');
const { searchYouTube } = require('./resolvers/youtube');

/**
 * Turn a track object into a playable @discordjs/voice AudioResource.
 *
 * Returns { resource, cleanup } — cleanup() must be called once this
 * track finishes, errors, or is skipped, so that the yt-dlp child
 * process spawned for it doesn't linger in the background.
 *
 * Every source streams through yt-dlp (it natively supports both
 * YouTube and SoundCloud). Spotify/Apple Music tracks arrive here with
 * url === null (metadata only) and get resolved to a YouTube match via
 * searchYouTube first.
 */
async function createResourceForTrack(track) {
  let playUrl = track.url;

  if (!playUrl) {
    const results = await searchYouTube(track.searchQuery || track.title, 1);
    if (!results.length) {
      throw new Error(`no playable match found for "${track.title}"`);
    }
    playUrl = results[0].url;
    if (!track.duration) track.duration = results[0].duration;
  }

  // spawnAudioStream now downloads the track to a temp file before
  // transcoding (see its comment in ytdlp.js for why), so it's async —
  // this resolves only once the file is fully downloaded and ffmpeg has
  // started reading it, not the instant yt-dlp is launched.
  const { stream, kill } = await spawnAudioStream(playUrl);
  const resource = createAudioResource(stream, {
    inputType: StreamType.Raw,
    inlineVolume: true,
  });

  return { resource, cleanup: kill };
}

module.exports = { createResourceForTrack };
