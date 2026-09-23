import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBoard } from '../src/core/board-config.ts';
import { boardSvg } from '../src/core/board-svg.ts';
import { resolveBoard } from '../src/core/sensing.ts';

test('board SVG uses resolved millimetre geometry and contains no chassis overlay',()=>{
  const design=parseBoard(readFileSync(new URL('../configs/boards/board_4_3_elle.yaml',import.meta.url),'utf8'));
  const svg=boardSvg(resolveBoard(design,{lineWidthMm:14,turnRadiusMm:20}));
  assert.match(svg,/width="960mm" height="720mm" viewBox="0 0 960 720"/);
  assert.match(svg,/stroke-width="14"/);assert.match(svg,/A 20 20/);assert.match(svg,/class="column-center"/);
  assert.doesNotMatch(svg,/chassis|sensor/i);
});
