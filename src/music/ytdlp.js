const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config');

// The build (see nixpacks.toml) downloads yt-dlp straight from its GitHub
// releases into /usr/local/bin — call it by that exact path rather than
// relying on Node's PATH lookup, which didn't find it by name at runtime
// even though the binary was confirmed present after a successful build.
// YTDLP_PATH lets that location be overridden if it's ever installed
// somewhere else.
const YTDLP_BIN = process.env.YTDLP_PATH || '/usr/local/bin/yt-dlp';

// Where the build (see nixpacks.toml) unzips the bgutil-ytdlp-pot-provider
// plugin. Passed via --plugin-dirs rather than relying on yt-dlp's default
// plugin search locations (~/.config/yt-dlp/plugins etc.), which depend on
// $HOME/CWD being predictable at runtime — this path is absolute and fixed
// at build time, so it always resolves the same way.
const POT_PLUGIN_DIR = '/opt/yt-dlp-plugins';

// yt-dlp's --cookies flag wants a real Netscape-format cookies file, not
// an inline string, so the base64 env var gets decoded to disk once, on
// first use, and reused for the life of the process.
let cookiesFilePath = null;
let cookiesInitAttempted = false;

function ensureCookiesFile() {
  if (cookiesInitAttempted) return cookiesFilePath;
  cookiesInitAttempted = true;

  if (!config.youtubeCookiesB64) return null;

  try {
    const content = Buffer.from(config.youtubeCookiesB64, 'base64').toString('utf8');
    const filePath = path.join(os.tmpdir(), 'youtube-cookies.txt');
    fs.writeFileSync(filePath, content, { mode: 0o600 });
    cookiesFilePath = filePath;
  } catch (err) {
    console.warn('Could not write YouTube cookies file:', err.message);
  }

  return cookiesFilePath;
}

function baseArgs({ noPlaylist = false } = {}) {
  const args = ['--no-warnings', '--verbose'];
  if (noPlaylist) args.push('--no-playlist');
  const cookiesPath = ensureCookiesFile();
  if (cookiesPath) args.push('--cookies', cookiesPath);
  // Selects YouTube "player clients" that (for now) aren't requiring a PO
  // Token to actually download audio, not just read metadata. See
  // config.ytPlayerClients for why this is configurable. Harmless no-op
  // for non-YouTube URLs (SoundCloud, etc.) — yt-dlp just ignores an
  // extractor-args block that doesn't apply to the site being used.
  //
  // player_client and formats are combined into one youtube: extractor-args
  // value (';'-separated) rather than two separate --extractor-args flags —
  // both work, but one flag is less to get wrong if this is edited later.
  // See config.ytFormatsArg for what 'formats' is doing here.
  const youtubeExtractorArgs = [];
  if (config.ytPlayerClients) youtubeExtractorArgs.push(`player_client=${config.ytPlayerClients}`);
  if (config.ytFormatsArg) youtubeExtractorArgs.push(`formats=${config.ytFormatsArg}`);
  if (youtubeExtractorArgs.length) {
    args.push('--extractor-args', `youtube:${youtubeExtractorArgs.join(';')}`);
  }
  // Point yt-dlp at the bgutil PO Token provider plugin (see nixpacks.toml
  // and config.potProviderUrl) so it can get a real token instead of
  // relying on client selection alone, which YouTube keeps closing off.
  // Only wired up when a provider URL is actually configured — with no
  // companion service to talk to, loading the plugin would just add a
  // failed network call to every request.
  if (config.potProviderUrl) {
    args.push('--plugin-dirs', POT_PLUGIN_DIR);
    args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${config.potProviderUrl}`);
  }
  return args;
}

/**
 * Run yt-dlp with --dump-json against a URL or a "ytsearchN:query" target
 * and return the parsed JSON object(s) it printed (one per line).
 *
 * Pass { noPlaylist: true } for anything that should always resolve to a
 * single item (a specific video/track, or a search). Leave it false for
 * a URL that might itself be a playlist/set the caller wants expanded
 * (e.g. a SoundCloud "sets" link) — yt-dlp naturally prints one JSON
 * object per entry in that case.
 */
function dumpJson(target, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = [...baseArgs(opts), '--dump-json', target];
    const child = spawn(YTDLP_BIN, args);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      reject(new Error(`Could not run yt-dlp (is it installed?): ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        // --verbose (see baseArgs) makes yt-dlp print a lot here — which
        // client it tried, whether the PO Token plugin loaded, whether it
        // could reach the provider server, etc. That's exactly what's
        // needed to diagnose PO Token/plugin issues, so log it in full to
        // the Railway deploy log rather than just the one-line summary
        // Discord shows (Discord's message length wouldn't fit it anyway).
        console.error(`[yt-dlp] full output for "${target}":\n${stderr.trim()}`);
        const lastLine = stderr.trim().split('\n').filter(Boolean).pop();
        return reject(new Error(lastLine || `yt-dlp exited with code ${code}`));
      }
      try {
        const results = stdout
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        resolve(results);
      } catch (err) {
        reject(new Error(`Could not parse yt-dlp output: ${err.message}`));
      }
    });
  });
}

