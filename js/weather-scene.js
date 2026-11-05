/**
 * A small procedural sky: the reported WMO condition and isDay control every layer.
 * No images, external assets, or fabricated weather. Returns a complete cleanup.
 */
export function classifyWeather(code) {
  const value = Number(code);
  if ([95, 96, 99].includes(value)) return 'thunder';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'snow';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'rain';
  if ([51, 53, 55, 56, 57].includes(value)) return 'drizzle';
  if ([45, 48].includes(value)) return 'fog';
  if (value === 3) return 'cloudy';
  if ([1, 2].includes(value)) return 'partly';
  return 'clear';
}

const palettes = {
  day: {
    clear: ['#1777bb', '#62a7d4', '#b6d6e5'],
    partly: ['#477b9e', '#82aec8', '#bdcfd7'],
    cloudy: ['#4e697f', '#829baa', '#b7c5c9'],
    drizzle: ['#3e596e', '#6d8798', '#a0b2ba'],
    rain: ['#304c63', '#607d91', '#9aadb6'],
    thunder: ['#192d43', '#3f566c', '#7b929f'],
    fog: ['#677f8d', '#9cafb6', '#c8d3d2'],
    snow: ['#5f7b94', '#9ab0c0', '#c6d5dd'],
  },
  night: {
    clear: ['#071126', '#152a48', '#405370'],
    partly: ['#0c192f', '#283d58', '#53667b'],
    cloudy: ['#101b2e', '#2a3c52', '#647789'],
    drizzle: ['#101c2d', '#30445a', '#607586'],
    rain: ['#0c1728', '#293f56', '#5c7183'],
    thunder: ['#080f21', '#233349', '#465d72'],
    fog: ['#27394c', '#536879', '#82959f'],
    snow: ['#16273f', '#3d5670', '#819aab'],
  },
};

