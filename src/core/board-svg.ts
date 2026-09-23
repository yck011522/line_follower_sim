import type { Board } from './board-config';
import { boardPrimitives, columnCenters } from './board';

function clean(value:number):string{return Number(value.toFixed(6)).toString();}
function escapeXml(value:string):string{return value.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' }[c]!));}

/** Export the resolved physical board in millimetres, without any robot overlay. */
export function boardSvg(board:Board):string{
  const width=board.tiles[0].length*board.grid_size_mm,height=board.tiles.length*board.grid_size_mm,grid=board.grid_size_mm;
  const gridLines:string[]=[];
  for(let x=grid;x<width;x+=grid)gridLines.push(`<path d="M ${clean(x)} 0 V ${clean(height)}"/>`);
  for(let y=grid;y<height;y+=grid)gridLines.push(`<path d="M 0 ${clean(y)} H ${clean(width)}"/>`);
  const routes=boardPrimitives(board).map(p=>{
    if(p.kind==='line')return`<path d="M ${clean(p.from[0])} ${clean(p.from[1])} L ${clean(p.to[0])} ${clean(p.to[1])}"/>`;
    const a=p.start_angle_rad,b=a+p.sweep_angle_rad,x1=p.center[0]+p.radius_mm*Math.cos(a),y1=p.center[1]+p.radius_mm*Math.sin(a),x2=p.center[0]+p.radius_mm*Math.cos(b),y2=p.center[1]+p.radius_mm*Math.sin(b);
    return`<path d="M ${clean(x1)} ${clean(y1)} A ${clean(p.radius_mm)} ${clean(p.radius_mm)} 0 ${Math.abs(p.sweep_angle_rad)>Math.PI?1:0} ${p.sweep_angle_rad>0?1:0} ${clean(x2)} ${clean(y2)}"/>`;
  }).join('');
  const columns=columnCenters(board).map(c=>`<g><circle cx="${clean(c.center[0])}" cy="${clean(c.center[1])}" r="${clean(board.columns.display_diameter_mm/2)}"/><circle class="column-center" cx="${clean(c.center[0])}" cy="${clean(c.center[1])}" r="1.6"/></g>`).join('');
  return`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${clean(width)}mm" height="${clean(height)}mm" viewBox="0 0 ${clean(width)} ${clean(height)}" role="img" aria-label="${escapeXml(board.name)} game board">\n<title>${escapeXml(board.name)} game board</title>\n<rect width="${clean(width)}" height="${clean(height)}" fill="#fff" stroke="#8fa49b" stroke-width="1"/>\n<g transform="translate(0 ${clean(height)}) scale(1 -1)">\n<g fill="none" stroke="#dfe7e2" stroke-width="1">${gridLines.join('')}</g>\n<g fill="none" stroke="#17201d" stroke-width="${clean(board.line.default_width_mm)}" stroke-linecap="round" stroke-linejoin="round">${routes}</g>\n<g fill="#f2f5f4" stroke="#8fa49b" stroke-width="1">${columns}</g>\n</g>\n<style>.column-center{fill:#536f63;stroke:none}</style>\n</svg>\n`;
}
