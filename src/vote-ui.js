import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import { getEmojis } from './emoji-config.js';

export const EMBED_COLOR = 0x102c4d;

export const CHOICES = Object.freeze({
  FOR: 'for',
  ABSTAIN: 'abstain',
  AGAINST: 'against',
  VETO: 'veto'
});

function getButtons(vote) {
  const emojis = getEmojis();

  if (vote.type === 'multiple') {
    return vote.options.map((option) => ({
      choice: option.id,
      label: option.label,
      emoji: emojis[option.emojiKey ?? option.id],
      style: ButtonStyle.Secondary
    }));
  }

  return [
    { choice: CHOICES.FOR, label: 'За', emoji: emojis.for, style: ButtonStyle.Secondary },
    {
      choice: CHOICES.ABSTAIN,
      label: 'Воздержаться',
      emoji: emojis.abstain,
      style: ButtonStyle.Secondary
    },
    {
      choice: CHOICES.AGAINST,
      label: 'Против',
      emoji: emojis.against,
      style: ButtonStyle.Secondary
    },
    {
      choice: CHOICES.VETO,
      label: 'Вето · админы',
      emoji: emojis.veto,
      style: ButtonStyle.Secondary
    }
  ];
}

export function countBallots(ballots = {}) {
  const counts = {
    [CHOICES.FOR]: 0,
    [CHOICES.ABSTAIN]: 0,
    [CHOICES.AGAINST]: 0,
    [CHOICES.VETO]: 0,
    total: 0
  };

  for (const choice of Object.values(ballots)) {
    if (choice in counts && choice !== 'total') {
      counts[choice] += 1;
      counts.total += 1;
    }
  }

  return counts;
}

export function countMultipleBallots(vote) {
  const counts = Object.fromEntries((vote.options ?? []).map((option) => [option.id, 0]));
  counts.total = 0;

  for (const choice of Object.values(vote.ballots ?? {})) {
    if (Object.hasOwn(counts, choice) && choice !== 'total') {
      counts[choice] += 1;
      counts.total += 1;
    }
  }

  return counts;
}

export function getDecision(vote) {
  const counts = countBallots(vote.ballots);

  if (counts.veto > 0) {
    return {
      outcome: 'veto',
      title: 'Решение заблокировано правом вето',
      description: 'Администратор применил право вето.'
    };
  }

  if (counts.for > counts.against) {
    return {
      outcome: 'accepted',
      title: 'Решение принято',
      description: 'Голосов «за» больше, чем голосов «против».'
    };
  }

  if (counts.for === counts.against) {
    return {
      outcome: 'tie',
      title: 'Решение не принято',
      description: 'Голоса «за» и «против» разделились поровну.'
    };
  }

  return {
    outcome: 'rejected',
    title: 'Решение отклонено',
    description: 'Голосов «против» больше, чем голосов «за».'
  };
}

export function getMultipleDecision(vote) {
  const counts = countMultipleBallots(vote);
  if (counts.total === 0) {
    return { outcome: 'empty', title: 'Никто не проголосовал', winners: [] };
  }

  const highest = Math.max(...vote.options.map((option) => counts[option.id]));
  const winners = vote.options.filter((option) => counts[option.id] === highest);

  if (winners.length > 1) {
    return {
      outcome: 'tie',
      title: `Ничья: ${winners.map((option) => option.label).join(', ')}`,
      winners
    };
  }

  return {
    outcome: 'winner',
    title: `Победил вариант «${winners[0].label}»`,
    winners
  };
}

