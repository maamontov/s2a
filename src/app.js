import { pack } from './packer.js';
import { genericJSON, godotTRES, pixiJSON } from './exporters.js';
import { save as showSaveDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

const $ = selector => document.querySelector(selector);
const elements = {
  dropzone: $('#dropzone'), fileInput: $('#fileInput'), folderInput: $('#folderInput'),
  pickFiles: $('#pickFiles'), pickFolder: $('#pickFolder'), clearFiles: $('#clearFiles'),
  fileList: $('#fileList'), spriteCount: $('#spriteCount'), sourceSize: $('#sourceSize'),
  padding: $('#padding'), maxSize: $('#maxSize'), powerOfTwo: $('#powerOfTwo'), trim: $('#trim'),
  canvas: $('#atlasCanvas'), viewport: $('#canvasViewport'), empty: $('#emptyState'),
  surface: $('#canvasSurface'), guidesCanvas: $('#guidesCanvas'), showGuides: $('#showGuides'),
  dimensions: $('#atlasDimensions'), zoomValue: $('#zoomValue'), exportFormat: $('#exportFormat'),
  downloadPng: $('#downloadPng'), downloadData: $('#downloadData'), toast: $('#toast')
};

const state = { sprites: [], atlas: null, zoom: 1, generation: 0 };
const supported = /\.(png|webp|jpe?g)$/i;

function formatBytes(bytes) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function toast(message, error = false) {
  elements.toast.textContent = message;
  elements.toast.style.borderColor = error ? '#693a3a' : '';
  elements.toast.style.color = error ? '#ffabab' : '';
  elements.toast.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

function uniquePath(path, used = new Set(state.sprites.map(sprite => sprite.path))) {
  const normalized = path.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!used.has(normalized)) return normalized;
  const dot = normalized.lastIndexOf('.');
  const stem = dot >= 0 ? normalized.slice(0, dot) : normalized;
  const extension = dot >= 0 ? normalized.slice(dot) : '';
  let index = 2;
  while (used.has(`${stem}_${index}${extension}`)) index++;
  return `${stem}_${index}${extension}`;
}

async function decodeFile(file, path = file.webkitRelativePath || file.name) {
  if (!file.type.startsWith('image/') && !supported.test(file.name)) return null;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return { id, file, path, image, url, width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

async function addFiles(entries) {
  const files = entries.filter(entry => supported.test(entry.file.name));
  if (!files.length) return toast('Поддерживаемые изображения не найдены', true);
  const decoded = (await Promise.all(files.map(entry => decodeFile(entry.file, entry.path)))).filter(Boolean);
  const used = new Set(state.sprites.map(sprite => sprite.path));
  for (const sprite of decoded) {
    sprite.path = uniquePath(sprite.path, used);
    used.add(sprite.path);
  }
  state.sprites.push(...decoded);
  renderFileList();
  await regenerate();
  toast(`Добавлено: ${decoded.length}`);
}

function renderFileList() {
  elements.spriteCount.textContent = state.sprites.length;
  elements.sourceSize.textContent = formatBytes(state.sprites.reduce((sum, sprite) => sum + sprite.file.size, 0));
  elements.clearFiles.disabled = !state.sprites.length;
  elements.fileList.classList.toggle('empty', !state.sprites.length);
  if (!state.sprites.length) {
    elements.fileList.innerHTML = '<span>Здесь появятся загруженные файлы</span>';
    return;
  }
  elements.fileList.replaceChildren(...state.sprites.map(sprite => {
    const item = document.createElement('div');
    item.className = 'file-item';
    const image = document.createElement('img'); image.src = sprite.url; image.alt = '';
    const info = document.createElement('div');
    const name = document.createElement('b'); name.textContent = sprite.path;
    const meta = document.createElement('small'); meta.textContent = `${sprite.width}×${sprite.height} · ${formatBytes(sprite.file.size)}`;
    info.append(name, meta);
    const remove = document.createElement('button'); remove.textContent = '×'; remove.title = 'Удалить';
    remove.onclick = () => removeSprite(sprite.id);
    item.append(image, info, remove);
    return item;
  }));
}

function getTrim(sprite) {
  if (!elements.trim.checked) return { x: 0, y: 0, w: sprite.width, h: sprite.height, trimmed: false };
  const canvas = document.createElement('canvas');
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(sprite.image, 0, 0);
  const data = context.getImageData(0, 0, sprite.width, sprite.height).data;
  let left = sprite.width, top = sprite.height, right = -1, bottom = -1;
  for (let y = 0; y < sprite.height; y++) for (let x = 0; x < sprite.width; x++) {
    if (data[(y * sprite.width + x) * 4 + 3] === 0) continue;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) return { x: 0, y: 0, w: 1, h: 1, trimmed: true };
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1, trimmed: left > 0 || top > 0 || right < sprite.width - 1 || bottom < sprite.height - 1 };
}

async function regenerate() {
  const generation = ++state.generation;
  if (!state.sprites.length) return showEmpty();
  await new Promise(resolve => requestAnimationFrame(resolve));
  try {
    const padding = Math.max(0, Math.min(32, Number(elements.padding.value) || 0));
    const items = state.sprites.map(sprite => {
      const trim = getTrim(sprite);
      return { id: sprite.id, w: trim.w + padding * 2, h: trim.h + padding * 2, sprite, trim };
    });
    const result = pack(items, { maxSize: Number(elements.maxSize.value), powerOfTwo: elements.powerOfTwo.checked });
    if (generation !== state.generation) return;
    const frames = result.frames.map(frame => ({
      ...frame, path: frame.sprite.path, contentX: frame.x + padding, contentY: frame.y + padding,
      sw: frame.trim.w, sh: frame.trim.h, trimX: frame.trim.x, trimY: frame.trim.y,
      sourceW: frame.sprite.width, sourceH: frame.sprite.height, trimmed: frame.trim.trimmed
    }));
    state.atlas = { ...result, frames, padding };
    drawAtlas();
  } catch (error) {
    state.atlas = null;
    showEmpty(error.message);
    toast(error.message, true);
  }
}

function drawAtlas() {
  const { canvas } = elements;
  const atlas = state.atlas;
  canvas.width = atlas.width; canvas.height = atlas.height;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  for (const frame of atlas.frames) {
    context.drawImage(frame.sprite.image, frame.trimX, frame.trimY, frame.sw, frame.sh, frame.contentX, frame.contentY, frame.sw, frame.sh);
  }
  elements.guidesCanvas.width = atlas.width;
  elements.guidesCanvas.height = atlas.height;
  drawGuides();
  elements.empty.hidden = true; elements.surface.hidden = false;
  elements.viewport.classList.add('pannable');
  elements.dimensions.textContent = `${atlas.width} × ${atlas.height} · ${atlas.frames.length} frames`;
  elements.downloadPng.disabled = false; elements.downloadData.disabled = false;
  fitView();
}

function drawGuides() {
  const canvas = elements.guidesCanvas;
  canvas.hidden = !elements.showGuides.checked || !state.atlas;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (canvas.hidden) return;
  const lineWidth = 1.5 / state.zoom;
  context.save();
  context.lineWidth = lineWidth;
  context.strokeStyle = '#c5f36a';
  context.fillStyle = 'rgba(197, 243, 106, .09)';
  context.shadowColor = '#8fff00';
  context.shadowBlur = 4 / state.zoom;
  for (const frame of state.atlas.frames) {
    const inset = lineWidth / 2;
    context.fillRect(frame.contentX, frame.contentY, frame.sw, frame.sh);
    context.strokeRect(frame.contentX + inset, frame.contentY + inset, Math.max(0, frame.sw - lineWidth), Math.max(0, frame.sh - lineWidth));
  }
  context.restore();
}

function showEmpty(message = '') {
  elements.surface.hidden = true; elements.empty.hidden = false;
  elements.viewport.classList.remove('pannable', 'panning');
  elements.empty.querySelector('h2').textContent = message || 'Атлас пока пуст';
  elements.empty.querySelector('p').innerHTML = message ? 'Измените размер или настройки упаковки.' : 'Добавьте спрайты слева — предпросмотр<br />обновится автоматически.';
  elements.dimensions.textContent = '— × —';
  elements.downloadPng.disabled = true; elements.downloadData.disabled = true;
}

function removeSprite(id) {
  const index = state.sprites.findIndex(sprite => sprite.id === id);
  if (index < 0) return;
  const [sprite] = state.sprites.splice(index, 1); URL.revokeObjectURL(sprite.url); sprite.image.close?.();
  renderFileList(); regenerate();
}

function clearFiles() {
  state.sprites.forEach(sprite => { URL.revokeObjectURL(sprite.url); sprite.image.close?.(); });
  state.sprites = []; state.atlas = null; renderFileList(); showEmpty();
}

async function entriesFromDrop(dataTransfer) {
  const itemEntries = [...dataTransfer.items].map(item => item.webkitGetAsEntry?.()).filter(Boolean);
  if (!itemEntries.length) return [...dataTransfer.files].map(file => ({ file, path: file.name }));
  const results = [];
  async function walk(entry, parent = '') {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      results.push({ file, path: `${parent}${file.name}` });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of batch) await walk(child, `${parent}${entry.name}/`);
      } while (batch.length);
    }
  }
  for (const entry of itemEntries) await walk(entry);
  return results;
}

