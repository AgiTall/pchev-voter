import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

function localizedStringOption({ name, ruName, description, ruDescription, maxLength }) {
  return (option) =>
    option
      .setName(name)
      .setNameLocalization('ru', ruName)
      .setDescription(description)
      .setDescriptionLocalization('ru', ruDescription)
      .setRequired(true)
      .setMaxLength(maxLength);
}

export const setVoteCommand = new SlashCommandBuilder()
  .setName('set-vote')
  .setDescription('Create a UN-style vote')
  .setDescriptionLocalization('ru', 'Создать голосование в стиле ООН')
  .addStringOption(
    localizedStringOption({
      name: 'title',
      ruName: 'заголовок',
      description: 'Vote title',
      ruDescription: 'Заголовок голосования',
      maxLength: 256
    })
  )
  .addUserOption((option) =>
    option
      .setName('candidate')
      .setNameLocalization('ru', 'кандидат')
      .setDescription('Candidate being voted on')
      .setDescriptionLocalization('ru', 'Кандидат, по которому проводится голосование')
      .setRequired(true)
  )
  .addStringOption(
    localizedStringOption({
      name: 'description',
      ruName: 'описание',
      description: 'What is being decided',
      ruDescription: 'Что именно решается',
      maxLength: 1_500
    })
  )
  .addStringOption(
    localizedStringOption({
      name: 'pros',
      ruName: 'почему-за',
      description: 'Arguments in favor',
      ruDescription: 'Аргументы в пользу решения',
      maxLength: 600
    })
  )
  .addStringOption(
    localizedStringOption({
      name: 'cons',
      ruName: 'почему-против',
      description: 'Arguments against',
      ruDescription: 'Аргументы против решения',
      maxLength: 600
    })
  )
  .addStringOption(
    localizedStringOption({
      name: 'duration',
      ruName: 'время',
      description: 'Voting time, for example: 30m, 2h, 1d',
      ruDescription: 'Время голосования: 30м, 2ч, 1 день',
      maxLength: 40
    })
  );

export const setMultiVoteCommand = new SlashCommandBuilder()
  .setName('set-multi-vote')
  .setDescription('Create a vote with up to five choices')
  .setDescriptionLocalization('ru', 'Создать голосование с вариантами ответа')
  .addStringOption(
    localizedStringOption({
      name: 'title',
      ruName: 'заголовок',
      description: 'Vote title',
      ruDescription: 'Заголовок голосования',
      maxLength: 256
    })
  )
  .addStringOption(
    localizedStringOption({
      name: 'description',
      ruName: 'описание',
      description: 'What participants are choosing',
      ruDescription: 'Что именно выбирают участники',
      maxLength: 1_500
    })
  )
  .addStringOption(
    localizedStringOption({
      name: 'duration',
      ruName: 'время',
      description: 'Voting time, for example: 30m, 2h, 1d',
      ruDescription: 'Время голосования: 30м, 2ч, 1 день',
      maxLength: 40
    })
  );

for (let index = 1; index <= 5; index += 1) {
  setMultiVoteCommand.addStringOption((option) =>
    option
      .setName(`choice-${index}`)
      .setNameLocalization('ru', `вариант-${index}`)
      .setDescription(`Choice ${index}`)
      .setDescriptionLocalization('ru', `Текст варианта ответа №${index}`)
      .setRequired(false)
      .setMaxLength(80)
  );
}

export const restoreVotesCommand = new SlashCommandBuilder()
  .setName('restore-votes')
  .setDescription('Restore votes from votes.json')
  .setDescriptionLocalization('ru', 'Восстановить голосования из votes.json')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addAttachmentOption((option) =>
    option
      .setName('file')
      .setNameLocalization('ru', 'файл')
      .setDescription('The local data/votes.json file')
      .setDescriptionLocalization('ru', 'Локальный файл data/votes.json')
      .setRequired(true)
  );

export const partiesCommand = new SlashCommandBuilder()
  .setName('parties')
  .setDescription('Open the server party system')
  .setDescriptionLocalization('ru', 'Открыть меню партий сервера')
  .setDMPermission(false);

export const electionCommand = new SlashCommandBuilder()
  .setName('election')
  .setDescription('Vote in the active presidential election')
  .setDescriptionLocalization('ru', 'Проголосовать на активных выборах президента')
  .setDMPermission(false);

export const royalCommand = new SlashCommandBuilder()
  .setName('royal')
  .setDescription('Open the political administration panel')
  .setDescriptionLocalization('ru', 'Открыть пульт управления политической системой')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

export const commands = [
  setVoteCommand.toJSON(),
  setMultiVoteCommand.toJSON(),
  restoreVotesCommand.toJSON(),
  partiesCommand.toJSON(),
  electionCommand.toJSON(),
  royalCommand.toJSON()
];