/**
 * Stream best-quality audio for a URL as raw PCM, ready for
 * @discordjs/voice's StreamType.Raw.
 *
 * yt-dlp downloads the audio and writes it to its own stdout; that gets
 * piped straight into ffmpeg, which transcodes it to raw 48kHz stereo
 * PCM on ITS stdout. Going through ffmpeg explicitly (rather than
 * handing yt-dlp's raw output to @discordjs/voice and asking it to
 * auto-detect the container/codec) avoids format-detection guesswork
 * that can silently produce no audio at all.
 *
 * Returns { stream, kill } — stream is ffmpeg's stdout; kill() must be
 * called once the track ends/skips so both child processes actually
 * exit instead of lingering.
 */
function spawnAudioStream(url) {
  // Always a single, already-resolved track URL by this point, regardless
  // of source, so playlist expansion is never wanted here.
  const ytArgs = [...baseArgs({ noPlaylist: true }), '-f', 'bestaudio/best', '-o', '-', url];
  const ytdlp = spawn(YTDLP_BIN, ytArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  const ffmpegArgs = [
    '-loglevel', 'error',
    '-i', 'pipe:0',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ];
  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

  ytdlp.stdout.pipe(ffmpeg.stdin);
  // If ffmpeg exits first (e.g. it errored) yt-dlp's write to a closed
  // pipe would otherwise crash the process with an uncaught EPIPE.
  ytdlp.stdout.on('error', () => {});
  ffmpeg.stdin.on('error', () => {});

  // Bumped from 4000 to 16000 chars — --verbose (see baseArgs) means a lot
  // more diagnostic output per track (client attempts, plugin/PO Token
  // status) than plain error output did, and it's all useful when a track
  // fails to download.
  let ytdlpStderr = '';
  ytdlp.stderr.on('data', (chunk) => { ytdlpStderr = (ytdlpStderr + chunk).slice(-16000); });
  let ffmpegStderr = '';
  ffmpeg.stderr.on('data', (chunk) => { ffmpegStderr = (ffmpegStderr + chunk).slice(-4000); });

  // Track how many bytes actually flow through each stage. A "successful"
  // (exit code 0) yt-dlp run that moves almost no bytes is just as broken
  // as one that errors outright — it's what a throttled or bogus-but-200
  // format URL looks like (seen from some non-web player clients like
  // android/ios): yt-dlp gets a response and considers the download done,
  // but the file is empty or a few bytes of garbage, so nothing ever
  // reaches ffmpeg or Discord. That failure mode produces NO error and
  // (before this) NO log output at all — which is exactly what "bot says
  // Now Playing, no sound, nothing in the deploy log" looks like — so it's
  // measured and logged explicitly here instead of only reacting to a
  // nonzero exit code.
  let ytdlpBytes = 0;
  ytdlp.stdout.on('data', (chunk) => { ytdlpBytes += chunk.length; });
  let ffmpegBytes = 0;
  ffmpeg.stdout.on('data', (chunk) => { ffmpegBytes += chunk.length; });

  const fail = (err) => ffmpeg.stdout.destroy(err);

  ytdlp.on('error', (err) => fail(new Error(`Could not run yt-dlp (is it installed?): ${err.message}`)));
  ffmpeg.on('error', (err) => fail(new Error(`Could not run ffmpeg (is it installed?): ${err.message}`)));

  // A real track is at minimum tens of KB of compressed audio. Anything
  // under this, even on a clean exit, means the "download" was effectively
  // empty.
  const MIN_SANE_YTDLP_BYTES = 8000;

  ytdlp.on('close', (code) => {
    const emptyDownload = code === 0 && ytdlpBytes < MIN_SANE_YTDLP_BYTES;
    // Always logged (not just on failure) so a silent/empty "success" shows
    // up in the deploy log instead of leaving nothing to diagnose from.
    console.log(`[yt-dlp] audio download for "${url}" finished: exit=${code}, bytes=${ytdlpBytes}${emptyDownload ? ' — SUSPICIOUSLY LOW, treating as a failure' : ''}`);
    if (code !== 0 || emptyDownload) {
      // Logged in full to the Railway deploy log (see the matching comment
      // in dumpJson above) — this is where PO Token/plugin problems during
      // the actual download step (as opposed to metadata lookup) show up.
      console.error(`[yt-dlp] full output for "${url}":\n${ytdlpStderr.trim()}`);
    }
    if (code !== 0 && code !== null) {
      const lastLine = ytdlpStderr.trim().split('\n').filter(Boolean).pop();
      fail(new Error(lastLine || `yt-dlp exited with code ${code}`));
    } else if (emptyDownload) {
      fail(new Error('yt-dlp produced an empty/near-empty audio file (likely an unusable format from the selected client)'));
    }
  });
  ffmpeg.on('close', (code) => {
    console.log(`[ffmpeg] transcode for "${url}" finished: exit=${code}, pcm-bytes=${ffmpegBytes}`);
    if (code !== 0 && code !== null) {
      const lastLine = ffmpegStderr.trim().split('\n').filter(Boolean).pop();
      fail(new Error(lastLine || `ffmpeg exited with code ${code}`));
    }
  });

  return {
    stream: ffmpeg.stdout,
    kill: () => {
      if (!ytdlp.killed) ytdlp.kill('SIGKILL');
      if (!ffmpeg.killed) ffmpeg.kill('SIGKILL');
    },
  };
}

module.exports = { dumpJson, spawnAudioStream, ensureCookiesFile };
