(function(){
  var C=document.getElementById('brain-canvas');
  if (!C) return;
  var ctx=C.getContext('2d');
  var W,H,t=0,mx=0,my=0;

  // 3D nodes rotating in space
  var N3=[],L3=[],pulses=[],icons=[],rings=[],stars=[],meteors=[],coreRings=[];
  var sweepAngle=0;

  // Icon definitions - Galaxy edition (16 icons, 3 orbits)
  var ICON_DEF=[
    // Orbit 1 - inner (fast)
    {s:'AI',   lbl:'AI',      c:[0,210,255],  orbit:0},
    {s:'⚙',   lbl:'BOT',     c:[120,80,255], orbit:0},
    {s:'DB',   lbl:'BASE',    c:[0,200,100],  orbit:0},
    {s:'⚡',   lbl:'AUTO',   c:[255,200,0],  orbit:0},
    {s:'ML',   lbl:'ML',      c:[0,220,180],  orbit:0},
    // Orbit 2 - mid (medium)
    {s:'</>',  lbl:'API',     c:[0,200,255],  orbit:1},
    {s:'☁',   lbl:'CLOUD',   c:[80,160,255], orbit:1},
    {s:'🔒',  lbl:'SEC',     c:[255,120,80], orbit:1},
    {s:'📊',  lbl:'BI',      c:[0,210,120],  orbit:1},
    {s:'∿',   lbl:'DATA',    c:[200,60,255], orbit:1},
    {s:'ERP',  lbl:'ERP',     c:[255,180,40], orbit:1},
    // Orbit 3 - outer (slow)
    {s:'WEB',  lbl:'WEB',     c:[0,180,255],  orbit:2},
    {s:'📱',  lbl:'APP',     c:[80,220,255], orbit:2},
    {s:'CRM',  lbl:'CRM',     c:[180,80,255], orbit:2},
    {s:'IoT',  lbl:'IoT',     c:[0,255,180],  orbit:2},
    {s:'RPA',  lbl:'ROBOT',   c:[255,100,100],orbit:2},
  ];

  function rgba(r,g,b,a){return 'rgba('+r+','+g+','+b+','+a+')';}

  function resize(){
    W=C.width=C.offsetWidth;
    H=C.height=C.offsetHeight;
    mx=W/2; my=H/2;
    build();
  }

  // Project 3D → 2D
  function proj(x,y,z,cx,cy){
    var fov=650, scale=fov/(fov+z);
    return {px:cx+x*scale, py:cy+y*scale, scale:scale, z:z};
  }

  function build(){
    var cx=W*0.50, cy=H*0.50;
    var R=Math.min(W,H)*0.28;

    // === SPHERE OF NEURONS ===
    N3=[];
    // Fibonacci sphere distribution for uniform coverage
    var golden=Math.PI*(3-Math.sqrt(5));
    var total=80;
    for(var i=0;i<total;i++){
      var y3=(1-i/(total-1)*2);
      var r2=Math.sqrt(1-y3*y3);
      var phi=golden*i;
      var layer=Math.random()<0.3?'outer':'inner';
      var rad=layer==='outer'?R*(0.85+Math.random()*0.18):R*(0.3+Math.random()*0.55);
      N3.push({
        bx:Math.cos(phi)*r2*rad,
        by:y3*rad*(0.88),
        bz:Math.sin(phi)*r2*rad,
        r:1.4+Math.random()*2.2,
        ph:Math.random()*Math.PI*2,
        spd:0.018+Math.random()*0.025,
        cx:Math.random()<0.65
      });
    }

    // Links between nearby nodes
    L3=[];
    for(var i=0;i<N3.length;i++){
      var count=0;
      for(var j=i+1;j<N3.length&&count<3;j++){
        var dx=N3[i].bx-N3[j].bx, dy=N3[i].by-N3[j].by, dz=N3[i].bz-N3[j].bz;
        var d=Math.sqrt(dx*dx+dy*dy+dz*dz);
        if(d<R*0.58){
          L3.push({a:i,b:j,d:d,al:0.08+Math.random()*0.18});
          count++;
        }
      }
    }

    // === ORBITAL RADII (3 orbits) ===
    var orbitR=[R*1.38, R*1.78, R*2.18];
    var orbitSpeeds=[0.007,0.0045,0.0028];
    var orbitTilts=[0.40, 0.48, 0.52];

    // Distribute icons per orbit
    var perOrbit=[0,0,0];
    ICON_DEF.forEach(function(d){ perOrbit[d.orbit]++; });
    var countPerOrbit=[0,0,0];

    icons=ICON_DEF.map(function(def,i){
      var o=def.orbit;
      var total=perOrbit[o];
      var idx=countPerOrbit[o]++;
      var angle=(idx/total)*Math.PI*2 + o*0.7;
      return {
        s:def.s, lbl:def.lbl, c:def.c, orbit:o,
        angle:angle,
        orbitR:orbitR[o]+Math.random()*18,
        tiltY:orbitTilts[o],
        ph:Math.random()*Math.PI*2,
        spd:orbitSpeeds[o]+(Math.random()-.5)*0.001,
        dir:o===1?-1:1,
        alpha:0, sz:def.orbit===0?20:def.orbit===1?17:15
      };
    });

    // === ORBITAL RINGS (one per orbit) ===
    rings=[
      {rx:orbitR[0]*1.05,ry:orbitR[0]*orbitTilts[0],angle:0,   spd:0.005,  col:[0,180,255]},
      {rx:orbitR[1]*1.03,ry:orbitR[1]*orbitTilts[1],angle:2.1, spd:-0.003, col:[120,60,255]},
      {rx:orbitR[2]*1.02,ry:orbitR[2]*orbitTilts[2],angle:1.0, spd:0.002,  col:[0,200,180]},
    ];

    // === METEORS ===
    meteors=[];

    // Background stars
    stars=[];
    for(var k=0;k<120;k++){
      stars.push({
        x:Math.random()*W, y:Math.random()*H,
        r:0.3+Math.random()*1.2,
        al:0.05+Math.random()*0.25,
        ph:Math.random()*Math.PI*2,
        spd:0.015+Math.random()*0.02
      });
    }

    pulses=[];
  }

  function spawn(){
    if(Math.random()<0.09&&L3.length){
      var l=L3[Math.floor(Math.random()*L3.length)];
      pulses.push({l:l,t:0,spd:0.007+Math.random()*0.012,
        c:Math.random()<0.6?[0,210,255]:[150,80,255]});
    }
    // Spawn core shockwave rings
    if(Math.random()<0.012&&coreRings.length<4){
      coreRings.push({r:4, alpha:0.55});
    }
    // Spawn meteors
    if(Math.random()<0.025&&meteors.length<12){
      var cx2=W*0.50, cy2=H*0.50, R2=Math.min(W,H)*0.28;
      var side=Math.floor(Math.random()*4);
      var sx,sy,ex,ey;
      if(side===0){sx=Math.random()*W;sy=-20;ex=cx2+(Math.random()-.5)*R2*2;ey=cy2+(Math.random()-.5)*R2;}
      else if(side===1){sx=W+20;sy=Math.random()*H;ex=cx2+(Math.random()-.5)*R2;ey=cy2+(Math.random()-.5)*R2*2;}
      else if(side===2){sx=Math.random()*W;sy=H+20;ex=cx2+(Math.random()-.5)*R2*2;ey=cy2+(Math.random()-.5)*R2;}
      else{sx=-20;sy=Math.random()*H;ex=cx2+(Math.random()-.5)*R2;ey=cy2+(Math.random()-.5)*R2*2;}
      var cols=[[0,210,255],[120,80,255],[0,200,100],[255,200,0],[255,120,60]];
      var mc=cols[Math.floor(Math.random()*cols.length)];
      meteors.push({
        sx:sx,sy:sy,ex:ex,ey:ey,
        t:0, spd:0.004+Math.random()*0.008,
        c:mc, tail:30+Math.random()*50,
        r:1.2+Math.random()*2.0, alpha:1
      });
    }
  }

  // ── STARS ──
  function drawStars(){
    stars.forEach(function(s){
      s.ph+=s.spd;
      var a=s.al*(0.5+0.5*Math.sin(s.ph));
      ctx.beginPath();
      ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle='rgba(150,200,255,'+a+')';
      ctx.fill();
    });
  }

  // ── GLOBAL GLOW ──
  function drawGlow(){
    var cx=W*0.50, cy=H*0.50, R=Math.min(W,H)*0.28;
    var g=ctx.createRadialGradient(cx,cy,R*0.1,cx,cy,R*1.5);
    g.addColorStop(0,'rgba(0,180,255,0.13)');
    g.addColorStop(0.45,'rgba(80,40,200,0.06)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  }

  // ── RADAR SWEEP ──
  function drawSweep(){
    var cx=W*0.50, cy=H*0.50, R=Math.min(W,H)*0.62;
    sweepAngle+=0.010;
    var steps=26;
    for(var i=0;i<steps;i++){
      var a=sweepAngle-i*0.028;
      var alpha=(1-i/steps)*0.09;
      ctx.beginPath();
      ctx.moveTo(cx,cy);
      ctx.lineTo(cx+Math.cos(a)*R, cy+Math.sin(a)*R*0.62);
      ctx.strokeStyle=rgba(0,220,255,alpha);
      ctx.lineWidth=1;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx,cy);
    ctx.lineTo(cx+Math.cos(sweepAngle)*R, cy+Math.sin(sweepAngle)*R*0.62);
    ctx.strokeStyle='rgba(170,245,255,0.4)';
    ctx.lineWidth=1.3;
    ctx.stroke();
  }

  // ── CORE ENERGY SHOCKWAVES ──
  function drawCoreRings(){
    var cx=W*0.50, cy=H*0.50;
    for(var i=coreRings.length-1;i>=0;i--){
      var cr=coreRings[i];
      cr.r+=2.1; cr.alpha-=0.0065;
      if(cr.alpha<=0){coreRings.splice(i,1); continue;}
      ctx.beginPath();
      ctx.arc(cx,cy,cr.r,0,Math.PI*2);
      ctx.strokeStyle=rgba(0,210,255,cr.alpha);
      ctx.lineWidth=1.2;
      ctx.stroke();
    }
  }

  // ── AI CORE ──
  function drawCore(){
    var cx=W*0.50, cy=H*0.50;
    var pulse=0.6+0.4*Math.sin(t*1.6);
    var g=ctx.createRadialGradient(cx,cy,0,cx,cy,42+18*pulse);
    g.addColorStop(0,'rgba(190,245,255,0.85)');
    g.addColorStop(0.18,'rgba(0,210,255,0.5)');
    g.addColorStop(0.55,'rgba(90,40,255,0.14)');
    g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;
    ctx.beginPath(); ctx.arc(cx,cy,60,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx,cy,2.6+2.2*pulse,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.fill();
  }

  // ── HUD CORNER FRAME ──
  function drawHUDFrame(){
    var m=16, s=24;
    ctx.strokeStyle='rgba(0,210,255,0.32)';
    ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(m,m+s); ctx.lineTo(m,m); ctx.lineTo(m+s,m); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W-m-s,m); ctx.lineTo(W-m,m); ctx.lineTo(W-m,m+s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W-m,H-m-s); ctx.lineTo(W-m,H-m); ctx.lineTo(W-m-s,H-m); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m+s,H-m); ctx.lineTo(m,H-m); ctx.lineTo(m,H-m-s); ctx.stroke();
  }

  // ── ORBITAL RINGS ──
  function drawRings(){
    var cx=W*0.50, cy=H*0.50;
    rings.forEach(function(ring){
      ring.angle+=ring.spd;
      ctx.save(); ctx.translate(cx,cy);
      var steps=160, pts=[];
      for(var i=0;i<=steps;i++){
        var a=(i/steps)*Math.PI*2+ring.angle;
        var x3=Math.cos(a)*ring.rx;
        var y3=Math.sin(a)*ring.ry;
        pts.push({px:x3,py:y3,side:Math.sin(a)});
      }
      ctx.setLineDash([5,10]);
      ctx.lineDashOffset=-t*18;
      for(var i=0;i<pts.length-1;i++){
        var p1=pts[i],p2=pts[i+1];
        var depth=0.5+0.5*p1.side;
        var alpha=(0.08+0.12*depth);
        ctx.beginPath();
        ctx.moveTo(p1.px,p1.py); ctx.lineTo(p2.px,p2.py);
        ctx.strokeStyle=rgba(ring.col[0],ring.col[1],ring.col[2],alpha);
        ctx.lineWidth=0.9+0.4*depth; ctx.stroke();
      }
      ctx.setLineDash([]); ctx.lineDashOffset=0;
      ctx.restore();
    });
  }

  // ── METEORS ──
  function drawMeteors(){
    for(var i=meteors.length-1;i>=0;i--){
      var m=meteors[i];
      m.t+=m.spd;
      if(m.t>1){meteors.splice(i,1);continue;}
      var cx2=m.sx+(m.ex-m.sx)*m.t;
      var cy2=m.sy+(m.ey-m.sy)*m.t;
      var angle=Math.atan2(m.ey-m.sy,m.ex-m.sx);
      var fade=m.t<0.1?m.t*10:m.t>0.8?(1-m.t)*5:1;

      // Tail
      var tailLen=m.tail*(0.5+0.5*fade);
      var gm=ctx.createLinearGradient(
        cx2-Math.cos(angle)*tailLen, cy2-Math.sin(angle)*tailLen,
        cx2, cy2
      );
      gm.addColorStop(0,rgba(m.c[0],m.c[1],m.c[2],0));
      gm.addColorStop(0.6,rgba(m.c[0],m.c[1],m.c[2],0.3*fade));
      gm.addColorStop(1,rgba(m.c[0],m.c[1],m.c[2],0.9*fade));
      ctx.beginPath();
      ctx.moveTo(cx2-Math.cos(angle)*tailLen, cy2-Math.sin(angle)*tailLen);
      ctx.lineTo(cx2,cy2);
      ctx.strokeStyle=gm; ctx.lineWidth=m.r*1.4*fade; ctx.stroke();

      // Head
      ctx.beginPath(); ctx.arc(cx2,cy2,m.r*fade,0,Math.PI*2);
      ctx.fillStyle=rgba(m.c[0],m.c[1],m.c[2],fade); ctx.fill();

      // Glow
      var gh=ctx.createRadialGradient(cx2,cy2,0,cx2,cy2,m.r*5*fade);
      gh.addColorStop(0,rgba(m.c[0],m.c[1],m.c[2],0.5*fade));
      gh.addColorStop(1,rgba(m.c[0],m.c[1],m.c[2],0));
      ctx.fillStyle=gh; ctx.beginPath(); ctx.arc(cx2,cy2,m.r*5*fade,0,Math.PI*2); ctx.fill();
    }
  }

  // ── LINKS ──
  function drawLinks(){
    var cx=W*0.50, cy=H*0.50;
    L3.forEach(function(l){
      var a=N3[l.a], b=N3[l.b];
      var pa=proj(a.bx,a.by,a.bz,cx,cy);
      var pb=proj(b.bx,b.by,b.bz,cx,cy);
      var fl=0.4+0.4*Math.sin(t*2.0+l.a*0.7);
      var alpha=l.al*fl*Math.max(0,(pa.scale+pb.scale)/2);
      var g=ctx.createLinearGradient(pa.px,pa.py,pb.px,pb.py);
      g.addColorStop(0,rgba(0,200,255,alpha));
      g.addColorStop(1,rgba(80,40,255,alpha*0.4));
      ctx.beginPath(); ctx.strokeStyle=g; ctx.lineWidth=0.7;
      ctx.moveTo(pa.px,pa.py); ctx.lineTo(pb.px,pb.py); ctx.stroke();
    });
  }

  // ── PULSES ──
  function drawPulses(){
    var cx=W*0.50, cy=H*0.50;
    for(var i=pulses.length-1;i>=0;i--){
      var p=pulses[i];
      var a=N3[p.l.a], b=N3[p.l.b];
      var bx=a.bx+(b.bx-a.bx)*p.t, by2=a.by+(b.by-a.by)*p.t, bz=a.bz+(b.bz-a.bz)*p.t;
      var pp=proj(bx,by2,bz,cx,cy);
      var fade=(1-p.t)*pp.scale;
      // Trail
      for(var tr=0;tr<5;tr++){
        var tt=Math.max(0,p.t-tr*0.06);
        var tbx=a.bx+(b.bx-a.bx)*tt, tby=a.by+(b.by-a.by)*tt, tbz=a.bz+(b.bz-a.bz)*tt;
        var tp=proj(tbx,tby,tbz,cx,cy);
        ctx.beginPath(); ctx.arc(tp.px,tp.py,(2.5-tr*0.4)*fade,0,Math.PI*2);
        ctx.fillStyle=rgba(p.c[0],p.c[1],p.c[2],(0.5-tr*0.08)*fade); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(pp.px,pp.py,3*fade,0,Math.PI*2);
      ctx.fillStyle='rgba(220,245,255,'+0.9*fade+')'; ctx.fill();
      var hg=ctx.createRadialGradient(pp.px,pp.py,0,pp.px,pp.py,8*fade);
      hg.addColorStop(0,rgba(p.c[0],p.c[1],p.c[2],0.4*fade));
      hg.addColorStop(1,rgba(p.c[0],p.c[1],p.c[2],0));
      ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(pp.px,pp.py,8*fade,0,Math.PI*2); ctx.fill();
      p.t+=p.spd;
      if(p.t>1) pulses.splice(i,1);
    }
  }

  // ── NODES ──
  function drawNodes(){
    var cx=W*0.50, cy=H*0.50;
    // Sort by z for painter's algorithm
    var sorted=N3.map(function(n,i){return {n:n,i:i};});
    sorted.sort(function(a,b){return a.n.bz-b.n.bz;});

    sorted.forEach(function(item){
      var n=item.n;
      n.ph+=n.spd;
      var glow=0.5+0.5*Math.sin(n.ph);
      var p=proj(n.bx,n.by,n.bz,cx,cy);
      if(p.scale<0.1) return;
      var sz=n.r*p.scale*(1+0.35*glow);
      var alpha=(0.4+0.6*p.scale)*Math.max(0,(n.bz+500)/600);

      var col=n.cx?[0,210,255]:[100,60,255];
      // Halo
      var hg=ctx.createRadialGradient(p.px,p.py,0,p.px,p.py,sz*5);
      hg.addColorStop(0,rgba(col[0],col[1],col[2],glow*0.28*alpha));
      hg.addColorStop(1,rgba(col[0],col[1],col[2],0));
      ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(p.px,p.py,sz*5,0,Math.PI*2); ctx.fill();
      // Core
      ctx.beginPath(); ctx.arc(p.px,p.py,sz,0,Math.PI*2);
      ctx.fillStyle=rgba(col[0],col[1],col[2],(0.7+0.3*glow)*alpha); ctx.fill();
      if(glow>0.80){
        ctx.beginPath(); ctx.arc(p.px,p.py,sz*0.38,0,Math.PI*2);
        ctx.fillStyle='rgba(255,255,255,'+(0.75*alpha)+')'; ctx.fill();
      }
    });
  }

  // ── ICONS ──
  function roundRect(c,x,y,w,h,r){
    c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y);
    c.quadraticCurveTo(x+w,y,x+w,y+r); c.lineTo(x+w,y+h-r);
    c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h);
    c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r);
    c.quadraticCurveTo(x,y,x+r,y); c.closePath();
  }

  function drawIcons(){
    var cx=W*0.50, cy=H*0.50, R=Math.min(W,H)*0.28;
    icons.forEach(function(ic){
      ic.angle+=ic.spd*ic.dir;
      ic.ph+=0.02;
      ic.alpha+=(1-ic.alpha)*0.025;
      var x=cx+Math.cos(ic.angle)*ic.orbitR;
      var y=cy+Math.sin(ic.angle)*ic.orbitR*0.45+Math.sin(ic.ph)*5+ic.tiltY*ic.orbitR*0.3;
      var glow=0.4+0.35*Math.sin(ic.ph*0.85);
      var al=ic.alpha;

      // Line from center to icon (only inner orbit)
      if(ic.orbit===0){
        var lg=ctx.createLinearGradient(cx,cy,x,y);
        lg.addColorStop(0,rgba(ic.c[0],ic.c[1],ic.c[2],(0.12+0.07*glow)*al));
        lg.addColorStop(0.7,rgba(ic.c[0],ic.c[1],ic.c[2],0.03*al));
        lg.addColorStop(1,rgba(ic.c[0],ic.c[1],ic.c[2],0));
        ctx.beginPath(); ctx.strokeStyle=lg; ctx.lineWidth=0.8;
        ctx.setLineDash([3,9]); ctx.lineDashOffset=-t*12;
        ctx.moveTo(cx,cy); ctx.lineTo(x,y); ctx.stroke();
        ctx.setLineDash([]); ctx.lineDashOffset=0;
      }

      // Glow
      var bg=ctx.createRadialGradient(x,y,0,x,y,ic.sz*1.9);
      bg.addColorStop(0,rgba(ic.c[0],ic.c[1],ic.c[2],glow*0.38*al));
      bg.addColorStop(1,rgba(ic.c[0],ic.c[1],ic.c[2],0));
      ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(x,y,ic.sz*1.9,0,Math.PI*2); ctx.fill();

      // Box
      ctx.save(); ctx.translate(x,y);
      var bs=ic.sz*0.76;
      roundRect(ctx,-bs,-bs,bs*2,bs*2,4);
      ctx.fillStyle='rgba(5,15,55,'+(0.62*al)+')'; ctx.fill();
      ctx.strokeStyle=rgba(ic.c[0],ic.c[1],ic.c[2],(0.55+glow*0.35)*al);
      ctx.lineWidth=1.4; ctx.stroke();

      // HUD corner ticks
      var tk=bs*0.42;
      ctx.strokeStyle=rgba(ic.c[0],ic.c[1],ic.c[2],al*(0.8+0.2*glow));
      ctx.lineWidth=1.5;
      ctx.beginPath();
      ctx.moveTo(-bs,-bs+tk); ctx.lineTo(-bs,-bs); ctx.lineTo(-bs+tk,-bs);
      ctx.moveTo(bs-tk,-bs); ctx.lineTo(bs,-bs); ctx.lineTo(bs,-bs+tk);
      ctx.moveTo(bs,bs-tk); ctx.lineTo(bs,bs); ctx.lineTo(bs-tk,bs);
      ctx.moveTo(-bs+tk,bs); ctx.lineTo(-bs,bs); ctx.lineTo(-bs,bs-tk);
      ctx.stroke();

      ctx.fillStyle='rgba(200,235,255,'+al+')';
      ctx.font='bold '+(ic.sz*0.58)+'px monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(ic.s,0,-2);
      ctx.fillStyle=rgba(ic.c[0],ic.c[1],ic.c[2],al*0.75);
      ctx.font=(ic.sz*0.30)+'px monospace';
      ctx.fillText(ic.lbl||'',0,ic.sz*0.44);
      ctx.restore();
    });
  }

  // ── ROTATION AUTO ──
  var autoRotX=0, autoRotY=0;

  function draw(){
    ctx.clearRect(0,0,W,H);
    t+=0.012;
    spawn();

    // Auto slow rotation + subtle mouse influence
    autoRotY+=0.004;
    autoRotX=Math.sin(t*0.3)*0.18;

    drawStars();
    drawGlow();
    drawSweep();
    drawRings();
    drawCoreRings();
    drawMeteors();
    drawLinks();
    drawPulses();
    drawCore();
    drawNodes();
    drawIcons();
    drawHUDFrame();
    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize',function(){resize();});
  draw();
})();