function layoutCanvas({ preserveCenter = true } = {}) {
  if (!state.atlas) return;
  const viewport = elements.viewport;
  const oldWidth = Number(elements.surface.dataset.contentWidth) || state.atlas.width * state.zoom;
  const oldHeight = Number(elements.surface.dataset.contentHeight) || state.atlas.height * state.zoom;
  const oldLeft = Number.parseFloat(elements.canvas.style.left) || viewport.clientWidth / 2;
  const oldTop = Number.parseFloat(elements.canvas.style.top) || viewport.clientHeight / 2;
  const centerX = oldWidth ? (viewport.scrollLeft + viewport.clientWidth / 2 - oldLeft) / oldWidth : .5;
  const centerY = oldHeight ? (viewport.scrollTop + viewport.clientHeight / 2 - oldTop) / oldHeight : .5;
  const contentWidth = state.atlas.width * state.zoom;
  const contentHeight = state.atlas.height * state.zoom;
  // A viewport-sized margin on every axis turns the preview into a free canvas:
  // even a small/fitted atlas can be dragged vertically and horizontally.
  const surfaceWidth = contentWidth + viewport.clientWidth;
  const surfaceHeight = contentHeight + viewport.clientHeight;
  const left = viewport.clientWidth / 2;
  const top = viewport.clientHeight / 2;
  elements.surface.style.width = `${surfaceWidth}px`;
  elements.surface.style.height = `${surfaceHeight}px`;
  elements.surface.dataset.contentWidth = contentWidth;
  elements.surface.dataset.contentHeight = contentHeight;
  elements.canvas.style.left = `${left}px`;
  elements.canvas.style.top = `${top}px`;
  elements.canvas.style.transform = `scale(${state.zoom})`;
  elements.guidesCanvas.style.left = `${left}px`;
  elements.guidesCanvas.style.top = `${top}px`;
  elements.guidesCanvas.style.transform = `scale(${state.zoom})`;
  if (preserveCenter) {
    viewport.scrollLeft = left + centerX * contentWidth - viewport.clientWidth / 2;
    viewport.scrollTop = top + centerY * contentHeight - viewport.clientHeight / 2;
  } else {
    viewport.scrollLeft = Math.max(0, left + contentWidth / 2 - viewport.clientWidth / 2);
    viewport.scrollTop = Math.max(0, top + contentHeight / 2 - viewport.clientHeight / 2);
  }
}

