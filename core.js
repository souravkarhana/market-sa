// ===== CONFIG (change thresholds here) =====
const CFG = {OVERSOLD:20, OVERBOUGHT:80, FALL_DAYS:3, U4_FLUSH:250, NEUTRAL_MR:40, MIN_TURNOVER_CR:10, MIN_PRICE:10, W20_HIGH:20};
// ===========================================
function buildSeries(base, extra){
  // base: {dates, stocks:{S:{c,v}}}; extra: {date:{S:[close,prev,vol]}}
  const dates = base.dates.slice(); const stocks = {};
  for (const s in base.stocks){ const o = base.stocks[s];
    stocks[s] = {c:o.c.slice(), v:o.v.slice(), p:(o.p||o.c.map((x,i)=> i? o.c[i-1]: null)).slice()}; }
  const ex = Object.keys(extra||{}).sort();
  for (const d of ex){ if (dates.includes(d)) continue; dates.push(d); }
  dates.sort();
  for (const s in stocks){ while (stocks[s].c.length < dates.length){ stocks[s].c.push(null); stocks[s].v.push(null); stocks[s].p.push(null);} }
  for (const d of ex){ const di = dates.indexOf(d); const rows = extra[d];
    for (const s in rows){ if(!stocks[s]){ stocks[s]={c:Array(dates.length).fill(null),v:Array(dates.length).fill(null),p:Array(dates.length).fill(null)}; }
      stocks[s].c[di]=rows[s][0]; stocks[s].p[di]=rows[s][1]; stocks[s].v[di]=rows[s][2]; } }
  return {dates, stocks};
}
function computeMonitor(series){
  const {dates, stocks} = series; const n = dates.length; const names = Object.keys(stocks);
  const cnt = Array(n).fill(0), mrc = Array(n).fill(0), u4 = Array(n).fill(0), d4 = Array(n).fill(0), w20 = Array(n).fill(0);
  for (const s of names){ const {c,v,p} = stocks[s]; let ema = null;
    for (let i=0;i<n;i++){
      if (c[i]==null){ continue; }
      ema = ema==null ? c[i] : ema + (2/21)*(c[i]-ema);
      // 10-day average turnover
      let sum=0, k=0; for (let j=Math.max(0,i-9); j<=i; j++){ if (c[j]!=null && v[j]!=null){ sum+=c[j]*v[j]; k++; } }
      if (k<8) continue; if (sum/k/1e7 <= CFG.MIN_TURNOVER_CR || c[i] <= CFG.MIN_PRICE) continue;
      cnt[i]++; if (c[i] > ema) mrc[i]++;
      const pc = p[i]; const vPrev = i>0 ? v[i-1] : null;
      if (pc && vPrev!=null && v[i]!=null && v[i] > vPrev){ const r = c[i]/pc-1; if (r>=0.04) u4[i]++; else if (r<=-0.04) d4[i]++; }
      if (i>=5 && c[i-5] && c[i]/c[i-5] > 1.20) w20[i]++;
    } }
  const rows = [];
  for (let i=0;i<n;i++){ if(!cnt[i]) continue; rows.push({date:dates[i], eligible:cnt[i], mr20: mrc[i]/cnt[i]*100, u4:u4[i], d4:d4[i], w20:w20[i]}); }
  const sg = x => x>0?1:(x<0?-1:0);
  for (let i=0;i<rows.length;i++){ const r=rows[i]; const prev=rows[i-1];
    r.chg = prev ? r.mr20-prev.mr20 : null;
    r.up = prev && r.chg>0 ? (prev.up||0)+1 : 0; r.down = prev && r.chg<0 ? (prev.down||0)+1 : 0;
    let flips=0; if (i>=5){ for (let k=i-3;k<=i;k++){ if (sg(rows[k].chg)!==sg(rows[k-1].chg)) flips++; } }
    r.regime = 'Neutral';
    if (flips>=3) r.regime='Chop';
    if (r.mr20>=CFG.OVERBOUGHT) r.regime='Overbought';
    if (r.mr20>=CFG.OVERBOUGHT && r.w20>=CFG.W20_HIGH) r.regime='Overextended';
    if (r.down>=CFG.FALL_DAYS) r.regime='Falling';
    if (r.mr20<CFG.OVERSOLD) r.regime='Oversold';
    r.setup = setupFor(r); r.note = noteFor(r);
  }
  return rows;
}
function setupFor(r){
  if (r.u4>=CFG.U4_FLUSH) return 'Fresh swing: bottom bounce / long';
  switch(r.regime){
    case 'Oversold': return 'Bottom bounce';
    case 'Falling': return 'Reversal setups (no fresh longs yet)';
    case 'Overextended': return 'Parabolic short / caution, no fresh breakouts';
    case 'Overbought': return 'Caution: smaller size on breakouts, let winners run';
    case 'Chop': return 'SIIPS + Fades, avoid breakouts';
    default: return r.mr20>=CFG.NEUTRAL_MR ? 'Continuation + Breakout' : 'Wait: weak market, small size; watch for MR20 < 20 bounce';
  }
}
function noteFor(r){ const n=[]; if(r.up>=4) n.push('MR20 rising '+r.up+' days: caution on fresh entries'); if(r.w20>=CFG.W20_HIGH) n.push('W20 high: market stretched'); return n.join(' | '); }
function parseBhavcopy(text, fallbackDate){
  const lines = text.replace(/\r/g,'').split('\n').filter(l=>l.trim()); if(lines.length<2) throw new Error('Empty file');
  const head = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const find = (...names)=>{ for (const nm of names){ const i=head.indexOf(nm); if(i>=0) return i; } return -1; };
  const iS=find('tckrsymb','symbol'), iSer=find('sctysrs','series'), iC=find('clspric','close','close_price'), iP=find('prvsclsgpric','prevclose','prev_close'), iV=find('ttltradgvol','tottrdqty','volume','ttl_trd_qnty'), iD=find('traddt','bizdt','timestamp','date1');
  if (iS<0||iC<0||iP<0||iV<0) throw new Error('Columns not found. Need symbol, close, previous close, volume. Found: '+head.join(', '));
  const out={}; let date=null;
  for (let k=1;k<lines.length;k++){ const f=lines[k].split(','); if (iSer>=0 && f[iSer].trim()!=='EQ') continue;
    if (!date && iD>=0) date=f[iD].trim();
    const c=parseFloat(f[iC]), p=parseFloat(f[iP]), v=parseFloat(f[iV]); if(!(c>0)) continue; out[f[iS].trim()]=[c, p>0?p:null, isNaN(v)?null:v]; }
  if (date){ const m=date.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/); if(m){ const mo={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12}[m[2].toUpperCase()]; date=m[3]+'-'+String(mo).padStart(2,'0')+'-'+m[1]; } else date=date.slice(0,10); }
  return {date: date||fallbackDate, rows: out};
}
if (typeof module!=='undefined') module.exports={buildSeries,computeMonitor,parseBhavcopy,CFG};
