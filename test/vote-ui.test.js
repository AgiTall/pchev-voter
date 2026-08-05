import test from 'node:test';
import assert from 'node:assert/strict';
import { ButtonStyle } from 'discord.js';
import {
  buildVoteMessage,
  countBallots,
  countMultipleBallots,
  EMBED_COLOR,
  formatRemainingTime,
  getDecision,
  getMultipleDecision
} from '../src/vote-ui.js';

test('считает по одному текущему голосу на пользователя', () => {
  const counts = countBallots({ a: 'for', b: 'against', c: 'abstain', d: 'for' });
  assert.deepEqual(counts, { for: 2, abstain: 1, against: 1, veto: 0, total: 4 });
});

test('простое большинство принимает решение', () => {
  const decision = getDecision({ ballots: { a: 'for', b: 'for', c: 'against' } });
  assert.match(decision.title, /принято/i);
});

test('вето имеет приоритет над большинством', () => {
  const decision = getDecision({
    ballots: { a: 'for', b: 'for', c: 'for', admin: 'veto' }
  });
  assert.match(decision.title, /вето/i);
});

test('создаёт embed нужного цвета и четыре кнопки', () => {
  const vote = {
    id: '00000000-0000-0000-0000-000000000000',
    title: 'Заголовок',
    description: 'Описание',
    pros: 'Аргументы за',
    cons: 'Аргументы против',
    endsAt: Date.now() + 60_000,
    status: 'active',
    ballots: {}
  };
  const message = buildVoteMessage(vote);
  const embed = message.embeds[0].toJSON();
  const buttons = message.components[0].components.map((button) => button.toJSON());

  assert.equal(embed.color, EMBED_COLOR);
  assert.equal(buttons.length, 4);
  assert.deepEqual(
    buttons.map((button) => button.style),
    [
      ButtonStyle.Secondary,
      ButtonStyle.Secondary,
      ButtonStyle.Secondary,
      ButtonStyle.Secondary
    ]
  );
});

test('прикрепляет парламентское изображение к embed', () => {
  const vote = {
    id: '00000000-0000-0000-0000-000000000000',
    title: 'Заголовок',
    description: 'Описание',
    pros: 'За',
    cons: 'Против',
    endsAt: Date.now() + 60_000,
    status: 'active',
    ballots: {}
  };
  const message = buildVoteMessage(vote, {
    imageBuffer: Buffer.from('image'),
    replaceAttachments: true
  });

  assert.equal(message.embeds[0].toJSON().image.url, 'attachment://parliament.jpg');
  assert.equal(message.files[0].name, 'parliament.jpg');
  assert.deepEqual(message.attachments, []);

  const timerUpdate = buildVoteMessage(vote, { includeImage: true });
  assert.equal(timerUpdate.embeds[0].toJSON().image.url, 'attachment://parliament.jpg');
  assert.equal(timerUpdate.files, undefined);
});

test('показывает компактный шаблон голосования и кандидата', () => {
  const vote = {
    id: '00000000-0000-0000-0000-000000000000',
    title: 'Вступление в банду «Триумф»',
    candidateId: '123456789012345678',
    creatorId: '111111111111111111',
    description: 'хочет вступить в состав банды',
    pros: 'активный участник',
    cons: 'часто ведёт себя неуверенно',
    endsAt: Date.now() + 35_000,
    status: 'active',
    seats: Array.from({ length: 21 }, (_, index) => ({ userId: String(index) })),
    ballots: {}
  };
  const description = buildVoteMessage(vote).embeds[0].toJSON().description;

  assert.match(description, /Голосование активно/);
  assert.match(description, /Кандидат:\*\* <@123456789012345678>/);
  assert.match(description, /Проголосовало:\*\* 0 из 21/);
  assert.match(description, /До завершения:\*\* 00:35/);
});

test('форматирует цифровой таймер', () => {
  assert.equal(formatRemainingTime(100_000, 65_000), '00:35');
  assert.equal(formatRemainingTime(3_725_000, 0), '01:02:05');
  assert.equal(formatRemainingTime(90_061_000, 0), '1д 01:01:01');
});

test('создаёт голосование с несколькими вариантами', () => {
  const vote = {
    id: '00000000-0000-0000-0000-000000000000',
    type: 'multiple',
    title: 'Выбор места встречи',
    description: 'Где проведём собрание?',
    options: [
      { id: 'choice1', emojiKey: 'choice1', label: 'Штаб' },
      { id: 'choice2', emojiKey: 'choice2', label: 'Бар' },
      { id: 'choice3', emojiKey: 'choice3', label: 'Парк' }
    ],
    endsAt: Date.now() + 60_000,
    status: 'active',
    seats: [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }],
    ballots: { a: 'choice1', b: 'choice2', c: 'choice1' }
  };
  const message = buildVoteMessage(vote);
  const description = message.embeds[0].toJSON().description;

  assert.deepEqual(countMultipleBallots(vote), {
    choice1: 2,
    choice2: 1,
    choice3: 0,
    total: 3
  });
  assert.equal(message.components[0].components.length, 3);
  assert.match(description, /Штаб:\*\* 2/);
  assert.match(description, /Бар:\*\* 1/);
  assert.equal(getMultipleDecision(vote).winners[0].id, 'choice1');
});

test('определяет ничью между несколькими вариантами', () => {
  const vote = {
    type: 'multiple',
    options: [
      { id: 'choice1', label: 'Первый' },
      { id: 'choice2', label: 'Второй' }
    ],
    ballots: { a: 'choice1', b: 'choice2' }
  };
  assert.equal(getMultipleDecision(vote).outcome, 'tie');
});
