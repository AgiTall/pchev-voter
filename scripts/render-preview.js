import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ParliamentRenderer } from '../src/parliament-renderer.js';

const palette = ['#274C77', '#396A93', '#5C5470', '#394867', '#3F4E4F'];

function avatarDataUrl(index) {
  const label = String.fromCharCode(1040 + (index % 32));
  const color = palette[index % palette.length];
  const svg =
    `<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="128" height="128" fill="${color}"/>` +
    `<text x="64" y="82" text-anchor="middle" font-family="Arial" ` +
    `font-size="62" font-weight="700" fill="#F2F6FA">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

const seats = Array.from({ length: 56 }, (_, index) => ({
  userId: `preview-${index}`,
  displayName: `Участник ${index + 1}`,
  avatarUrl: avatarDataUrl(index)
}));

const ballots = {};
seats.forEach((seat, index) => {
  if (index < 22) ballots[seat.userId] = 'for';
  else if (index < 32) ballots[seat.userId] = 'abstain';
  else if (index < 43) ballots[seat.userId] = 'against';
  else if (index < 46) ballots[seat.userId] = 'veto';
});

const renderer = new ParliamentRenderer(path.resolve('assets/parliament-background.png'));
const image = await renderer.render({ seats, ballots });
const outputDirectory = path.resolve('preview');
const outputPath = path.join(outputDirectory, 'parliament-preview.jpg');
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, image);
console.log(outputPath);

const multiOptions = ['Штаб', 'Бар', 'Парк', 'Клуб', 'Особняк'].map((label, index) => ({
  id: `choice${index + 1}`,
  emojiKey: `choice${index + 1}`,
  label
}));
const multiBallots = {};
seats.forEach((seat, index) => {
  if (index < 48) multiBallots[seat.userId] = `choice${(index % 5) + 1}`;
});
const multiImage = await renderer.render({
  type: 'multiple',
  options: multiOptions,
  seats,
  ballots: multiBallots
});
const multiOutputPath = path.join(outputDirectory, 'parliament-multi-preview.jpg');
await writeFile(multiOutputPath, multiImage);
console.log(multiOutputPath);
