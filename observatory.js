/* The Proof Atlas: dependency-free, canvas-rendered, static snapshot explorer. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const number = n => n.toLocaleString('en-US');
  const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatDate = (s, short = false) => new Intl.DateTimeFormat('en-GB', {timeZone:'UTC', month:'short', day:'2-digit', ...(short ? {} : {hour:'2-digit', minute:'2-digit'})}).format(new Date(s * 1000));
  const duration = s => s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m` : `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m`;
  const colors = {done:'#83d2aa', running:'#f2c477', pending:'#5d8872', blocked:'#ea8d83', submitted:'#90cbe0', held:'#a99bc9', cancelled:'#78877e'};
  const labels = {done:'Integrated', running:'Active', pending:'Pending', blocked:'Blocked', submitted:'Submitted', held:'Held', cancelled:'Cancelled'};
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let data, tasks, groups, deps, users, positions, layerPositions, sessionsByTask;
  let selected = -1, selectionEmphasis = false, groupFocus = -1, statusFilter = 'all', frontierOnly = false;
  let relationFocus = null, layout = 'atlas', replayTime, earliest, replayTimer;
  let view = {scale:1, x:0, y:0}, w = 0, h = 0, dpr = 1, dirty = true;
  let hovered = -1, hoverGroup = -1, dragging = null, mapFrame = null;
  let historyStatuses, visibleSet = new Set(), chartBins = [], chartPeak = 0;
  const canvas = $('proof-map'), ctx = canvas.getContext('2d');
  const stage = $('map-stage');
  const sourceCache = {modules:null, domain:'', query:''};
  const centers = [], radii = [], groupLinks = [];
  const world = {width:1400, height:1020};
  let layoutColumns = 0;
  const shortNames = ['Foundations','Pushing up','Modules','Amalgams','Lie type','Recognition','Catalogue','Uniqueness','Shadows','Components','Main theorem','Even type'];

  function toast(message) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toast.timeout); toast.timeout = setTimeout(() => $('toast').hidden = true, 3500);
  }
  function currentStatus(i) { return replayTime >= data.generated ? tasks[i].status : historyStatuses[i]; }
  function isVisible(i) {
    if (!currentStatus(i)) return false;
    if (groupFocus >= 0 && tasks[i].group !== groupFocus) return false;
    if (frontierOnly && !tasks[i].ready) return false;
    if (relationFocus && !relationFocus.has(i)) return false;
    const s = currentStatus(i);
    return statusFilter === 'all' || (statusFilter === 'other' ? !['done','running','pending','blocked'].includes(s) : s === statusFilter);
  }
  function updateVisible() {
    visibleSet = new Set(tasks.map((_, i) => i).filter(isVisible));
    $('map-count').textContent = `${number(visibleSet.size)} / ${number(tasks.length)} TASKS`;
    document.querySelectorAll('.workstream').forEach(b => b.classList.toggle('selected', Number(b.dataset.group) === groupFocus));
    $('map-caption').textContent = frontierOnly ? 'QUASITHIN / READY FRONTIER' : relationFocus ? 'QUASITHIN / DEPENDENCY TRACE' : layout === 'atlas' ? 'QUASITHIN / WORKSTREAM ATLAS' : `QUASITHIN / ${data.layers} DEPENDENCY LAYERS`;
    invalidate();
  }
  function point(i) { return layout === 'atlas' ? positions[i] : layerPositions[i]; }
  function screen(p) { return [p[0] * view.scale + view.x, p[1] * view.scale + view.y]; }
  function unproject(x, y) { return [(x - view.x) / view.scale, (y - view.y) / view.scale]; }
  function fit(ids = null) {
    let bounds;
    if (ids && ids.length) {
      const boundedIds = layout === 'atlas' && ids.length > 1 && groupFocus >= 0 ? ids.filter(i => i !== data.goal) : ids;
      const pts = (boundedIds.length ? boundedIds : ids).map(point);
      bounds = [Math.min(...pts.map(p=>p[0]))-50, Math.min(...pts.map(p=>p[1]))-70, Math.max(...pts.map(p=>p[0]))+50, Math.max(...pts.map(p=>p[1]))+70];
    } else if (layout === 'atlas') bounds = [0, -5, world.width, world.height];
    else bounds = [-60,-70,1460,1050];
    const scale = Math.min((w-44)/(bounds[2]-bounds[0]),(h-85)/(bounds[3]-bounds[1]));
    view = {scale, x:w/2-(bounds[0]+bounds[2])*scale/2, y:h/2-(bounds[1]+bounds[3])*scale/2+4};
    invalidate();
  }
  function invalidate() {
    dirty = true;
    if (!mapFrame) mapFrame = requestAnimationFrame(draw);
  }
  function resize() {
    const rect = stage.getBoundingClientRect(); w=rect.width; h=rect.height;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
    if (layoutColumns !== (w < 500 ? 3 : 4)) buildLayout();
    fit(groupFocus >= 0 ? tasks.map((t,i)=>t.group===groupFocus?i:-1).filter(i=>i>=0) : null);
    drawActivity();
  }
  function buildLayout() {
    // Organic islands. The order within each island follows creation time;
    // the golden angle keeps thousands of dots legible without a force engine.
    layoutColumns = stage.clientWidth < 500 ? 3 : 4;
    world.width = layoutColumns * 344 + 24;
    world.height = Math.ceil(groups.length / layoutColumns) * 310 + 90;
    centers.length = 0; radii.length = 0; groupLinks.length = 0;
    const byGroup = groups.map(()=>[]);
    tasks.forEach((t,i)=>byGroup[t.group].push(i));
    positions=tasks.map(()=>[0,0]);
    groups.forEach((g,gi)=>{
      const col=gi%layoutColumns, row=Math.floor(gi/layoutColumns), members=byGroup[gi];
      const cx=185+col*344+(row===1 ? 7 : -7), cy=179+row*310;
      centers.push([cx,cy]);
      const radius=58+65*Math.sqrt(members.length/Math.max(...byGroup.map(x=>x.length)));
      radii.push(radius);
      members.forEach((i,j)=>{
        const r=radius*Math.sqrt((j+.5)/members.length), a=j*2.3999632297+gi*.37;
        positions[i]=[cx+Math.cos(a)*r*1.05,cy+Math.sin(a)*r*.91];
      });
    });
    positions[data.goal] = [world.width / 2, world.height - 31];
    const buckets=Array.from({length:data.layers},()=>[]);
    tasks.forEach((t,i)=>buckets[t.rank].push(i));
    const max=Math.max(...buckets.map(x=>x.length));
    layerPositions=tasks.map(()=>[0,0]);
    buckets.forEach((members,rank)=>{
      members.sort((a,b)=>tasks[a].group-tasks[b].group||tasks[a].created-tasks[b].created);
      members.forEach((i,j)=>layerPositions[i]=[35+rank/Math.max(1,data.layers-1)*1330,510+(j-(members.length-1)/2)/max*890]);
    });
    const counts=new Map();
    data.edges.forEach(([a,b])=>{
      const ga=tasks[a].group, gb=tasks[b].group;
      if(ga!==gb){const key=ga<gb?`${ga},${gb}`:`${gb},${ga}`;counts.set(key,(counts.get(key)||0)+1);}
    });
    [...counts].sort((a,b)=>a[1]-b[1]).forEach(([key,count])=>groupLinks.push([...key.split(',').map(Number),count]));
  }
  function line(a,b,color,width=1,arrow=false) {
    const pa=screen(point(a)), pb=screen(point(b));
    if((pa[0]<-30&&pb[0]<-30)||(pa[0]>w+30&&pb[0]>w+30)||(pa[1]<-30&&pb[1]<-30)||(pa[1]>h+30&&pb[1]>h+30)) return;
    ctx.strokeStyle=color; ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...pa);
    if(layout==='layers') {const mid=(pa[0]+pb[0])/2;ctx.bezierCurveTo(mid,pa[1],mid,pb[1],...pb);}
    else {const mid=[(pa[0]+pb[0])/2,(pa[1]+pb[1])/2];const bend=Math.min(30,Math.hypot(pa[0]-pb[0],pa[1]-pb[1])*.1);ctx.quadraticCurveTo(mid[0],mid[1]-bend,...pb);}
    ctx.stroke();
    if(arrow){const ang=Math.atan2(pb[1]-pa[1],pb[0]-pa[0]),r=4;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(pb[0]-Math.cos(ang)*3,pb[1]-Math.sin(ang)*3);ctx.lineTo(pb[0]-Math.cos(ang-.45)*r*2,pb[1]-Math.sin(ang-.45)*r*2);ctx.lineTo(pb[0]-Math.cos(ang+.45)*r*2,pb[1]-Math.sin(ang+.45)*r*2);ctx.fill();}
  }
  function draw() {
    mapFrame=null;if(!data||!dirty)return;dirty=false;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    ctx.fillStyle='#102621';ctx.fillRect(0,0,w,h);
    // A quiet atlas grid anchors the landscape while zooming and panning.
    ctx.fillStyle='#294636';const spacing=Math.max(30,90*view.scale);
    for(let x=((view.x%spacing)+spacing)%spacing;x<w;x+=spacing)for(let y=((view.y%spacing)+spacing)%spacing;y<h;y+=spacing){ctx.fillRect(x,y,1,1);}
    const neighborhood=selected>=0&&selectionEmphasis?new Set([selected,...deps[selected],...users[selected]]):null;
    if(layout==='atlas'){
      groups.forEach((g,gi)=>{
        const c=screen(centers[gi]),r=radii[gi]*view.scale;
        if(c[0]+r<-10||c[0]-r>w+10||c[1]+r<0||c[1]-r>h)return;
        const dim=groupFocus>=0&&groupFocus!==gi;
        ctx.globalAlpha=dim?.16:1;
        const glow=ctx.createRadialGradient(c[0],c[1],r*.05,c[0],c[1],r*1.35);
        glow.addColorStop(0,'#1e42322f');glow.addColorStop(1,'#10262100');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(...c,r*1.35,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=hoverGroup===gi||groupFocus===gi?'#8abb7440':'#8abb741b';ctx.lineWidth=.65;
        for(const rr of[1.06,1.17]){ctx.beginPath();ctx.ellipse(c[0],c[1],r*rr*1.07,r*rr*.95,.03,0,Math.PI*2);ctx.stroke();}
        ctx.globalAlpha=1;
      });
      if(groupFocus<0&&!relationFocus&&!selectionEmphasis){
        groupLinks.forEach(([ga,gb,count])=>{
          const a=screen(centers[ga]),b=screen(centers[gb]);
          ctx.strokeStyle=`rgba(148,180,139,${Math.min(.29,.07+count/1500)})`;ctx.lineWidth=.7+Math.min(1.6,count/400);
          ctx.beginPath();ctx.moveTo(...a);ctx.bezierCurveTo(a[0]+(b[0]-a[0])*.4,a[1]-35,b[0]-(b[0]-a[0])*.4,b[1]+35,...b);ctx.stroke();
        });
      }
    }else{
      ctx.font='8px "IBM Plex Mono",monospace';ctx.fillStyle='#71927b';
      for(let rank=0;rank<data.layers;rank+=10){const x=screen([35+rank/Math.max(1,data.layers-1)*1330,0])[0];ctx.fillText(`L${rank}`,x-8,57);ctx.strokeStyle='#85a98713';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x,68);ctx.lineTo(x,h-60);ctx.stroke();}
      ctx.fillStyle='#74967a';ctx.font='8px "IBM Plex Mono",monospace';ctx.fillText('PREREQUISITES',23,h-52);ctx.textAlign='right';ctx.fillText('FINAL ASSEMBLY →',w-23,h-52);ctx.textAlign='left';
    }
    const detailEdges=relationFocus||groupFocus>=0||layout==='layers'||view.scale>1;
    if(detailEdges){
      data.edges.forEach(([a,b])=>{if(visibleSet.has(a)&&visibleSet.has(b))line(a,b,relationFocus?'#86b88738':'#75a08115',.55);});
    }
    const target=hovered>=0?hovered:selectionEmphasis?selected:-1;
    if(target>=0){deps[target].forEach(a=>line(a,target,'#e5bd6c9e',1.15,true));users[target].forEach(b=>line(target,b,'#a2d5b99e',1.15,true));}
    // Batch paths by status: a few canvas fills handle the whole task registry.
    for(const status of Object.keys(colors)){
      ctx.fillStyle=colors[status];ctx.beginPath();
      tasks.forEach((t,i)=>{
        if(currentStatus(i)!==status||!visibleSet.has(i))return;
        if(neighborhood&&!relationFocus&&!neighborhood.has(i))return;
        const p=screen(point(i));if(p[0]<-8||p[0]>w+8||p[1]<-8||p[1]>h+8)return;
        const r=Math.max(.7,Math.min(3.3,view.scale*(status==='running'?2.75:1.75)));
        ctx.moveTo(p[0]+r,p[1]);ctx.arc(...p,r,0,Math.PI*2);
      });ctx.fill();
    }
    if(neighborhood&&!relationFocus){ctx.fillStyle='#739a7440';ctx.beginPath();tasks.forEach((t,i)=>{if(!visibleSet.has(i)||neighborhood.has(i))return;const p=screen(point(i));const r=Math.max(.65,view.scale*1.3);ctx.moveTo(p[0]+r,p[1]);ctx.arc(...p,r,0,Math.PI*2);});ctx.fill();}
    tasks.forEach((t,i)=>{
      if(!visibleSet.has(i)||currentStatus(i)!=='running')return;
      const p=screen(point(i)),r=Math.max(2,Math.min(6,view.scale*4.5));
      ctx.strokeStyle='#efc98060';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(...p,r,0,Math.PI*2);ctx.stroke();
    });
    if(layout==='atlas'){
      groups.forEach((g,gi)=>{
        const c=screen(centers[gi]),r=radii[gi]*view.scale,dim=(groupFocus>=0&&groupFocus!==gi);
        if(c[0]<-100||c[0]>w+100||c[1]-r>h||c[1]+r<0)return;
        const titleY=c[1]-r*1.14-13;
        ctx.globalAlpha=dim?.25:1;ctx.textAlign='center';
        ctx.font=`${Math.min(13,Math.max(w<500?9:10,view.scale*19))}px "DM Sans",sans-serif`;
        const title=w<500&&view.scale<.7?shortNames[gi]:g.name;
        const tw=ctx.measureText(title).width;ctx.fillStyle='#102621e6';ctx.fillRect(c[0]-tw/2-6,titleY-12,tw+12,29);
        ctx.fillStyle=hoverGroup===gi||groupFocus===gi?'#e3e8c0':'#c1d4b6';ctx.fillText(title,c[0],titleY);
        ctx.font='7px "IBM Plex Mono",monospace';ctx.fillStyle='#779c7c';
        const count=tasks.filter((t,i)=>t.group===gi&&currentStatus(i)).length;
        ctx.fillText(`${number(count)} TASKS`,c[0],titleY+13);ctx.textAlign='left';ctx.globalAlpha=1;
      });
    }
    if(target>=0){const p=screen(point(target));ctx.strokeStyle='#f3df9e';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(...p,Math.max(5,view.scale*4)+2,0,Math.PI*2);ctx.stroke();}
    const goal=screen(point(data.goal));
    if(visibleSet.has(data.goal)&&!selectionEmphasis){ctx.strokeStyle='#ebd59c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(goal[0],goal[1]-5);ctx.lineTo(goal[0]+5,goal[1]);ctx.lineTo(goal[0],goal[1]+5);ctx.lineTo(goal[0]-5,goal[1]);ctx.closePath();ctx.stroke();ctx.fillStyle='#b8c39c';ctx.font='7px "IBM Plex Mono",monospace';ctx.textAlign='center';ctx.fillText('THE CLASSIFICATION GOAL',goal[0],goal[1]+18);ctx.textAlign='left';}
  }

  function pick(x,y) {
    const [wx,wy]=unproject(x,y);let nearest=-1,min=36;
    tasks.forEach((_,i)=>{if(!visibleSet.has(i))return;const p=point(i),dx=(p[0]-wx)*view.scale,dy=(p[1]-wy)*view.scale,d=dx*dx+dy*dy;if(d<min){min=d;nearest=i;}});
    return nearest;
  }
  function pickGroup(x,y) {
    if(layout!=='atlas')return -1;
    for(let gi=0;gi<groups.length;gi++){
      const c=screen(centers[gi]),r=radii[gi]*view.scale,titleY=c[1]-r*1.14-13;
      if(Math.abs(x-c[0])<80&&y>titleY-15&&y<titleY+18)return gi;
    }return -1;
  }
  function zoom(factor,x=w/2,y=h/2) {
    const prev=view.scale;view.scale=Math.min(12,Math.max(.13,view.scale*factor));
    view.x=x-(x-view.x)*view.scale/prev;view.y=y-(y-view.y)*view.scale/prev;invalidate();
  }
  function selectTask(i, move=false) {
    if(i<0||i>=tasks.length)return;
    stopReplay();selected=i;selectionEmphasis=true;relationFocus=null;groupFocus=-1;frontierOnly=false;statusFilter='all';
    document.querySelectorAll('[data-status]').forEach(b=>{b.classList.toggle('selected',b.dataset.status==='all');b.setAttribute('aria-pressed',String(b.dataset.status==='all'));});
    if(replayTime<data.generated)setTime(1000);
    updateVisible();renderInspector();
    history.replaceState(null,'',`#task=${encodeURIComponent(tasks[i].id)}`);
    if(move){fit([i,...deps[i],...users[i]]);$('atlas').scrollIntoView({behavior:reducedMotion?'instant':'smooth'});}
    $('search-results').hidden=true;
  }
  function relationButtons(ids) {
    const button=i=>`<button data-task="${i}"><i class="status-dot ${escape(tasks[i].status)}"></i><span>${escape(tasks[i].title)}</span></button>`;
    if(!ids.length)return '<span class="empty">None in the current task graph.</span>';
    const sorted=[...ids].sort((a,b)=>(tasks[a].status==='done')-(tasks[b].status==='done')||tasks[a].title.localeCompare(tasks[b].title));
    return sorted.slice(0,5).map(button).join('')+(ids.length>5?`<details><summary>Show ${ids.length-5} more</summary>${sorted.slice(5).map(button).join('')}</details>`:'');
  }
  function renderInspector() {
    if(selected<0){
      const g=groupFocus>=0?groups[groupFocus]:null;
      $('inspector').querySelector('.panel-kicker').textContent=g?'MATHEMATICAL WORKSTREAM':'THE WHOLE LANDSCAPE';
      $('inspector-content').innerHTML=g?`<h3>${escape(g.name)}</h3><p>${escape(g.description)}</p><div class="task-metadata"><div><strong>${number(g.size)}</strong><small>tasks</small></div><div><strong>${number(g.counts.done||0)}</strong><small>integrated</small></div><div><strong>${number(g.counts.running||0)}</strong><small>active tasks</small></div></div><p>Choose a task below to follow the mathematics.</p><div class="task-relations"><div><h4>THE ACTIVE FRONTIER</h4>${relationButtons(tasks.map((t,i)=>t.group===groupFocus&&t.status!=='done'?i:-1).filter(i=>i>=0).sort((a,b)=>(tasks[b].status==='running')-(tasks[a].status==='running')).slice(0,14))}</div></div>`:`<h3>One result releases the next.</h3><p>Browse a workstream or select a dot. The map connects ${number(tasks.length)} tasks across ${data.layers} dependency layers.</p><div class="inspector-actions"><button data-action="goal">Start with the final theorem ↗</button></div>`;
      return;
    }
    const t=tasks[selected],unfinished=deps[selected].filter(i=>tasks[i].status!=='done');
    $('inspector').querySelector('.panel-kicker').textContent=selected===data.goal?'THE CAMPAIGN’S FINAL GOAL':groups[t.group].name.toUpperCase();
    $('inspector-content').innerHTML=`<span class="task-badge"><i class="status-dot ${escape(t.status)}"></i>${labels[t.status]}</span><h3>${escape(t.title)}</h3><div class="task-id">${escape(t.id)}</div><div class="task-metadata"><div><strong>${t.rank}</strong><small>dependency layer</small></div><div><strong>${t.attempts}</strong><small>attempts</small></div><div><strong>${unfinished.length}</strong><small>open prerequisites</small></div></div><div class="inspector-actions"><button data-action="prerequisites">Trace prerequisites</button><button data-action="consumers">Trace consumers</button><button data-action="link">Copy task link ↗</button></div><div class="task-relations"><div><h4>PREREQUISITES / ${deps[selected].length}</h4>${relationButtons(deps[selected])}</div><div><h4>CONSUMERS / ${users[selected].length}</h4>${relationButtons(users[selected])}</div></div>`;
  }
  function transitive(i,adjacency) {
    const set=new Set([i]),queue=[i];
    while(queue.length){const next=queue.pop();adjacency[next].forEach(j=>{if(!set.has(j)){set.add(j);queue.push(j);}});}return set;
  }
  function focusGroup(gi) {
    stopReplay();groupFocus=gi;selected=-1;selectionEmphasis=false;relationFocus=null;frontierOnly=false;
    updateVisible();fit([...visibleSet]);renderInspector();
  }
  function renderWorkstreams() {
    $('workstreams').innerHTML=groups.map((g,i)=>{
      const bars=Object.keys(colors).map(s=>`<span style="width:${100*(g.counts[s]||0)/g.size}%;background:${colors[s]}" title="${labels[s]}: ${g.counts[s]||0}"></span>`).join('');
      return `<button class="workstream" data-group="${i}" aria-label="Explore ${escape(g.name)}, ${g.size} tasks"><div class="workstream-top"><strong>${escape(g.name)}</strong><span>${number(g.size)} ↗</span></div><div class="workstream-progress">${bars}</div><div class="workstream-bottom"><span>${number(g.counts.done||0)} integrated</span><span class="active-text">${g.counts.running||0} active tasks</span></div></button>`;
    }).join('');
  }
  function updateReplayStatus() {
    historyStatuses=tasks.map(t=>t.created>replayTime?null:t.accepted&&t.accepted<=replayTime?'done':'pending');
    data.attempts.forEach(([i,start,end])=>{if(start<=replayTime&&(end===null||end>replayTime)&&historyStatuses[i])historyStatuses[i]='running';});
  }
  function setTime(value) {
    replayTime=value>=1000?data.generated:earliest+(data.generated-earliest)*value/1000;
    $('time-slider').value=value;
    $('replay-date').textContent=`${formatDate(replayTime)} UTC`;
    $('replay-title').textContent=value>=1000?'LATEST SNAPSHOT':'REPLAYING AGENT SESSIONS';
    updateReplayStatus();updateVisible();drawActivity();
    if(value>=1000)stopReplay();
  }
  function stopReplay(){if(replayTimer)clearInterval(replayTimer);replayTimer=null;$('play-replay').textContent='▶';$('play-replay').setAttribute('aria-label','Play the session history');}
  function toggleReplay(){
    if(replayTimer){stopReplay();return;}
    selected=-1;selectionEmphasis=false;relationFocus=null;renderInspector();
    if(Number($('time-slider').value)>=1000)setTime(0);
    $('play-replay').textContent='Ⅱ';$('play-replay').setAttribute('aria-label','Pause the session history');
    replayTimer=setInterval(()=>setTime(Math.min(1000,Number($('time-slider').value)+4)),100);
  }

  function prepareActivity() {
    const count=240,span=data.generated-earliest;
    chartBins=Array.from({length:count},(_,i)=>({time:earliest+i*span/count,active:0,integrated:0,starts:0}));
    data.attempts.forEach(([_,start,end,status])=>{
      const from=Math.max(0,Math.floor((start-earliest)/span*count));
      const until=Math.min(count-1,Math.floor(((end||data.generated)-earliest)/span*count));
      // Average concurrency in a bucket, calculated from interval overlap.
      for(let b=from;b<=until;b++){
        const lo=chartBins[b].time,hi=lo+span/count;
        chartBins[b].active+=Math.max(0,Math.min(end||data.generated,hi)-Math.max(start,lo))/(span/count);
      }
      if(from<count)chartBins[from].starts++;
      if(status==='accepted'&&end){const b=Math.min(count-1,Math.floor((end-earliest)/span*count));if(b>=0)chartBins[b].integrated++;}
    });
    chartPeak=Math.max(...chartBins.map(b=>b.active));
  }
  function drawActivity() {
    if(!data||!chartBins.length)return;
    const c=$('activity-canvas'),rect=c.getBoundingClientRect();if(!rect.width)return;
    const ww=rect.width,hh=rect.height,dd=Math.min(devicePixelRatio||1,2);c.width=ww*dd;c.height=hh*dd;
    const cx=c.getContext('2d');cx.scale(dd,dd);
    const left=28,right=8,top=10,bottom=26,cw=ww-left-right,ch=hh-top-bottom;
    const ymax=Math.ceil(Math.max(chartPeak,1)/20)*20;
    cx.font='8px "IBM Plex Mono",monospace';
    for(let n=0;n<=ymax;n+=20){const y=top+ch*(1-n/ymax);cx.strokeStyle='#d9dfcf';cx.lineWidth=.7;cx.setLineDash([2,4]);cx.beginPath();cx.moveTo(left,y);cx.lineTo(ww-right,y);cx.stroke();cx.fillStyle='#89937e';cx.fillText(String(n),0,y+3);}cx.setLineDash([]);
    const gradient=cx.createLinearGradient(0,top,0,top+ch);gradient.addColorStop(0,'#4b7b5066');gradient.addColorStop(1,'#a1b77d12');
    cx.beginPath();cx.moveTo(left,top+ch);chartBins.forEach((b,i)=>cx.lineTo(left+i/(chartBins.length-1)*cw,top+ch*(1-b.active/ymax)));cx.lineTo(left+cw,top+ch);cx.closePath();cx.fillStyle=gradient;cx.fill();
    cx.beginPath();chartBins.forEach((b,i)=>{const x=left+i/(chartBins.length-1)*cw,y=top+ch*(1-b.active/ymax);if(!i)cx.moveTo(x,y);else cx.lineTo(x,y);});cx.strokeStyle='#487346';cx.lineWidth=1.5;cx.stroke();
    // Accepted-result rug: each small mark is a time bucket with integrations.
    chartBins.forEach((b,i)=>{if(!b.integrated)return;cx.fillStyle=`rgba(142,113,48,${Math.min(.85,.2+b.integrated*.05)})`;cx.fillRect(left+i/(chartBins.length-1)*cw,hh-17,Math.max(1,cw/chartBins.length*.7),3);});
    cx.fillStyle='#89937e';cx.textAlign='left';cx.fillText(formatDate(earliest,true),left,hh-1);cx.textAlign='right';cx.fillText(formatDate(data.generated,true),ww-right,hh-1);cx.textAlign='left';
    if(replayTime<data.generated){const x=left+(replayTime-earliest)/(data.generated-earliest)*cw;cx.strokeStyle='#b78743';cx.setLineDash([3,3]);cx.beginPath();cx.moveTo(x,top);cx.lineTo(x,hh-18);cx.stroke();cx.setLineDash([]);}
  }
  function renderSessions(mode='active',limit=9) {
    const active=mode==='active';
    const rows=data.attempts.map((a,i)=>({a,i})).filter(({a})=>active?a[3]==='running':a[3]==='accepted').sort((x,y)=>active?y.a[1]-x.a[1]:y.a[2]-x.a[2]);
    $('session-list-title').textContent=active?'Agents at work':'Results joining the library';
    $('sessions-active').classList.toggle('selected',active);$('sessions-active').setAttribute('aria-pressed',String(active));
    $('sessions-integrated').classList.toggle('selected',!active);$('sessions-integrated').setAttribute('aria-pressed',String(!active));
    $('session-list').innerHTML=rows.slice(0,limit).map(({a,i})=>{
      const [ti,start,end,,ordinal]=a,t=tasks[ti];
      return `<button class="session" data-task="${ti}"><div class="session-indicator ${active?'active':''}"><i class="status-dot ${active?'running':'done'}"></i></div><div class="session-text"><div class="session-name"><span>SESSION ${String(i+1).padStart(5,'0')}</span><time>${active?duration(data.generated-start):formatDate(end)}</time></div><div class="session-title">${escape(t.title)}</div><div class="session-foot">${escape(groups[t.group].name)} · attempt ${ordinal}</div></div></button>`;
    }).join('')+(rows.length>limit?`<button class="session-more" data-session-mode="${mode}" data-session-limit="${limit+18}">Show more ${active?'active sessions':'integrated results'} (${rows.length-limit} remaining) ↓</button>`:'');
    if(!rows.length)$('session-list').innerHTML='<p>No sessions in this state at the snapshot.</p>';
  }

  function renderTreemap() {
    const domains=data.source.domains;
    const cells=domains.slice(0,11).map(d=>({...d}));
    if(domains.length>11){const rest=domains.slice(11);cells.push({name:'Other mathematics',modules:rest.reduce((a,d)=>a+d.modules,0),lines:rest.reduce((a,d)=>a+d.lines,0),other:true});}
    // Balanced strip treemap, sized by actual source-file counts.
    const columns=[],total=cells.reduce((a,d)=>a+d.modules,0);let remaining=cells.slice();
    while(remaining.length){
      const first=remaining.shift(),column=[first];let size=first.modules;
      if(size<total*.24&&remaining.length){column.push(remaining.shift());size+=column[1].modules;}
      if(size<total*.15&&remaining.length){column.push(remaining.shift());size+=column[2].modules;}
      columns.push({cells:column,size});
    }
    const palette=['#244d3c','#376049','#4b7154','#647f53','#657b60','#718b65'];
    $('source-treemap').innerHTML=columns.map((col,ci)=>`<div class="tree-column" style="flex:${col.size}">${col.cells.map(d=>{
      const parts=d.name.split('/'),title=parts.at(-1),root=parts.slice(0,-1).join('/');
      const compact=d.modules/col.size<.18;
      return `<button class="tree-cell ${compact?'compact':''}" data-domain="${escape(d.other?'*':d.name)}" style="flex:${d.modules};background:${palette[ci%palette.length]}" aria-label="Explore ${escape(d.name)}, ${number(d.modules)} source modules"><strong>${root?`<span class="tree-root">${escape(root)}</span>`:''}${escape(title)}</strong><small>${number(d.modules)} modules</small></button>`;
    }).join('')}</div>`).join('');
  }
  async function loadModules() {
    if(!sourceCache.modules){
      const response=await fetch('observatory-modules.json');if(!response.ok)throw new Error('Source inventory could not be loaded.');
      sourceCache.modules=await response.json();
    }return sourceCache.modules;
  }
  async function filterModules(domain=sourceCache.domain,query=sourceCache.query) {
    sourceCache.domain=domain;sourceCache.query=query;
    $('module-list').innerHTML='<p>Reading the source inventory…</p>';
    try{
      const all=await loadModules();if(domain!==sourceCache.domain||query!==sourceCache.query)return;
      const other=new Set(data.source.domains.slice(11).map(d=>d.name));
      const domainFor=p=>p.split('/').length>2?p.split('/').slice(0,2).join('/'):p.split('/')[0].replace(/\.lean$/,'');
      const matches=all.filter(([path])=>(!domain||(domain==='*'?other.has(domainFor(path)):domainFor(path)===domain))&&path.toLowerCase().includes(query.toLowerCase()));
      $('module-heading').textContent=`${domain==='*'?'Other mathematics':domain||'Source modules'} · ${number(matches.length)} matches`;
      $('module-list').innerHTML=matches.slice(0,120).map(([path,lines])=>`<div class="module-row"><span class="module-path">${escape(path)}</span><span class="module-size">${number(lines)} lines</span><button data-copy-path="${escape(path)}" aria-label="Copy ${escape(path)}">Copy ↗</button></div>`).join('')+(matches.length>120?`<p>Showing the first 120 of ${number(matches.length)} modules. Refine the search to find a specific path.</p>`:matches.length?'':'<p>No matching source modules.</p>');
      document.querySelectorAll('[data-domain]').forEach(b=>b.classList.toggle('selected',b.dataset.domain===domain));
    }catch(error){$('module-list').innerHTML=`<p>${escape(error.message)}</p>`;}
  }

  function wireEvents() {
    canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);$('map-tooltip').hidden=true;},{passive:false});
    canvas.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;const r=canvas.getBoundingClientRect();
      dragging={x:e.clientX,y:e.clientY,vx:view.x,vy:view.y,moved:false};canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');$('map-tooltip').hidden=true;
    });
    canvas.addEventListener('pointermove',e=>{
      const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
      if(dragging){const dx=e.clientX-dragging.x,dy=e.clientY-dragging.y;if(Math.abs(dx)+Math.abs(dy)>4)dragging.moved=true;view.x=dragging.vx+dx;view.y=dragging.vy+dy;invalidate();return;}
      const prev=hovered,prevGroup=hoverGroup;hovered=pick(x,y);hoverGroup=hovered<0?pickGroup(x,y):-1;
      canvas.style.cursor=hovered>=0||hoverGroup>=0?'pointer':'grab';
      if(prev!==hovered||prevGroup!==hoverGroup)invalidate();
      const tip=$('map-tooltip');
      if(hovered>=0){const t=tasks[hovered];tip.innerHTML=`${escape(t.title)}<small>${escape(t.id)}<br>${labels[currentStatus(hovered)]} · layer ${t.rank} · ${t.attempts} attempts</small>`;tip.hidden=false;tip.style.left=`${Math.max(8,Math.min(x+14,w-270))}px`;tip.style.top=`${Math.min(y+14,h-tip.offsetHeight-12)}px`;}else tip.hidden=true;
    });
    canvas.addEventListener('pointerup',e=>{
      if(!dragging)return;const moved=dragging.moved;dragging=null;canvas.classList.remove('dragging');
      if(!moved){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,i=pick(x,y),g=pickGroup(x,y);if(i>=0)selectTask(i);else if(g>=0)focusGroup(g);else{selected=-1;selectionEmphasis=false;relationFocus=null;updateVisible();renderInspector();}}
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointercancel',()=>{dragging=null;canvas.classList.remove('dragging');});
    canvas.addEventListener('pointerleave',()=>{hovered=-1;hoverGroup=-1;$('map-tooltip').hidden=true;invalidate();});
    canvas.addEventListener('keydown',e=>{
      if(e.key==='+'||e.key==='='){e.preventDefault();zoom(1.25);}else if(e.key==='-'){e.preventDefault();zoom(.8);}else if(e.key==='0'){fit();}else if(e.key.startsWith('Arrow')){e.preventDefault();view.x+=e.key==='ArrowLeft'?40:e.key==='ArrowRight'?-40:0;view.y+=e.key==='ArrowUp'?40:e.key==='ArrowDown'?-40:0;invalidate();}
    });
    $('zoom-in').onclick=()=>zoom(1.3);$('zoom-out').onclick=()=>zoom(1/1.3);$('fit-map').onclick=()=>fit();
    $('export-map').onclick=()=>{
      canvas.toBlob(blob=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`cfsg-proof-atlas-${new Date(data.generated*1000).toISOString().slice(0,10)}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
    };
    document.querySelectorAll('[data-layout]').forEach(b=>b.onclick=()=>{
      layout=b.dataset.layout;document.querySelectorAll('[data-layout]').forEach(bb=>{bb.classList.toggle('selected',bb===b);bb.setAttribute('aria-pressed',String(bb===b));});updateVisible();fit();
    });
    document.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{
      statusFilter=b.dataset.status;selected=-1;selectionEmphasis=false;relationFocus=null;document.querySelectorAll('[data-status]').forEach(bb=>{bb.classList.toggle('selected',bb===b);bb.setAttribute('aria-pressed',String(bb===b));});updateVisible();renderInspector();
    });
    $('goal-button').onclick=()=>{selectTask(data.goal);relationFocus=transitive(data.goal,deps);updateVisible();fit([...relationFocus]);};
    $('clear-focus').onclick=()=>{groupFocus=-1;selected=-1;selectionEmphasis=false;relationFocus=null;frontierOnly=false;statusFilter='all';document.querySelectorAll('[data-status]').forEach(b=>{b.classList.toggle('selected',b.dataset.status==='all');b.setAttribute('aria-pressed',String(b.dataset.status==='all'));});updateVisible();fit();renderInspector();};
    $('method-button').onclick=()=>{const note=$('method-note');note.hidden=!note.hidden;$('method-button').setAttribute('aria-expanded',String(!note.hidden));$('method-button').lastElementChild.textContent=note.hidden?'+':'−';};
    $('play-replay').onclick=toggleReplay;$('time-slider').oninput=e=>{stopReplay();setTime(Number(e.target.value));};$('now-button').onclick=()=>setTime(1000);
    $('task-search').addEventListener('input',e=>{
      const query=e.target.value.trim().toLowerCase(),results=$('search-results');
      if(!query){results.hidden=true;return;}
      const matches=tasks.map((t,i)=>({t,i})).filter(({t})=>(t.id+' '+t.title).toLowerCase().includes(query)).sort((a,b)=>(b.t.id===query)-(a.t.id===query)).slice(0,18);
      results.innerHTML=matches.length?matches.map(({t,i})=>`<button class="search-result" data-task="${i}">${escape(t.title)}<small>${escape(t.id)} · ${labels[t.status]}</small></button>`).join(''):'<div class="search-result">No matching tasks.</div>';results.hidden=false;
    });
    $('task-search').addEventListener('keydown',e=>{if(e.key==='Escape'){$('search-results').hidden=true;}else if(e.key==='Enter'){const first=$('search-results').querySelector('[data-task]');if(first){selectTask(Number(first.dataset.task),true);$('task-search').blur();}}else if(e.key==='ArrowDown'){e.preventDefault();$('search-results').querySelector('button')?.focus();}});
    document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('task-search').focus();}if(e.key==='Escape'){$('search-results').hidden=true;stopReplay();}});
    document.addEventListener('click',async e=>{
      const task=e.target.closest('[data-task]');if(task)selectTask(Number(task.dataset.task),true);
      const group=e.target.closest('[data-group]');if(group){focusGroup(Number(group.dataset.group));$('atlas').scrollIntoView({behavior:reducedMotion?'instant':'smooth'});}
      const action=e.target.closest('[data-action]')?.dataset.action;
      if(action==='goal')selectTask(data.goal,true);
      else if(action==='prerequisites'||action==='consumers'){relationFocus=transitive(selected,action==='prerequisites'?deps:users);groupFocus=-1;updateVisible();fit([...relationFocus]);toast(`${number(relationFocus.size-1)} ${action==='prerequisites'?'prerequisite':'consumer'} tasks in the current graph`);}
      else if(action==='link')await copyText(new URL(`#task=${encodeURIComponent(tasks[selected].id)}`,location.href).href,'Task link copied');
      const session=e.target.closest('[data-session-mode]');if(session)renderSessions(session.dataset.sessionMode,Number(session.dataset.sessionLimit));
      const domain=e.target.closest('[data-domain]');if(domain){$('module-search').value='';await filterModules(domain.dataset.domain,'');}
      const path=e.target.closest('[data-copy-path]');if(path)await copyText(path.dataset.copyPath,'Source path copied');
      if(!e.target.closest('.search-wrap'))$('search-results').hidden=true;
    });
    $('show-frontier').onclick=()=>{setTime(1000);frontierOnly=true;selected=-1;selectionEmphasis=false;groupFocus=-1;relationFocus=null;statusFilter='all';document.querySelectorAll('[data-status]').forEach(b=>{b.classList.toggle('selected',b.dataset.status==='all');b.setAttribute('aria-pressed',String(b.dataset.status==='all'));});updateVisible();fit([...visibleSet]);renderInspector();$('atlas').scrollIntoView({behavior:reducedMotion?'instant':'smooth'});toast(`${number(visibleSet.size)} pending tasks with all prerequisites integrated`);};
    $('sessions-active').onclick=()=>renderSessions('active');$('sessions-integrated').onclick=()=>renderSessions('integrated');
    let queryTimer;$('module-search').oninput=e=>{clearTimeout(queryTimer);queryTimer=setTimeout(()=>filterModules('',e.target.value.trim()),180);};
    const ac=$('activity-canvas');ac.addEventListener('pointermove',e=>{
      const r=ac.getBoundingClientRect(),x=e.clientX-r.left,index=Math.max(0,Math.min(chartBins.length-1,Math.round((x-28)/(r.width-36)*(chartBins.length-1)))),b=chartBins[index];
      const tip=$('activity-tooltip');tip.innerHTML=`${formatDate(b.time)} UTC<br>~${Math.round(b.active)} concurrent sessions<br>${b.integrated} accepted results in this interval`;tip.hidden=false;tip.style.left=`${Math.max(0,Math.min(x+10,r.width-210))}px`;tip.style.top='15px';
    });ac.addEventListener('pointerleave',()=>$('activity-tooltip').hidden=true);ac.addEventListener('click',e=>{const r=ac.getBoundingClientRect();setTime(Math.max(0,Math.min(1000,Math.round((e.clientX-r.left-28)/(r.width-36)*1000))));$('atlas').scrollIntoView({behavior:reducedMotion?'instant':'smooth'});});
    new ResizeObserver(resize).observe(stage);
    new ResizeObserver(drawActivity).observe($('activity-chart'));
    const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting)document.querySelectorAll('.masthead nav a').forEach(a=>a.classList.toggle('nav-active',a.hash===`#${entry.target.id}`));});},{rootMargin:'-10% 0px -65% 0px'});['atlas','activity','library'].forEach(id=>observer.observe($(id)));
  }
  async function copyText(text,message){try{await navigator.clipboard.writeText(text);toast(message);}catch{toast(text);}}
  async function start() {
    try{
      const response=await fetch('observatory-data.json');if(!response.ok)throw new Error(`Snapshot request failed (${response.status})`);
      data=await response.json();tasks=data.tasks;groups=data.groups;
      deps=tasks.map(()=>[]);users=tasks.map(()=>[]);sessionsByTask=tasks.map(()=>[]);
      data.edges.forEach(([a,b])=>{deps[b].push(a);users[a].push(b);});data.attempts.forEach((a,i)=>sessionsByTask[a[0]].push(i));
      earliest=Math.min(...tasks.map(t=>t.created),...data.attempts.map(a=>a[1]));replayTime=data.generated;
      $('snapshot-time').textContent=`${formatDate(data.generated)} UTC`;
      $('footer-snapshot').textContent=`Snapshot ${new Date(data.generated*1000).toISOString().replace('T',' ').slice(0,16)} UTC`;
      $('metric-tasks').textContent=number(tasks.length);$('metric-dependencies').textContent=`${number(data.edges.length)} prerequisite connections`;
      $('metric-done').textContent=number(data.counts.done||0);$('metric-sessions').textContent=number(data.attempts.length);
      const running=data.attempts.filter(a=>a[3]==='running').length;
      $('metric-active').textContent=number(running);$('metric-peak').textContent=`${number(data.peak)} peak recorded concurrency`;
      $('metric-modules').textContent=number(data.source.modules);
      const ready=tasks.filter(t=>t.ready).length;
      $('frontier-number').textContent=number(ready);$('frontier-running').textContent=number(running);$('frontier-blocked').textContent=number(data.counts.blocked||0);$('frontier-waiting').textContent=number((data.counts.pending||0)-ready);
      $('activity-range').textContent=`${formatDate(earliest,true)} – ${formatDate(data.generated,true)} · UTC`;
      $('activity-total').textContent=`${number(data.attempts.filter(a=>a[3]==='accepted').length)} accepted sessions · amber marks below`;
      $('source-lines').textContent=`${number(data.source.lines)} source lines`;
      buildLayout();prepareActivity();renderWorkstreams();renderTreemap();renderSessions();wireEvents();
      selected=data.goal;setTime(1000);resize();renderInspector();$('map-loading').hidden=true;
      if(location.hash.startsWith('#task=')){const id=decodeURIComponent(location.hash.slice(6)),i=tasks.findIndex(t=>t.id===id);if(i>=0)selectTask(i,true);}
      if(document.fonts)document.fonts.ready.then(()=>{invalidate();drawActivity();});
    }catch(error){$('map-loading').textContent='The snapshot could not be loaded. Please reload the page.';toast(error.message);console.error(error);}
  }
  start();
})();
