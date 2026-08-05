import sharp from 'sharp';

export const SEAT_COLORS = Object.freeze({
  for: '#2ECC71',
  abstain: '#AEB4BE',
  against: '#E23B3B',
  veto: '#7A1737',
  choice1: '#2ECC71',
  choice2: '#3498DB',
  choice3: '#F1C40F',
  choice4: '#9B59B6',
  choice5: '#E67E22',
  neutral: '#35516F'
});

const START_ANGLE = (190 * Math.PI) / 180;
const END_ANGLE = (350 * Math.PI) / 180;

function rowCapacity(radius, seatSize) {
  const arcLength = (END_ANGLE - START_ANGLE) * radius;
  return Math.max(1, Math.floor(arcLength / (seatSize + Math.max(6, seatSize * 0.16))));
}

function distributeAcrossRows(total, capacities) {
  if (total === 0) return [];

  let rowCount = 1;
  const minimumRows = Math.min(total, total >= 10 ? 3 : total >= 5 ? 2 : 1);

  while (
    rowCount < capacities.length &&
    (rowCount < minimumRows || capacities.slice(0, rowCount).reduce((sum, value) => sum + value, 0) < total)
  ) {
    rowCount += 1;
  }

  const selected = capacities.slice(0, rowCount);
  const capacitySum = selected.reduce((sum, value) => sum + value, 0);
  const allocation = selected.map((capacity) =>
    Math.min(capacity, Math.max(1, Math.floor((total * capacity) / capacitySum)))
  );

  let allocated = allocation.reduce((sum, value) => sum + value, 0);
  while (allocated < total) {
    const index = allocation.findIndex((value, rowIndex) => value < selected[rowIndex]);
    if (index === -1) break;
    allocation[index] += 1;
    allocated += 1;
  }

  while (allocated > total) {
    const index = allocation.findLastIndex((value) => value > 1);
    if (index === -1) break;
    allocation[index] -= 1;
    allocated -= 1;
  }

  return allocation;
}

/** Рассчитывает места без привязки к Discord — удобно проверять отдельно. */
export function calculateSeatLayout(count, width, height) {
  if (count <= 0) return { seatSize: 0, positions: [] };

  const centerX = width / 2;
  const centerY = height * 0.91;
  const maxRadius = Math.min(width * 0.43, height * 0.76);
  const minRadius = Math.min(width * 0.12, maxRadius * 0.35);
  let seatSize = 78;
  let radii = [];
  let capacities = [];

  for (; seatSize >= 16; seatSize -= 2) {
    const rowGap = seatSize + Math.max(8, seatSize * 0.2);
    radii = [];

    for (let radius = maxRadius; radius >= minRadius; radius -= rowGap) {
      radii.push(radius);
    }

    capacities = radii.map((radius) => rowCapacity(radius, seatSize));
    const totalCapacity = capacities.reduce((sum, value) => sum + value, 0);
    if (totalCapacity >= count) break;
  }

  const totalCapacity = capacities.reduce((sum, value) => sum + value, 0);
  if (totalCapacity < count && capacities.length > 0) {
    capacities[capacities.length - 1] += count - totalCapacity;
  }

  const allocation = distributeAcrossRows(count, capacities);
  const positions = [];

  allocation.forEach((seatsInRow, rowIndex) => {
    const radius = radii[rowIndex];

    for (let seatIndex = 0; seatIndex < seatsInRow; seatIndex += 1) {
      const angle =
        seatsInRow === 1
          ? (START_ANGLE + END_ANGLE) / 2
          : START_ANGLE + ((END_ANGLE - START_ANGLE) * seatIndex) / (seatsInRow - 1);

      positions.push({
        x: Math.round(centerX + Math.cos(angle) * radius - seatSize / 2),
        y: Math.round(centerY + Math.sin(angle) * radius - seatSize / 2),
        size: seatSize,
        row: rowIndex
      });
    }
  });

  return { seatSize, positions: positions.slice(0, count) };
}