function setZoom(value, preserveCenter = true) {
  state.zoom = Math.max(.01, Math.min(16, value));
  elements.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  layoutCanvas({ preserveCenter });
  drawGuides();
}

function fitView() {
  if (!state.atlas) return;
  const scale = Math.min((elements.viewport.clientWidth - 70) / state.atlas.width, (elements.viewport.clientHeight - 70) / state.atlas.height, 1);
  setZoom(scale, false);
}

function startPan(event) {
  if (!state.atlas || event.button !== 0 || event.target.closest('button')) return;
  const viewport = elements.viewport;
  const origin = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  viewport.classList.add('panning');
  viewport.setPointerCapture(event.pointerId);
  const move = moveEvent => {
    viewport.scrollLeft = origin.left - (moveEvent.clientX - origin.x);
    viewport.scrollTop = origin.top - (moveEvent.clientY - origin.y);
  };
  const stop = () => {
    viewport.classList.remove('panning');
    viewport.removeEventListener('pointermove', move);
    viewport.removeEventListener('pointerup', stop);
    viewport.removeEventListener('pointercancel', stop);
  };
  viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', stop);
  viewport.addEventListener('pointercancel', stop);
}

function isTauri() {
  return Boolean(window.__TAURI_INTERNALS__);
}

async function download(blob, filename) {
  if (isTauri()) {
    try {
      const extension = filename.split('.').pop();
      const filePath = await showSaveDialog({
        defaultPath: filename,
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
      });
      if (!filePath) return;
      await writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
      toast(`Сохранено: ${filename}`);
    } catch (error) {
      toast(`Не удалось сохранить файл: ${error}`, true);
    }
    return;
  }
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadPng() {
  const blob = await new Promise(resolve => elements.canvas.toBlob(resolve, 'image/png'));
  await download(blob, 'atlas.png');
}

async function downloadData() {
  if (!state.atlas) return;
  const format = elements.exportFormat.value;
  const exporters = {
    pixi: [() => pixiJSON(state.atlas, 'atlas.png'), 'atlas.json', 'application/json'],
    generic: [() => genericJSON(state.atlas, 'atlas.png'), 'atlas.json', 'application/json'],
    godot: [() => godotTRES(state.atlas, 'atlas.png'), 'atlas.tres', 'text/plain']
  };
  const [create, filename, type] = exporters[format];
  await download(new Blob([create()], { type }), filename);
}

elements.pickFiles.onclick = event => { event.stopPropagation(); elements.fileInput.click(); };
elements.pickFolder.onclick = event => { event.stopPropagation(); elements.folderInput.click(); };
elements.dropzone.onclick = event => { if (event.target === elements.dropzone || event.target.closest('.drop-icon, strong, small')) elements.fileInput.click(); };
elements.dropzone.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') elements.fileInput.click(); };
elements.fileInput.onchange = () => { addFiles([...elements.fileInput.files].map(file => ({ file, path: file.name }))); elements.fileInput.value = ''; };
elements.folderInput.onchange = () => { addFiles([...elements.folderInput.files].map(file => ({ file, path: file.webkitRelativePath || file.name }))); elements.folderInput.value = ''; };
for (const eventName of ['dragenter', 'dragover']) elements.dropzone.addEventListener(eventName, event => { event.preventDefault(); elements.dropzone.classList.add('dragover'); });
for (const eventName of ['dragleave', 'drop']) elements.dropzone.addEventListener(eventName, event => { event.preventDefault(); elements.dropzone.classList.remove('dragover'); });
elements.dropzone.addEventListener('drop', async event => addFiles(await entriesFromDrop(event.dataTransfer)));
elements.clearFiles.onclick = clearFiles;
for (const control of [elements.padding, elements.maxSize, elements.powerOfTwo, elements.trim]) control.addEventListener('change', regenerate);
elements.padding.addEventListener('input', regenerate);
$('#zoomOut').onclick = () => setZoom(state.zoom / 1.25);
$('#zoomIn').onclick = () => setZoom(state.zoom * 1.25);
$('#fitView').onclick = fitView;
elements.downloadPng.onclick = downloadPng;
elements.downloadData.onclick = downloadData;
elements.showGuides.addEventListener('change', () => {
  elements.showGuides.closest('.guides-toggle').classList.toggle('active', elements.showGuides.checked);
  drawGuides();
});
elements.viewport.addEventListener('pointerdown', startPan);
elements.viewport.addEventListener('wheel', event => {
  if (!state.atlas || !event.ctrlKey) return;
  event.preventDefault();
  setZoom(state.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
}, { passive: false });
window.addEventListener('resize', () => layoutCanvas());