// Hamburger Mobile Menu Logic
document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.querySelector('.hamburger');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
    });

    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
      });
    });
  }
});

// Toast notification helper
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.zIndex = '1000';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px';
  toast.style.color = '#fff';
  toast.style.fontWeight = '600';
  toast.style.fontSize = '14px';
  toast.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.3)';
  toast.style.backdropFilter = 'blur(10px)';
  toast.style.border = '1px solid rgba(255,255,255,0.1)';
  toast.style.transition = 'all 0.3s ease';

  if (type === 'success') {
    toast.style.background = 'rgba(16, 185, 129, 0.85)';
    toast.style.borderColor = 'rgba(16, 185, 129, 0.3)';
  } else {
    toast.style.background = 'rgba(244, 63, 94, 0.85)';
    toast.style.borderColor = 'rgba(244, 63, 94, 0.3)';
  }

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Contact Form submission handler
window.handleSubmit = function(event) {
  event.preventDefault();

  const name = document.getElementById('contact-name').value;
  const company = document.getElementById('contact-company').value;
  const email = document.getElementById('contact-email').value;
  const service = document.getElementById('contact-service').value;
  const message = document.getElementById('contact-message').value;

  const data = { name, company, email, service, message };

  const submitBtn = document.querySelector('.btn-submit');
  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Enviando...';

  fetch('/api/contact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(res => res.json())
  .then(result => {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
    if (result.success) {
      showToast('✓ ¡Mensaje enviado con éxito! Te contactaremos pronto.', 'success');
      document.getElementById('contact-name').value = '';
      document.getElementById('contact-company').value = '';
      document.getElementById('contact-email').value = '';
      document.getElementById('contact-service').value = '';
      document.getElementById('contact-message').value = '';
    } else {
      showToast(result.error || 'Error al enviar el mensaje. Inténtalo de nuevo.', 'error');
    }
  })
  .catch(err => {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
    showToast('Error de red. Verifica tu conexión e inténtalo de nuevo.', 'error');
    console.error('Submission error:', err);
  });
}

// Combo CTA: preselect the service in the contact form and scroll there
window.selectComboService = function(name) {
  var select = document.getElementById('contact-service');
  if (select) {
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === name) {
        select.selectedIndex = i;
        break;
      }
    }
  }
  var contacto = document.getElementById('contacto');
  if (contacto) contacto.scrollIntoView({ behavior: 'smooth' });
};

