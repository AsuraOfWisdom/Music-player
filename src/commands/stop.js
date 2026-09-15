const { SlashCommandBuilder } = require('discord.js');
const { getManager } = require('../music/GuildMusicManager');

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop playback and clear the queue'),

  async execute(interaction) {
    const manager = getManager(interaction.guildId);
    manager.stop();
    await interaction.reply('Stopped and cleared the queue.');
  },
};
