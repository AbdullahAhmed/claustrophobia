// Karst — chunk build worker. Receives plain segment lists, returns grids and geometry arrays (transferred).
import { setSeed, buildChunkData } from './field.js';

let edgeTable = null, triTable = null;
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') { setSeed(m.seed); edgeTable = m.edgeTable; triTable = m.triTable; return; }
  if (m.type === 'build') {
    const out = buildChunkData(m.list, m.cx, m.cy, m.cz, edgeTable, triTable);
    const transfer = [];
    for (const k of ['density', 'glow', 'calc', 'wet', 'tint']) if (out[k]) transfer.push(out[k].buffer);
    if (out.rock) transfer.push(out.rock.pos.buffer, out.rock.col.buffer, out.rock.glow.buffer);
    if (out.water) transfer.push(out.water.buffer);
    self.postMessage({ type: 'built', key: m.key, gen: m.gen, ...out }, transfer);
  }
};