// Shipping savings calculator
var COMBO_RATES = { Starter: 19000, Pro: 22000 };

function formatCOP(n) {
  return '$' + Math.round(n).toLocaleString('es-CO') + ' COP';
}

// TRM del día (+ recargo de manejo) — usada en el encabezado y las calculadoras
var currentTRM = null;
fetch('/api/trm')
  .then(function (res) { return res.json(); })
  .then(function (data) {
    currentTRM = data.valor;
    var el = document.getElementById('trmValue');
    if (el) el.textContent = '$' + currentTRM.toLocaleString('es-CO') + ' COP';
  })
  .catch(function (err) {
    var el = document.getElementById('trmValue');
    if (el) el.textContent = 'No disponible';
    console.error('Error obteniendo TRM:', err);
  });

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

// Freight calculator: peso físico real, USD $5 por libra
var FREIGHT_RATE_USD = 5;
window.calcularFlete = function () {
  var peso = parseFloat(document.getElementById('freightWeight').value);
  var resultDiv = document.getElementById('freightResult');

  if (!peso || peso <= 0) {
    resultDiv.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">Ingresa un peso válido en libras.</p>';
    return;
  }

  var totalUSD = peso * FREIGHT_RATE_USD;
  var html =
    '<div class="calc-result-row"><span>Peso</span><strong>' + peso + ' lb</strong></div>' +
    '<div class="calc-result-row"><span>Tarifa</span><strong>USD $' + FREIGHT_RATE_USD + '/lb</strong></div>' +
    '<div class="calc-result-row total"><span>Total flete</span><strong>USD $' + totalUSD.toFixed(2) + '</strong></div>';
  if (currentTRM) {
    html += '<div class="calc-result-row total"><span>Equivalente en COP</span><strong>' + formatCOP(totalUSD * currentTRM) + '</strong></div>';
  }
  resultDiv.innerHTML = html;
};

