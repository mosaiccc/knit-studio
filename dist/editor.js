import {drawLine,floodFill} from './core/pattern.js';
import {paintStitchLine,drawStitchSymbol} from './core/stitches.js';
import {brushBounds,MAX_BRUSH_SIZE} from './core/brush.js';

function stitchContrast(color){
  const channels=[1,3,5].map(start=>parseInt(color.slice(start,start+2),16)/255);
  const luminance=channels.reduce((sum,value,index)=>sum+[.2126,.7152,.0722][index]*(value<=.04045?value/12.92:((value+.055)/1.055)**2.4),0);
  return luminance>.179?'#343c36':'#ffffff';
}

function mirroredBrushBounds(point,size,width,height,mirror,mirrorVertical){
  const bounds=brushBounds(point.x,point.y,size),rectangles=[bounds];
  if(mirror)rectangles.push({...bounds,x:width-bounds.x-bounds.width});
  if(mirrorVertical)for(const rectangle of rectangles.slice())rectangles.push({...rectangle,y:height-rectangle.y-rectangle.height});
  return rectangles.filter((rectangle,index)=>rectangles.findIndex(other=>other.x===rectangle.x&&other.y===rectangle.y)===index);
}

export class GridEditor{
  constructor(canvas,options){
    this.canvas=canvas;this.options=options;this.zoom=1;this.margin=32;this.stroke=false;this.positioning=false;this.stitching=false;this.stitchId=null;this.destroyed=false;this.pointerId=null;this.strokeOptions=null;this.hoverPoint=null;
    this.originalTabIndex=canvas.getAttribute?.('tabindex')??null;
    if(!options.readOnly&&this.originalTabIndex===null)canvas.setAttribute?.('tabindex','0');
    const finishWithoutPoint=e=>{if(e.pointerId===this.pointerId){this.up();this.leave();}};
    this.handlers={pointerdown:e=>this.down(e),pointermove:e=>this.move(e),pointerup:e=>this.up(e),pointercancel:finishWithoutPoint,lostpointercapture:finishWithoutPoint,pointerleave:()=>this.leave()};
    for(const [type,handler] of Object.entries(this.handlers))this.canvas.addEventListener(type,handler);
    this.observer=new ResizeObserver(()=>this.render());this.observer.observe(canvas.parentElement);
    this.render();
  }
  destroy(){
    if(this.destroyed)return;
    this.destroyed=true;
    for(const [type,handler] of Object.entries(this.handlers))this.canvas.removeEventListener(type,handler);
    this.observer.disconnect();
    if(!this.options.readOnly){if(this.originalTabIndex===null)this.canvas.removeAttribute?.('tabindex');else this.canvas.setAttribute?.('tabindex',this.originalTabIndex);}
    const before=this.before,wasStroke=this.stroke,wasPositioning=this.positioning,wasStitching=this.stitching,pointerId=this.pointerId;
    this.stroke=false;this.positioning=false;this.stitching=false;this.stitchId=null;this.before=null;this.last=null;this.pointerId=null;this.strokeOptions=null;this.hoverPoint=null;
    this.releaseCapture(pointerId);
    if(wasPositioning)this.options.onPositionCancel?.();
    else if(wasStroke){if(wasStitching)this.options.onStitchesDraw?.(before);else this.options.onDraw(before);this.options.onCancel?.();}
  }
  releaseCapture(pointerId){try{if(pointerId!==null&&this.canvas.hasPointerCapture?.(pointerId))this.canvas.releasePointerCapture(pointerId);}catch{}}
  finishStroke(){this.up();}
  setZoom(zoom){this.zoom=Math.max(.4,Math.min(4,zoom));this.render();return this.zoom;}
  cellAt(e){let r=this.canvas.getBoundingClientRect();return {x:Math.floor((e.clientX-r.left-this.margin)/this.cellW),y:Math.floor((e.clientY-r.top-this.margin)/this.cellH)};}
  withinGrid(p){const grid=this.options.getGrid();return p.x>=0&&p.y>=0&&p.y<grid.length&&p.x<grid[0].length;}
  valid(p){return this.withinGrid(p)&&this.options.getGrid()[p.y][p.x]!==null;}
  brushSize(){const size=this.options.getBrushSize?.()??1;return Number.isInteger(size)&&size>=1&&size<=MAX_BRUSH_SIZE?size:1;}
  paintable(p,tool=this.strokeOptions?.tool||this.options.getTool()){
    if(this.valid(p))return true;
    if(!this.withinGrid(p)||!['pen','eraser','stitch','stitch-erase','fill'].includes(tool))return false;
    const size=['pen','eraser'].includes(tool)?this.strokeOptions?.size??this.brushSize():1;
    const grid=this.options.getGrid(),w=grid[0].length,h=grid.length;
    const mirror=this.strokeOptions?.mirror??this.options.getMirror?.()??false,mirrorVertical=this.strokeOptions?.mirrorVertical??this.options.getMirrorVertical?.()??false;
    const rectangles=mirroredBrushBounds(p,size,w,h,mirror,mirrorVertical);
    for(const b of rectangles)for(let y=Math.max(0,b.y);y<Math.min(h,b.y+b.height);y++)for(let x=Math.max(0,b.x);x<Math.min(w,b.x+b.width);x++)if(grid[y][x]!==null)return true;
    return false;
  }
  setHover(p){const next=!this.options.readOnly&&['pen','eraser'].includes(this.strokeOptions?.tool||this.options.getTool())?p:null;const changed=this.hoverPoint?.x!==next?.x||this.hoverPoint?.y!==next?.y;this.hoverPoint=next;return changed;}
  leave(){if(this.destroyed)return;this.options.onHover?.(null);if(this.setHover(null))this.render();}
  down(e){if(this.destroyed||this.stroke||e.button!==0||e.isPrimary===false||this.options.readOnly)return;const p=this.cellAt(e),tool=this.options.getTool();if(!(tool==='position'?this.withinGrid(p):this.paintable(p,tool)))return;e.preventDefault();this.canvas.focus?.({preventScroll:true});if(this.destroyed)return;const grid=this.options.getGrid();
    if(tool==='position'){
      this.stroke=true;this.positioning=true;this.last=p;this.pointerId=e.pointerId;
      try{this.canvas.setPointerCapture(e.pointerId);}catch{}
      this.options.onPositionStart?.(p);
      if(!this.destroyed)this.render();
      return;
    }
    if(tool==='dropper'){this.options.onPick(grid[p.y][p.x]);return;}
    this.strokeOptions={tool,mirror:this.options.getMirror?.()||false,mirrorVertical:this.options.getMirrorVertical?.()||false,size:['pen','eraser'].includes(tool)?this.brushSize():1,color:tool==='eraser'?this.options.getBackground():this.options.getColor()};
    this.setHover(['pen','eraser'].includes(tool)?p:null);
    this.stitching=tool==='stitch'||tool==='stitch-erase';
    this.stitchId=tool==='stitch-erase'?null:(this.options.getStitch?.()||'knit');
    this.before=this.stitching?{...(this.options.getStitches?.()||{})}:grid.map(row=>row.slice());this.options.onStart?.();this.stroke=true;this.last=p;this.pointerId=e.pointerId;
    try{this.canvas.setPointerCapture(e.pointerId);}catch{}
    if(tool==='fill'){
      const {color,mirror,mirrorVertical}=this.strokeOptions;
      const seeds=mirroredBrushBounds(p,1,grid[0].length,grid.length,mirror,mirrorVertical),next=grid.map(row=>row.slice());
      for(const seed of seeds){
        if(grid[seed.y][seed.x]===null)continue;
        const filled=(this.options.fillRegion||floodFill)(grid,seed.x,seed.y,color);
        for(let y=0;y<grid.length;y++)for(let x=0;x<grid[0].length;x++)if(filled[y][x]!==grid[y][x])next[y][x]=filled[y][x];
      }
      this.options.onDraw(next);this.render();this.up();return;
    }
    this.paint(p,p);
  }
  paint(a,b){
    if(this.destroyed)return;
    if(this.stitching){const next=paintStitchLine(this.options.getGrid(),this.options.getStitches?.()||{},a.x,a.y,b.x,b.y,this.stitchId,this.strokeOptions?.mirror??false,this.strokeOptions?.mirrorVertical??false);this.options.onStitchesDraw?.(next);}
    else{const {color,mirror,mirrorVertical,size}=this.strokeOptions;const next=(this.options.paintLine||drawLine)(this.options.getGrid(),a.x,a.y,b.x,b.y,color,mirror,size,mirrorVertical);this.options.onDraw(next);}
    this.render();
  }
  movePosition(p){
    if(p.x===this.last.x&&p.y===this.last.y)return;
    this.last=p;this.options.onPositionMove?.(p);
    if(!this.destroyed)this.render();
  }
  move(e){if(this.destroyed||(this.stroke&&e.pointerId!==this.pointerId))return;const p=this.cellAt(e),positionMode=this.positioning||(!this.stroke&&this.options.getTool()==='position'),valid=positionMode?this.withinGrid(p):this.paintable(p);this.options.onHover?.(valid?p:null);const hoverChanged=this.setHover(valid?p:null);if(this.stroke&&valid){if(this.positioning)this.movePosition(p);else if(p.x!==this.last.x||p.y!==this.last.y){this.paint(this.last,p);this.last=p;}else if(hoverChanged)this.render();}else if(hoverChanged)this.render();}
  up(e){
    if(this.destroyed||!this.stroke||(e&&e.pointerId!==this.pointerId))return;
    let hoverChanged=false,painted=false;
    if(e){const p=this.cellAt(e),valid=this.paintable(p);hoverChanged=this.setHover(valid?p:null);if(this.positioning){if(this.withinGrid(p))this.movePosition(p);}else if(valid&&(p.x!==this.last.x||p.y!==this.last.y)){this.paint(this.last,p);painted=true;}}
    if(this.destroyed||!this.stroke)return;
    const before=this.before,wasPositioning=this.positioning,pointerId=this.pointerId;
    this.stroke=false;this.positioning=false;this.stitching=false;this.stitchId=null;this.before=null;this.last=null;this.pointerId=null;this.strokeOptions=null;
    this.releaseCapture(pointerId);
    if(wasPositioning)this.options.onPositionCommit?.();
    else this.options.onCommit(before);
    if(hoverChanged&&!painted)this.render();
  }
  drawBrushPreview(ctx,w,h){
    const tool=this.strokeOptions?.tool||this.options.getTool();
    if(this.options.readOnly||!this.hoverPoint||!['pen','eraser'].includes(tool))return;
    const size=this.strokeOptions?.size??this.brushSize(),mirror=this.strokeOptions?.mirror??this.options.getMirror?.()??false,mirrorVertical=this.strokeOptions?.mirrorVertical??this.options.getMirrorVertical?.()??false;
    const rectangles=mirroredBrushBounds(this.hoverPoint,size,w,h,mirror,mirrorVertical);
    for(const b of rectangles){
      const left=Math.max(0,b.x),top=Math.max(0,b.y),right=Math.min(w,b.x+b.width),bottom=Math.min(h,b.y+b.height);
      if(right<=left||bottom<=top)continue;
      const args=[this.margin+left*this.cellW,this.margin+top*this.cellH,(right-left)*this.cellW,(bottom-top)*this.cellH];
      ctx.setLineDash?.([]);ctx.strokeStyle='#fffefa';ctx.lineWidth=3;ctx.strokeRect(...args);
      ctx.setLineDash?.([4,3]);ctx.strokeStyle=tool==='eraser'?'#a65166':'#3f5e4a';ctx.lineWidth=1.3;ctx.strokeRect(...args);
    }
    ctx.setLineDash?.([]);
  }
  render(){
    if(this.destroyed)return;const grid=this.options.getGrid();if(!grid?.length)return;const h=grid.length,w=grid[0].length,parent=this.canvas.parentElement;
    const ratio=this.options.getAspect?.()||1;const base=Math.max(2,Math.min(19,(parent.clientWidth-94)/w,(parent.clientHeight-84)/(h*ratio)));
    this.cellW=base*this.zoom;this.cellH=this.cellW*ratio;
    const cw=Math.ceil(w*this.cellW+this.margin*2),ch=Math.ceil(h*this.cellH+this.margin*2),dpr=window.devicePixelRatio||1;
    if(this.canvas.width!==Math.ceil(cw*dpr))this.canvas.width=Math.ceil(cw*dpr);if(this.canvas.height!==Math.ceil(ch*dpr))this.canvas.height=Math.ceil(ch*dpr);if(this.canvas.style.width!==cw+'px')this.canvas.style.width=cw+'px';if(this.canvas.style.height!==ch+'px')this.canvas.style.height=ch+'px';
    const ctx=this.canvas.getContext('2d');if(ctx.setTransform)ctx.setTransform(dpr,0,0,dpr,0,0);else ctx.scale(dpr,dpr);ctx.clearRect?.(0,0,cw,ch);ctx.fillStyle='#fffefa';ctx.fillRect(this.margin,this.margin,w*this.cellW,h*this.cellH);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(grid[y][x]===null)continue;ctx.fillStyle=grid[y][x];ctx.fillRect(this.margin+x*this.cellW,this.margin+y*this.cellH,this.cellW+.2,this.cellH+.2);
      if(this.options.getTexture?.()&&this.cellW>5){const px=this.margin+(x+.5)*this.cellW,py=this.margin+(y+.5)*this.cellH;ctx.strokeStyle='rgba(255,255,255,.32)';ctx.lineWidth=Math.max(.7,this.cellW*.08);ctx.beginPath();ctx.moveTo(px-this.cellW*.29,py-this.cellH*.28);ctx.lineTo(px,py+this.cellH*.25);ctx.lineTo(px+this.cellW*.29,py-this.cellH*.28);ctx.stroke();}
    }
    if(this.options.getShowGrid?.()!==false){for(let x=0;x<=w;x++){ctx.beginPath();ctx.strokeStyle=(w-x)%10===0?'#5d544e55':'#635b4c22';ctx.lineWidth=(w-x)%10===0?.8:.45;ctx.moveTo(this.margin+x*this.cellW,this.margin);ctx.lineTo(this.margin+x*this.cellW,this.margin+h*this.cellH);ctx.stroke();}for(let y=0;y<=h;y++){ctx.beginPath();ctx.strokeStyle=(h-y)%10===0?'#5d544e55':'#635b4c22';ctx.lineWidth=(h-y)%10===0?.8:.45;ctx.moveTo(this.margin,this.margin+y*this.cellH);ctx.lineTo(this.margin+w*this.cellW,this.margin+y*this.cellH);ctx.stroke();}}
    for(const [key,id] of Object.entries(this.options.getStitches?.()||{})){
      const [row,stitch]=key.split(':').map(Number),x=w-stitch,y=h-row;
      if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=w||y<0||y>=h||grid[y][x]===null)continue;
      drawStitchSymbol(ctx,id,this.margin+x*this.cellW,this.margin+y*this.cellH,this.cellW,this.cellH,stitchContrast(grid[y][x]));
    }
    ctx.fillStyle='#918b83';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='10px system-ui';const step=Math.max(5,Math.ceil(24/this.cellW/5)*5);
    for(let x=0;x<w;x++)if((w-x)%step===0||w-x===1)ctx.fillText(w-x,this.margin+(x+.5)*this.cellW,this.margin+h*this.cellH+17);
    for(let y=0;y<h;y++)if((h-y)%step===0||h-y===1)ctx.fillText(h-y,this.margin-16,this.margin+(y+.5)*this.cellH);
    ctx.strokeStyle='#aaa195';ctx.lineWidth=.8;ctx.strokeRect(this.margin,this.margin,w*this.cellW,h*this.cellH);
    const bounds=this.options.getPlacementBounds?.();
    if(bounds&&[bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)&&bounds.width>0&&bounds.height>0){
      ctx.setLineDash?.([6,4]);ctx.strokeStyle='#b96d78';ctx.lineWidth=2;
      ctx.strokeRect(this.margin+bounds.x*this.cellW,this.margin+bounds.y*this.cellH,bounds.width*this.cellW,bounds.height*this.cellH);
      ctx.setLineDash?.([]);
    }
    this.drawBrushPreview(ctx,w,h);
  }
}
