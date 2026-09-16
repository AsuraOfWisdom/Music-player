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
    if (config.guildIds.length === 0) {
      console.log(`Registering ${commands.length} command(s) globally...`);
      await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
      console.log('Done. (Global commands can take up to an hour to appear.)');
      return;
    }

    for (const guildId of config.guildIds) {
      console.log(`Registering ${commands.length} command(s) to guild ${guildId}...`);
      await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: commands });
    }
    console.log('Done.');
  } catch (err) {
    console.error('Failed to register commands:', err);
    process.exitCode = 1;
  }
})();