// Quote calculator: artículo + impuestos si aplica + flete por peso — alimenta el PDF
var lastFullQuote = null;

window.calcularCotizacion = function () {
  var tipo = document.getElementById('qTipo').value.trim();
  var caract = document.getElementById('qCaracteristicas').value.trim();
  var talla = document.getElementById('qTalla').value.trim();
  var cantidad = parseInt(document.getElementById('qCantidad').value, 10);
  var valorUnitario = parseFloat(document.getElementById('qValor').value);
  var peso = parseFloat(document.getElementById('qPeso').value);
  var link = document.getElementById('qLink').value.trim();
  var resultDiv = document.getElementById('quoteResult');
  var fullResultDiv = document.getElementById('fullQuoteResult');
  var downloadBtn = document.getElementById('downloadPdfBtn');

  downloadBtn.style.display = 'none';
  lastFullQuote = null;

  if (!tipo || !cantidad || cantidad <= 0 || !valorUnitario || valorUnitario <= 0 || !peso || peso <= 0) {
    resultDiv.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">Completa al menos el tipo de artículo, la cantidad, el valor por unidad y el peso del paquete.</p>';
    return;
  }
  if (cantidad > 5) {
    resultDiv.innerHTML = '<p style="color:#f43f5e;font-size:0.85rem">⚠️ Máximo 5 unidades de la misma referencia por envío. Para mayor cantidad, escríbenos directamente.</p>';
    return;
  }

  var subtotalUSD = valorUnitario * cantidad;
  var aplicaImpuestos = valorUnitario >= 200;
  var arancelUSD = aplicaImpuestos ? subtotalUSD * 0.10 : 0;
  var ivaUSD = aplicaImpuestos ? subtotalUSD * 0.19 : 0;
  var fleteUSD = peso * FREIGHT_RATE_USD;
  var totalUSD = subtotalUSD + arancelUSD + ivaUSD + fleteUSD;
  var totalCOP = currentTRM ? totalUSD * currentTRM : null;

  var detalle = escapeHtml(tipo);
  if (caract) detalle += ' · ' + escapeHtml(caract);
  if (talla) detalle += ' · Talla ' + escapeHtml(talla);

  var rows = '';
  rows += '<div class="calc-result-row"><span>Artículo</span><strong>' + detalle + '</strong></div>';
  rows += '<div class="calc-result-row"><span>Subtotal (' + cantidad + ' x $' + valorUnitario.toFixed(2) + ')</span><strong>USD $' + subtotalUSD.toFixed(2) + '</strong></div>';
  if (aplicaImpuestos) {
    rows += '<div class="calc-result-row"><span>Arancel (10%)</span><strong>USD $' + arancelUSD.toFixed(2) + '</strong></div>';
    rows += '<div class="calc-result-row"><span>IVA Colombia (19%)</span><strong>USD $' + ivaUSD.toFixed(2) + '</strong></div>';
  } else {
    rows += '<div class="calc-result-row"><span>Impuestos</span><strong>No aplica (valor unitario &lt; USD $200)</strong></div>';
  }
  rows += '<div class="calc-result-row"><span>Flete (' + peso + ' lb x $' + FREIGHT_RATE_USD + ')</span><strong>USD $' + fleteUSD.toFixed(2) + '</strong></div>';
  rows += '<div class="calc-result-row total"><span>Total estimado</span><strong>USD $' + totalUSD.toFixed(2) + '</strong></div>';
  if (totalCOP) {
    rows += '<div class="calc-result-row total"><span>Equivalente en COP</span><strong>' + formatCOP(totalCOP) + '</strong></div>';
  }

  var linkHtml = 'no indicado';
  if (link && /^https?:\/\//i.test(link)) {
    linkHtml = '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer" style="color:var(--blue2)">ver artículo ↗</a>';
  }
  rows += '<p style="color:var(--muted);font-size:0.78rem;margin-top:0.8rem">Referencia: ' + linkHtml + '</p>';

  resultDiv.innerHTML = rows;
  fullResultDiv.innerHTML = rows;

  lastFullQuote = {
    tipo: tipo, caract: caract, talla: talla, cantidad: cantidad,
    valorUnitario: valorUnitario, peso: peso, link: link,
    subtotalUSD: subtotalUSD, aplicaImpuestos: aplicaImpuestos,
    arancelUSD: arancelUSD, ivaUSD: ivaUSD, fleteUSD: fleteUSD,
    totalUSD: totalUSD, totalCOP: totalCOP, trm: currentTRM
  };
  downloadBtn.style.display = 'block';
};

