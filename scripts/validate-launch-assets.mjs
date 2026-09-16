import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('public/launch');
const assets = ['whylab-thumbnail.svg', 'gallery-1-input.svg', 'gallery-2-activity.svg', 'gallery-3-evidence.svg', 'gallery-4-repair.svg'];
for (const name of assets) {
  const text = await readFile(resolve(root, name), 'utf8');
  if (!/<svg\b/i.test(text) || !/font-family=/i.test(text)) throw new Error(`Invalid launch asset: ${name}`);
}
const thumbnail = await readFile(resolve(root, 'whylab-thumbnail.svg'), 'utf8');
if (!/width="1270"/.test(thumbnail) || !/height="760"/.test(thumbnail)) throw new Error('Thumbnail must be 1270×760.');
console.log(JSON.stringify({ assets, thumbnail: '1270x760', status: 'valid' }, null, 2));