export function formatRemainingTime(endsAt, now = Date.now()) {
  const totalSeconds = Math.max(0, Math.ceil((endsAt - now) / 1_000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const clockParts = days > 0 || hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
  const clock = clockParts.map((value) => String(value).padStart(2, '0')).join(':');
  return days > 0 ? `${days}д ${clock}` : clock;
}

function commonEndingLines(vote, total, emojis, isActive) {
  return [
    '',
    `${emojis.voted} **Проголосовало:** ${total} из ${(vote.seats ?? []).length}`,
    `${emojis.time} **До завершения:** ${formatRemainingTime(vote.endsAt, isActive ? Date.now() : vote.endsAt)}`
  ];
}

function buildBinaryLines(vote, emojis, isActive) {
  const counts = countBallots(vote.ballots);
  const candidateId = vote.candidateId ?? vote.creatorId;
  const lines = [
    `${isActive ? emojis.active : emojis.closed} **Голосование ${isActive ? 'активно' : 'завершено'}**`,
    '',
    `${emojis.candidate} **Кандидат:** <@${candidateId}>`,
    `${emojis.description} **Описание:** ${vote.description}`,
    '',
    `${emojis.arguments} **Аргументы**`,
    `${emojis.for} **За:** ${vote.pros}`,
    `${emojis.against} **Против:** ${vote.cons}`,
    '',
    `${emojis.results} **Результаты**`,
    `${emojis.for} **За:** ${counts.for}`,
    `${emojis.abstain} **Воздержались:** ${counts.abstain}`,
    `${emojis.against} **Против:** ${counts.against}`
  ];

  if (counts.veto > 0) lines.push(`${emojis.veto} **Вето:** ${counts.veto}`);
  lines.push(...commonEndingLines(vote, counts.total, emojis, isActive));

  if (!isActive) {
    const decision = getDecision(vote);
    lines.push('', `${emojis.decision} **Итог:** ${emojis[decision.outcome]} ${decision.title}`);
  }

  return lines;
}

function buildMultipleLines(vote, emojis, isActive) {
  const counts = countMultipleBallots(vote);
  const lines = [
    `${isActive ? emojis.active : emojis.closed} **Голосование ${isActive ? 'активно' : 'завершено'}**`,
    '',
    `${emojis.description} **Описание:** ${vote.description}`,
    '',
    `${emojis.choices} **Варианты и результаты**`,
    ...vote.options.map(
      (option) => `${emojis[option.emojiKey ?? option.id]} **${option.label}:** ${counts[option.id]}`
    ),
    ...commonEndingLines(vote, counts.total, emojis, isActive)
  ];

  if (!isActive) {
    const decision = getMultipleDecision(vote);
    const outcomeEmoji =
      decision.outcome === 'winner'
        ? emojis[decision.winners[0].emojiKey ?? decision.winners[0].id]
        : emojis[decision.outcome];
    lines.push('', `${emojis.decision} **Итог:** ${outcomeEmoji} ${decision.title}`);
  }

  return lines;
}

export function buildVoteEmbed(vote, imageName) {
  const emojis = getEmojis();
  const isActive = vote.status === 'active';
  const lines =
    vote.type === 'multiple'
      ? buildMultipleLines(vote, emojis, isActive)
      : buildBinaryLines(vote, emojis, isActive);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(vote.title)
    .setDescription(lines.join('\n'));

  if (imageName) embed.setImage(`attachment://${imageName}`);
  if (!isActive) embed.setTimestamp(vote.closedAt ?? Date.now());
  return embed;
}

export function buildVoteComponents(vote, disabled = vote.status !== 'active') {
  const row = new ActionRowBuilder();

  for (const button of getButtons(vote)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`vote:${button.choice}:${vote.id}`)
        .setLabel(button.label)
        .setEmoji(button.emoji)
        .setStyle(button.style)
        .setDisabled(disabled)
    );
  }

  return [row];
}

export function buildVoteMessage(
  vote,
  {
    imageBuffer,
    imageName = 'parliament.jpg',
    includeImage = false,
    replaceAttachments = false
  } = {}
) {
  const shouldShowImage = Boolean(imageBuffer || includeImage);
  const message = {
    embeds: [buildVoteEmbed(vote, shouldShowImage ? imageName : undefined)],
    components: buildVoteComponents(vote)
  };

  if (imageBuffer) {
    message.files = [{ attachment: imageBuffer, name: imageName }];
    if (replaceAttachments) message.attachments = [];
  }

  return message;
}