window.descargarCotizacionPDF = function () {
  if (!lastFullQuote || !window.jspdf || !window.jspdf.jsPDF) {
    showToast('No se pudo generar el PDF. Vuelve a calcular la cotización.', 'error');
    return;
  }
  var q = lastFullQuote;
  var doc = new window.jspdf.jsPDF();
  var y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(26, 127, 232);
  doc.text('Logiclic', 15, y);
  doc.setFontSize(11);
  doc.setTextColor(90, 90, 90);
  doc.setFont('helvetica', 'normal');
  y += 7;
  doc.text('Cotización de compra internacional', 15, y);
  y += 6;
  doc.text('Fecha: ' + new Date().toLocaleDateString('es-CO'), 15, y);
  y += 12;

  doc.setDrawColor(220, 220, 220);
  doc.line(15, y, 195, y);
  y += 10;

  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.setFont('helvetica', 'bold');
  doc.text('Artículo', 15, y);
  doc.setFont('helvetica', 'normal');
  var detalleTxt = q.tipo + (q.caract ? ' - ' + q.caract : '') + (q.talla ? ' - Talla ' + q.talla : '');
  doc.text(doc.splitTextToSize(detalleTxt, 130), 70, y);
  y += 10;

  if (q.link) {
    doc.setFont('helvetica', 'bold');
    doc.text('Referencia', 15, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(26, 127, 232);
    doc.textWithLink(doc.splitTextToSize(q.link, 130)[0], 70, y, { url: q.link });
    doc.setTextColor(20, 20, 20);
    y += 10;
  }

  var line = function (label, value) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 15, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, 70, y);
    y += 8;
  };

  line('Cantidad', String(q.cantidad));
  line('Valor por unidad', 'USD $' + q.valorUnitario.toFixed(2));
  line('Subtotal', 'USD $' + q.subtotalUSD.toFixed(2));
  line('Arancel (10%)', q.aplicaImpuestos ? 'USD $' + q.arancelUSD.toFixed(2) : 'No aplica');
  line('IVA Colombia (19%)', q.aplicaImpuestos ? 'USD $' + q.ivaUSD.toFixed(2) : 'No aplica');
  line('Flete (' + q.peso + ' lb x USD $' + FREIGHT_RATE_USD + ')', 'USD $' + q.fleteUSD.toFixed(2));

  y += 2;
  doc.setDrawColor(220, 220, 220);
  doc.line(15, y, 195, y);
  y += 10;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 127, 232);
  doc.text('Total estimado: USD $' + q.totalUSD.toFixed(2), 15, y);
  y += 8;
  if (q.totalCOP) {
    doc.text('Equivalente en COP: ' + formatCOP(q.totalCOP), 15, y);
    y += 8;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text('TRM del día usada: $' + Math.round(q.trm).toLocaleString('es-CO') + ' COP (incluye recargo de manejo)', 15, y);
    y += 10;
  }

  doc.setFontSize(9);
  doc.setTextColor(140, 140, 140);
  doc.text('Cotización de referencia, sujeta a confirmación final según el peso y valor reales del artículo.', 15, y);
  y += 6;
  doc.text('Máximo 5 unidades de la misma referencia por envío. Contacto: 321 824 2449 · WhatsApp.', 15, y);

  doc.save('cotizacion-logiclic-' + Date.now() + '.pdf');
};

