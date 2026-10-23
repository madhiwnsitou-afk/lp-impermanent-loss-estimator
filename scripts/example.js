import {readFile} from 'node:fs/promises';
import {estimate} from '../src/estimate.js';
console.log(JSON.stringify(await estimate(JSON.parse(await readFile(new URL('../examples/weighted.json',import.meta.url)))) ,null,2));
