export function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

function intersects(a, b) {
  return !(b.x >= a.x + a.w || b.x + b.w <= a.x || b.y >= a.y + a.h || b.y + b.h <= a.y);
}

function containedIn(a, b) {
  return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
}

function splitFreeNode(free, used) {
  if (!intersects(free, used)) return [free];
  const result = [];
  if (used.x > free.x) result.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
  if (used.x + used.w < free.x + free.w) result.push({ x: used.x + used.w, y: free.y, w: free.x + free.w - used.x - used.w, h: free.h });
  if (used.y > free.y) result.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
  if (used.y + used.h < free.y + free.h) result.push({ x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - used.y - used.h });
  return result.filter(rect => rect.w > 0 && rect.h > 0);
}

function prune(rectangles) {
  return rectangles.filter((rect, index) => !rectangles.some((other, otherIndex) => index !== otherIndex && containedIn(rect, other)));
}

export function tryPack(items, width, height) {
  let free = [{ x: 0, y: 0, w: width, h: height }];
  const placed = [];
  for (const item of [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h)) {
    let best = null;
    for (const node of free) {
      if (item.w > node.w || item.h > node.h) continue;
      const short = Math.min(node.w - item.w, node.h - item.h);
      const long = Math.max(node.w - item.w, node.h - item.h);
      if (!best || short < best.short || (short === best.short && long < best.long)) best = { x: node.x, y: node.y, w: item.w, h: item.h, short, long };
    }
    if (!best) return null;
    const placement = { ...item, x: best.x, y: best.y };
    placed.push(placement);
    free = prune(free.flatMap(node => splitFreeNode(node, placement)));
  }
  return placed;
}

export function pack(items, { maxSize = 2048, powerOfTwo = true } = {}) {
  if (!items.length) return { width: 0, height: 0, frames: [] };
  const maxW = Math.max(...items.map(item => item.w));
  const maxH = Math.max(...items.map(item => item.h));
  const area = items.reduce((sum, item) => sum + item.w * item.h, 0);
  if (maxW > maxSize || maxH > maxSize || area > maxSize * maxSize) throw new Error(`Спрайты не помещаются в ${maxSize}×${maxSize}`);

  const candidates = [];
  if (powerOfTwo) {
    for (let width = nextPowerOfTwo(maxW); width <= maxSize; width *= 2) {
      for (let height = nextPowerOfTwo(maxH); height <= maxSize; height *= 2) {
        if (width * height >= area) candidates.push([width, height]);
      }
    }
  } else {
    const step = Math.max(8, Math.ceil(maxSize / 64 / 8) * 8);
    for (let width = Math.ceil(maxW / 8) * 8; width <= maxSize; width += step) {
      const ideal = Math.max(maxH, Math.ceil(area / width));
      for (let height = Math.ceil(ideal / 8) * 8; height <= Math.min(maxSize, ideal + step * 5); height += step) candidates.push([width, height]);
    }
    candidates.push([maxSize, maxSize]);
  }
  candidates.sort((a, b) => a[0] * a[1] - b[0] * b[1] || Math.abs(a[0] - a[1]) - Math.abs(b[0] - b[1]));
  for (const [width, height] of candidates) {
    const frames = tryPack(items, width, height);
    if (frames) return { width, height, frames };
  }
  throw new Error(`Спрайты не помещаются в ${maxSize}×${maxSize}`);
}
