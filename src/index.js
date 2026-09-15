const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const play = require('play-dl');
const config = require('./config');

if (!config.token || !config.clientId) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID — copy .env.example to .env and fill it in.');
  process.exit(1);
}

// Cloud hosts (Railway, AWS, etc.) frequently get "Sign in to confirm you're
// not a bot" from YouTube because the request looks anonymous/automated.
// Setting a real logged-in session cookie fixes this for play-dl. See the
// README's Troubleshooting section for how to get this value.
if (config.youtubeCookie) {
  play.setToken({ youtube: { cookie: config.youtubeCookie } });
  console.log('YouTube cookie configured.');
} else {
  console.warn('No YOUTUBE_COOKIE set — YouTube playback may fail with "Sign in to confirm you\'re not a bot" on cloud hosts.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // SoundCloud streaming needs a client ID; play-dl can fetch a free one
  // automatically. If this fails, set SOUNDCLOUD_CLIENT_ID yourself (see README).
  try {
    const scClientId = await play.getFreeClientID();
    play.setToken({ soundcloud: { client_id: scClientId } });
    console.log('SoundCloud client ID configured.');
  } catch (err) {
    console.warn('Could not auto-configure a SoundCloud client ID:', err.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error executing /${interaction.commandName}:`, err);
    const payload = { content: 'Something went wrong running that command.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

// Registers slash commands with Discord every time the bot boots. This is
// safe to run on every startup (it's just a full overwrite of the command
// list — Discord doesn't mind, and it means there's no separate manual
// "deploy commands" step to remember when running on a host like Railway).
async function registerCommandsOnBoot() {
  const commandsData = [...client.commands.values()].map((c) => c.data.toJSON());
  const rest = new REST().setToken(config.token);
  const route = config.guildId
    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
    : Routes.applicationCommands(config.clientId);

  console.log(
    `Registering ${commandsData.length} slash command(s)${config.guildId ? ` to guild ${config.guildId}` : ' globally'}...`,
  );
  await rest.put(route, { body: commandsData });
  console.log('Slash commands registered.');
}

(async () => {
  try {
    await registerCommandsOnBoot();
  } catch (err) {
    console.error('Failed to register slash commands on startup:', err.message);
  }

  client.login(config.token);
})();
