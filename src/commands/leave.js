const { SlashCommandBuilder } = require('discord.js');
const { getManager } = require('../music/GuildMusicManager');

module.exports = {
  data: new SlashCommandBuilder().setName('leave').setDescription('Disconnect the bot from voice'),

  async execute(interaction) {
    const manager = getManager(interaction.guildId);
    manager.destroy();
    await interaction.reply('Disconnected.');
  },
};
