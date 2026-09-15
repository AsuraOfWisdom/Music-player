const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config');

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

function baseArgs() {
  const args = ['--no-warnings', '--no-playlist'];
  const cookiesPath = ensureCookiesFile();
  if (cookiesPath) args.push('--cookies', cookiesPath);
  return args;
}

/**
 * Run yt-dlp with --dump-json against a URL or a "ytsearchN:query" target
 * and return the parsed JSON object(s) it printed (one per line).
 */
function dumpJson(target) {
  return new Promise((resolve, reject) => {
    const args = [...baseArgs(), '--dump-json', target];
    const child = spawn('yt-dlp', args);

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (err) => {
      reject(new Error(`Could not run yt-dlp (is it installed?): ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
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
 * Spawn yt-dlp streaming best-quality audio for a URL straight to stdout.
 * The caller pipes child.stdout into the voice connection and must call
 * kill() once the track ends/skips so the process doesn't linger.
 */
function spawnAudioStream(url) {
  const args = [...baseArgs(), '-f', 'bestaudio[protocol!=m3u8_native]/bestaudio', '-o', '-', url];
  const child = spawn('yt-dlp', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderrTail = '';
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk).slice(-4000);
  });

  child.on('error', (err) => {
    child.stdout.destroy(new Error(`Could not run yt-dlp (is it installed?): ${err.message}`));
  });
  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      const lastLine = stderrTail.trim().split('\n').filter(Boolean).pop();
      child.stdout.destroy(new Error(lastLine || `yt-dlp exited with code ${code}`));
    }
  });

  return child;
}

module.exports = { dumpJson, spawnAudioStream, ensureCookiesFile };