function countChoices(vote) {
  const choiceKeys =
    vote.type === 'multiple'
      ? vote.options.map((option) => option.id)
      : ['for', 'abstain', 'against', 'veto'];
  const counts = Object.fromEntries(choiceKeys.map((choice) => [choice, 0]));
  counts.neutral = 0;

  for (const seat of vote.seats ?? []) {
    const choice = vote.ballots?.[seat.userId];
    counts[choiceKeys.includes(choice) ? choice : 'neutral'] += 1;
  }
  return counts;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function truncateLabel(value, maxLength = 18) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function makeCircleMask(size) {
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>` +
      '</svg>'
  );
}

async function mapWithLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export class ParliamentRenderer {
  constructor(backgroundPath) {
    this.backgroundPath = backgroundPath;
    this.avatarCache = new Map();
    this.metadataPromise = sharp(backgroundPath).metadata();
  }

  async getCircularAvatar(url, size) {
    const cacheKey = `${url}:${size}`;
    if (this.avatarCache.has(cacheKey)) return this.avatarCache.get(cacheKey);

    const avatarPromise = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Не удалось загрузить аватар: HTTP ${response.status}`);
      const source = Buffer.from(await response.arrayBuffer());

      return sharp(source)
        .resize(size, size, { fit: 'cover' })
        .composite([{ input: makeCircleMask(size), blend: 'dest-in' }])
        .png()
        .toBuffer();
    })();

    this.avatarCache.set(cacheKey, avatarPromise);
    if (this.avatarCache.size > 1_000) {
      this.avatarCache.delete(this.avatarCache.keys().next().value);
    }

    try {
      return await avatarPromise;
    } catch (error) {
      this.avatarCache.delete(cacheKey);
      throw error;
    }
  }

  async makeFallbackAvatar(size) {
    return sharp(
      Buffer.from(
        `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
          `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#102C4D"/>` +
          `<text x="50%" y="56%" text-anchor="middle" font-family="Segoe UI,Arial" ` +
          `font-size="${size * 0.52}" font-weight="700" fill="#D8E8F8">?</text></svg>`
      )
    )
      .png()
      .toBuffer();
  }

  makeOverlaySvg(vote, width, height, positions) {
    const borderWidth = Math.max(3, Math.round((positions[0]?.size ?? 30) * 0.09));
    const circles = positions
      .map((position, index) => {
        const seat = vote.seats[index];
        const choice = vote.ballots?.[seat.userId];
        const color = SEAT_COLORS[choice] ?? SEAT_COLORS.neutral;
        const radius = position.size / 2 - borderWidth / 2;
        const centerX = position.x + position.size / 2;
        const centerY = position.y + position.size / 2;
        return (
          `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" ` +
          `stroke="#020711" stroke-width="${borderWidth + 4}"/>` +
          `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="none" ` +
          `stroke="${color}" stroke-width="${borderWidth}"/>`
        );
      })
      .join('');

    const counts = countChoices(vote);
    const legend =
      vote.type === 'multiple'
        ? [
            ...vote.options.map((option) => [
              truncateLabel(option.label),
              counts[option.id],
              SEAT_COLORS[option.id]
            ]),
            ['Не голосовали', counts.neutral, SEAT_COLORS.neutral]
          ]
        : [
            ['За', counts.for, SEAT_COLORS.for],
            ['Воздержались', counts.abstain, SEAT_COLORS.abstain],
            ['Против', counts.against, SEAT_COLORS.against],
            ['Вето', counts.veto, SEAT_COLORS.veto],
            ['Не голосовали', counts.neutral, SEAT_COLORS.neutral]
          ];
    const legendWidth = width / legend.length;
    const legendItems = legend
      .map(([label, value, color], index) => {
        const x = legendWidth * index + legendWidth / 2;
        return (
          `<circle cx="${x}" cy="${height - 42}" r="7" fill="${color}"/>` +
          `<text x="${x}" y="${height - 12}" text-anchor="middle" font-family="Segoe UI,Arial" ` +
          `font-size="18" font-weight="600" fill="#E7F0FA">${escapeXml(label)}: ${value}</text>`
        );
      })
      .join('');

    return Buffer.from(
      `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect x="0" y="${height - 64}" width="${width}" height="64" fill="#030A13" fill-opacity="0.86"/>` +
        circles +
        legendItems +
        '</svg>'
    );
  }

  async render(vote) {
    const metadata = await this.metadataPromise;
    const width = metadata.width;
    const height = metadata.height;
    const seats = vote.seats ?? [];
    const { positions } = calculateSeatLayout(seats.length, width, height);
    const innerSize = Math.max(10, (positions[0]?.size ?? 30) - 10);
    const fallbackAvatar = await this.makeFallbackAvatar(innerSize);

    const avatarBuffers = await mapWithLimit(seats, 12, async (seat) => {
      try {
        return await this.getCircularAvatar(seat.avatarUrl, innerSize);
      } catch (error) {
        console.warn(`Не удалось отобразить аватар пользователя ${seat.userId}:`, error.message);
        return fallbackAvatar;
      }
    });

    const avatarLayers = avatarBuffers.map((input, index) => {
      const padding = Math.round((positions[index].size - innerSize) / 2);
      return {
        input,
        left: positions[index].x + padding,
        top: positions[index].y + padding
      };
    });

    const overlay = this.makeOverlaySvg(vote, width, height, positions);
    return sharp(this.backgroundPath)
      .composite([...avatarLayers, { input: overlay, left: 0, top: 0 }])
      .jpeg({ quality: 88, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }
}
