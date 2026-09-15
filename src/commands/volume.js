const { SlashCommandBuilder } = require('discord.js');
const { getManager } = require('../music/GuildMusicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Set playback volume (0-200)')
    .addIntegerOption((opt) =>
      opt
        .setName('level')
        .setDescription('Volume percentage')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(200),
    ),

  async execute(interaction) {
    const level = interaction.options.getInteger('level', true);
    const manager = getManager(interaction.guildId);
    manager.setVolume(level);
    await interaction.reply(`Volume set to ${level}%.`);
  },
};