window.calcularAhorro = function() {
  var libras = parseFloat(document.getElementById('calc-libras').value);
  var precioActual = parseFloat(document.getElementById('calc-precio').value);
  var resultDiv = document.getElementById('calc-resultado');

  if (!libras || libras <= 0 || !precioActual || precioActual <= 0) {
    resultDiv.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">Ingresa libras y precio actual válidos para calcular.</p>';
    return;
  }

  var costoActual = libras * precioActual;
  var rows = '';
  Object.keys(COMBO_RATES).forEach(function(plan) {
    var costoLogiclic = libras * COMBO_RATES[plan];
    var ahorroMensual = costoActual - costoLogiclic;
    var ahorroAnual = ahorroMensual * 12;
    rows += '<div class="calc-result-row"><span>Combo ' + plan + ' (' + formatCOP(COMBO_RATES[plan]) + '/lb)</span><strong>' + formatCOP(costoLogiclic) + '/mes</strong></div>';
    rows += '<div class="calc-result-row total"><span>Ahorro estimado</span><strong>' + formatCOP(ahorroMensual) + '/mes · ' + formatCOP(ahorroAnual) + '/año</strong></div>';
  });

  resultDiv.innerHTML =
    '<div class="calc-result-row"><span>Tu costo actual</span><strong>' + formatCOP(costoActual) + '/mes</strong></div>' +
    rows;
};
