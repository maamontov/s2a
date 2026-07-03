import assert from 'node:assert/strict';

const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const appUrl = process.env.APP_URL || 'http://127.0.0.1:5173';
const files = process.argv.slice(2);
if (!files.length) throw new Error('Pass at least one PNG file to the browser smoke test');

const pages = await fetch(`${endpoint}/json/list`).then(response => response.json());
const page = pages.find(item => item.type === 'page' && item.url.startsWith(appUrl));
if (!page) throw new Error('s2a page was not found in Chrome');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id); pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
};
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const commandId = ++id; pending.set(commandId, { resolve, reject });
    socket.send(JSON.stringify({ id: commandId, method, params }));
  });
}

await command('Page.enable');
await command('Page.reload', { ignoreCache: true });
await new Promise(resolve => setTimeout(resolve, 400));
const { root } = await command('DOM.getDocument');
const { nodeId } = await command('DOM.querySelector', { nodeId: root.nodeId, selector: '#fileInput' });
await command('DOM.setFileInputFiles', { nodeId, files });
await command('Runtime.evaluate', { expression: `document.querySelector('#fileInput').dispatchEvent(new Event('change', { bubbles: true }))` });

let result;
for (let attempt = 0; attempt < 30; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 100));
  const evaluation = await command('Runtime.evaluate', {
    returnByValue: true,
    expression: `({ count: Number(document.querySelector('#spriteCount').textContent), canvasVisible: !document.querySelector('#canvasSurface').hidden, dimensions: document.querySelector('#atlasDimensions').textContent })`
  });
  result = evaluation.result.value;
  if (result.count === files.length && result.canvasVisible) break;
}

assert.equal(result.count, files.length);
assert.equal(result.canvasVisible, true);
assert.match(result.dimensions, /\d+ × \d+ · \d+ frames/);

const guides = (await command('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => { const atlas = document.querySelector('#atlasCanvas'); const overlay = document.querySelector('#guidesCanvas'); const before = atlas.toDataURL(); document.querySelector('#showGuides').click(); return { visible: !overlay.hidden, sameWidth: overlay.width === atlas.width, sameHeight: overlay.height === atlas.height, exportUnchanged: before === atlas.toDataURL() }; })()`
})).result.value;
assert.equal(guides.visible, true, 'Frame guides should become visible');
assert.equal(guides.sameWidth && guides.sameHeight, true, 'Frame guides should match atlas dimensions');
assert.equal(guides.exportUnchanged, true, 'Frame guides must not modify the exported canvas');

const zoomBefore = (await command('Runtime.evaluate', { returnByValue: true, expression: `document.querySelector('#zoomValue').textContent` })).result.value;
await command('Runtime.evaluate', { expression: `document.querySelector('#zoomIn').click()` });
const zoomAfterIn = (await command('Runtime.evaluate', { returnByValue: true, expression: `document.querySelector('#zoomValue').textContent` })).result.value;
await command('Runtime.evaluate', { expression: `document.querySelector('#zoomOut').click()` });
const zoomAfterOut = (await command('Runtime.evaluate', { returnByValue: true, expression: `document.querySelector('#zoomValue').textContent` })).result.value;
assert.ok(Number.parseInt(zoomAfterIn) > Number.parseInt(zoomBefore), 'Zoom in should increase scale');
assert.ok(Number.parseInt(zoomAfterOut) < Number.parseInt(zoomAfterIn), 'Zoom out should decrease scale');
await command('Runtime.evaluate', { expression: `document.querySelector('#zoomIn').click(); document.querySelector('#zoomIn').click(); document.querySelector('#zoomIn').click()` });
const geometry = (await command('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => { const el = document.querySelector('#canvasViewport'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, beforeX: el.scrollLeft, beforeY: el.scrollTop, scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight, clientWidth: el.clientWidth, clientHeight: el.clientHeight }; })()`
})).result.value;
assert.ok(geometry.scrollWidth > geometry.clientWidth, 'Zoomed atlas should be horizontally scrollable');
assert.ok(geometry.scrollHeight > geometry.clientHeight, 'Atlas should be vertically scrollable');
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: geometry.x, y: geometry.y, button: 'left', buttons: 1, clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geometry.x - 100, y: geometry.y - 100, button: 'left', buttons: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: geometry.x - 100, y: geometry.y - 100, button: 'left', buttons: 0, clickCount: 1 });
const afterPan = (await command('Runtime.evaluate', { returnByValue: true, expression: `({ x: document.querySelector('#canvasViewport').scrollLeft, y: document.querySelector('#canvasViewport').scrollTop })` })).result.value;
assert.ok(afterPan.x > geometry.beforeX, 'Dragging should pan the atlas horizontally');
assert.ok(afterPan.y > geometry.beforeY, 'Dragging should pan the atlas vertically');

socket.close();
console.log(`Browser smoke test passed: ${result.dimensions}; zoom ${zoomBefore} → ${zoomAfterIn} → ${zoomAfterOut}; pan x/y ${geometry.beforeX}/${geometry.beforeY} → ${afterPan.x}/${afterPan.y}`);
