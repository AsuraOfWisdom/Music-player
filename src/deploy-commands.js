const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(config.token);

(async () => {
  try {
    const route = config.guildId
      ? Routes.applicationGuildCommands(config.clientId, config.guildId)
      : Routes.applicationCommands(config.clientId);

    console.log(
      `Registering ${commands.length} command(s)${config.guildId ? ` to guild ${config.guildId}` : ' globally'}...`,
    );
    await rest.put(route, { body: commands });
    console.log('Done.' + (config.guildId ? '' : ' (Global commands can take up to an hour to appear.)'));
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exitCode = 1;
  }
})();
