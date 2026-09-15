const { SlashCommandBuilder } = require('discord.js');
const { getManager, LOOP_MODES } = require('../music/GuildMusicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set loop mode')
    .addStringOption((opt) =>
      opt
        .setName('mode')
        .setDescription('Loop mode')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: LOOP_MODES.OFF },
          { name: 'Track', value: LOOP_MODES.TRACK },
          { name: 'Queue', value: LOOP_MODES.QUEUE },
        ),
    ),

  async execute(interaction) {
    const mode = interaction.options.getString('mode', true);
    const manager = getManager(interaction.guildId);
    manager.setLoop(mode);
    await interaction.reply(`Loop mode set to **${mode}**.`);
  },
};