function randomGenerator(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let n = Math.imul(seed ^ seed >>> 15, 1 | seed);
    n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n;
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function radial(ctx, x, y, radius, colors) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  colors.forEach(([stop, color]) => gradient.addColorStop(stop, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** Cloud textures are built once, then drift as a few cheap drawImage calls. */
function makeCloud(random, day, kind, variant) {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 300;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const stormy = ['rain', 'drizzle', 'thunder'].includes(kind);
  const bright = day ? (stormy ? [155, 177, 189] : [236, 244, 244]) : [104, 127, 151];
  const shadow = day ? (stormy ? [44, 66, 87] : [109, 143, 166]) : [14, 30, 49];
  // The irregular density field avoids hard, cartoon-like outlines.
  const cells = Array.from({ length: 53 }, (_, i) => {
    const x = 70 + random() * 500;
    const arch = Math.sin((x - 70) / 500 * Math.PI);
    return { x, y: 170 - arch * 54 + (random() - .5) * 76, r: 26 + random() * 69, i };
  });
  ctx.globalCompositeOperation = 'source-over';
  cells.forEach(({ x, y, r }) => {
    const color = `${shadow[0]},${shadow[1]},${shadow[2]}`;
    radial(ctx, x, y + 28, r * 1.45, [[0, `rgba(${color},.23)`], [.5, `rgba(${color},.11)`], [1, `rgba(${color},0)`]]);
  });
  cells.sort((a, b) => b.y - a.y).forEach(({ x, y, r }) => {
    const color = `${bright[0]},${bright[1]},${bright[2]}`;
    radial(ctx, x, y - 9 - variant * 6, r, [[0, `rgba(${color},${day ? .35 : .21})`], [.38, `rgba(${color},${day ? .26 : .15})`], [1, `rgba(${color},0)`]]);
  });
  return canvas;
}

export function mountWeatherScene(card, data) {
  const kind = classifyWeather(data.code);
  const day = Boolean(data.isDay);
  const scene = document.createElement('div');
  scene.className = `weather-scene weather-scene--${kind} weather-scene--${day ? 'day' : 'night'}`;
  scene.dataset.condition = kind;
  scene.dataset.period = day ? 'day' : 'night';
  scene.setAttribute('aria-hidden', 'true');
  Object.assign(scene.style, {position:'absolute',inset:'0',overflow:'hidden',borderRadius:'inherit',pointerEvents:'none',zIndex:'0'});
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {display:'block',width:'100%',height:'100%'});
  scene.append(canvas); card.prepend(scene);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) { scene.style.background = palettes[day ? 'day' : 'night'][kind][1]; return () => scene.remove(); }
  const random = randomGenerator(7919 + Number(data.code || 0) * 131 + (day ? 19 : 83));
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clouds = [0, 1, 2].map(i => makeCloud(random, day, kind, i));
  const stars = Array.from({length:65}, () => ({x:random(),y:random() * .78,r:.35 + random() * .85,a:.2 + random() * .7,phase:random() * 6.28}));
  const precipitation = Array.from({length:kind === 'drizzle' ? 36 : kind === 'snow' ? 48 : 87}, () => ({x:random(),y:random(),z:.35 + random() * .65,phase:random() * 6.28}));
  let width = 1, height = 1, dpr = 1, raf = 0, disposed = false, lastFrame = -Infinity;
  const start = performance.now();
  const wet = ['rain', 'drizzle', 'thunder'].includes(kind);

  function paint(now) {
    if (disposed) return;
    const time = reduced.matches ? 0 : (now - start) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = palettes[day ? 'day' : 'night'][kind];
    const sky = ctx.createLinearGradient(0, 0, width * .25, height);
    sky.addColorStop(0, colors[0]); sky.addColorStop(.57, colors[1]); sky.addColorStop(1, colors[2]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    // Soft upper light illuminates the cloud edges even under an overcast sky.
    radial(ctx, width * .8, -height * .04, width * .7, [[0,day?'rgba(235,244,255,.32)':'rgba(130,167,216,.16)'],[1,'rgba(160,200,245,0)']]);

    const celestial = kind === 'clear' || kind === 'partly';
    if (!day && (kind === 'clear' || kind === 'partly')) {
      stars.forEach(star => {
        const twinkle = .72 + Math.sin(time * .6 + star.phase) * .28;
        ctx.fillStyle = `rgba(221,236,255,${star.a * twinkle * (kind === 'partly' ? .55 : 1)})`;
        ctx.beginPath(); ctx.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2); ctx.fill();
      });
    }
    if (celestial) {
      const x = width * .8, y = height * .25;
      if (day) {
        radial(ctx,x,y,92,[[0,'rgba(255,246,203,.91)'],[.15,'rgba(255,235,179,.43)'],[.48,'rgba(255,228,175,.14)'],[1,'rgba(255,232,180,0)']]);
        radial(ctx,x,y,22,[[0,'#fffcee'],[.6,'#fff9d7'],[.94,'rgba(255,242,202,.8)'],[1,'rgba(255,242,202,0)']]);
        // Broad, barely visible rays move slowly rather than spinning like an icon.
        ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(time * .013) * .06);ctx.globalCompositeOperation='screen';
        for(let i=0;i<5;i++){
          ctx.rotate(.72);const ray=ctx.createLinearGradient(0,0,0,210);ray.addColorStop(0,'rgba(255,244,205,.045)');ray.addColorStop(1,'rgba(255,244,205,0)');ctx.fillStyle=ray;ctx.beginPath();ctx.moveTo(-2,0);ctx.lineTo(-24,210);ctx.lineTo(24,210);ctx.closePath();ctx.fill();
        }ctx.restore();
      } else {
        radial(ctx,x,y,68,[[0,'rgba(193,219,247,.2)'],[.35,'rgba(170,205,241,.075)'],[1,'rgba(160,200,245,0)']]);
        const moon=ctx.createRadialGradient(x-6,y-6,1,x,y,17);moon.addColorStop(0,'#f5f3dd');moon.addColorStop(.75,'#d4dfde');moon.addColorStop(1,'#aebfca');
        ctx.fillStyle=moon;ctx.beginPath();ctx.arc(x,y,16,0,Math.PI*2);ctx.fill();
        [[-5,-4,3],[6,5,4],[-3,8,2]].forEach(([dx,dy,r])=>{ctx.fillStyle='rgba(110,139,158,.12)';ctx.beginPath();ctx.arc(x+dx,y+dy,r,0,Math.PI*2);ctx.fill();});
      }
    }

    const cloudCount = kind === 'clear' ? 2 : kind === 'partly' ? 4 : kind === 'fog' ? 4 : 7;
    for (let i=0; i<cloudCount; i++) {
      const scale = (i % 3 === 0 ? 1.42 : 1.05) * Math.max(width / 370, .85);
      const cw = 410 * scale, ch = 192 * scale;
      const speed = (i % 2 ? 1 : -.7) * (kind === 'thunder' ? 4 : 1.8);
      const span = width + cw;
      const base = (i * width * .38 - width * .56 + time * speed) % span;
      const x = base < -cw ? base + span : base;
      const y = height * (kind === 'clear' ? .62 : kind === 'partly' ? .25 + (i % 2) * .3 : -.16 + (i % 3) * .3) + Math.sin(time * .045 + i) * 4;
      ctx.globalAlpha = kind === 'clear' ? (day ? .34 : .12) : kind === 'fog' ? .42 : day ? .92 : .85;
      ctx.drawImage(clouds[i % 3], x, y, cw, ch);
    }
    ctx.globalAlpha = 1;

    if (kind === 'fog') {
      // Multiple translucent banks slide at different depths, with no rain.
      for (let i=0;i<5;i++) {
        const y = height * (.3 + i * .16) + Math.sin(time * .1 + i * 2) * 10;
        const bank = ctx.createLinearGradient(0,y-35,0,y+44);
        bank.addColorStop(0,'rgba(217,229,231,0)');bank.addColorStop(.5,day?'rgba(221,232,230,.16)':'rgba(173,194,207,.12)');bank.addColorStop(1,'rgba(217,229,231,0)');
        ctx.fillStyle=bank;ctx.fillRect(0,y-35,width,79);
      }
    }
    if (wet) {
      ctx.lineCap='round';
      precipitation.forEach(drop=>{
        const speed = kind === 'drizzle' ? .29 : .66;
        const y = ((drop.y + time * speed * drop.z) % 1.22) * height - height * .1;
        const x = ((drop.x - time * .025 * drop.z + 100) % 1.1) * width;
        const length = (kind === 'drizzle' ? 9 : 19) * drop.z;
        ctx.strokeStyle=`rgba(204,226,243,${.14 + drop.z * .3})`;ctx.lineWidth=.45 + drop.z * .6;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-2.5*drop.z,y+length);ctx.stroke();
      });
      // Rain catches the distant light near the horizon.
      const rainHaze=ctx.createLinearGradient(0,height*.45,0,height);rainHaze.addColorStop(0,'rgba(165,194,213,0)');rainHaze.addColorStop(1,'rgba(165,194,213,.1)');ctx.fillStyle=rainHaze;ctx.fillRect(0,0,width,height);
    }
    if (kind === 'snow') {
      precipitation.forEach(flake=>{
        const y=((flake.y+time*.055*flake.z)%1.2)*height-height*.1;
        const x=((flake.x+Math.sin(time*.42+flake.phase)*.025+time*.008)%1.1)*width;
        ctx.fillStyle=`rgba(244,251,255,${.35+flake.z*.55})`;
        ctx.beginPath();ctx.arc(x,y,.75+flake.z*1.45,0,Math.PI*2);ctx.fill();
      });
    }
    if (kind === 'thunder' && !reduced.matches) {
      const phase=time%13;
      const flash=(phase>7.6&&phase<7.72)?.25:(phase>7.86&&phase<7.94)?.13:0;
      if(flash){ctx.fillStyle=`rgba(201,217,255,${flash})`;ctx.fillRect(0,0,width,height);}
    }
    // A soft scrim anchors white labels without flattening the sky on the right.
    const shade=ctx.createLinearGradient(0,0,width,0);shade.addColorStop(0,day?'rgba(10,34,55,.39)':'rgba(3,12,27,.28)');shade.addColorStop(.58,'rgba(7,24,43,.11)');shade.addColorStop(1,'rgba(7,24,43,0)');ctx.fillStyle=shade;ctx.fillRect(0,0,width,height);
    const floor=ctx.createLinearGradient(0,height*.6,0,height);floor.addColorStop(0,'rgba(8,26,43,0)');floor.addColorStop(1,day?'rgba(8,26,43,.23)':'rgba(3,12,27,.33)');ctx.fillStyle=floor;ctx.fillRect(0,0,width,height);
  }

  function frame(now) {
    if(disposed || document.hidden || reduced.matches){raf=0;return;}
    if(now-lastFrame>=32){paint(now);lastFrame=now;}
    raf=requestAnimationFrame(frame);
  }
  function resume() {
    if(disposed)return;
    if(raf){cancelAnimationFrame(raf);raf=0;}
    if(!document.hidden){paint(performance.now());if(!reduced.matches)raf=requestAnimationFrame(frame);}
  }
  function resize() {
    if(disposed)return;
    const rect=card.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);paint(performance.now());
  }
  const observer=new ResizeObserver(resize);observer.observe(card);
  document.addEventListener('visibilitychange',resume);
  reduced.addEventListener('change',resume);
  resize();resume();
  return () => {
    disposed=true;if(raf)cancelAnimationFrame(raf);observer.disconnect();document.removeEventListener('visibilitychange',resume);reduced.removeEventListener('change',resume);scene.remove();
  };
}
