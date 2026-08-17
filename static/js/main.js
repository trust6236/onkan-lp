// 音感トレーニング紹介サイト — 動きの定義（全ページの最後で読み込まれる。デモの音はトップだけ）
/* =========================================================
   音を鳴らす（Web Audio API・音源ファイル不要）
   アプリ本体と同じ仕組みをそのまま移植しています。
   ========================================================= */
let ac=null, dry=null, wet=null;
const LEAD=.15;                       // 音を作る余裕（先読み時間）
function mtof(m){ return 440*Math.pow(2,(m-69)/12); }

function audio(){
  if(!ac){
    ac = new (window.AudioContext||window.webkitAudioContext)();
    const comp=ac.createDynamicsCompressor();          // 全体をやわらかくまとめる
    comp.threshold.value=-16; comp.knee.value=26; comp.ratio.value=3;
    comp.attack.value=.006;  comp.release.value=.28;
    comp.connect(ac.destination);
    dry=ac.createGain(); dry.gain.value=.90; dry.connect(comp);
    const cv=ac.createConvolver(); cv.buffer=makeIR(2.6,2.7);
    wet=ac.createGain(); wet.gain.value=.30; wet.connect(cv); cv.connect(comp);
    prewarm();
  }
  if(ac.state==='suspended') ac.resume();
  return ac;
}

/* 残響（部屋の響き）を作る */
function makeIR(sec,dk){
  const sr=ac.sampleRate, n=Math.floor(sr*sec), b=ac.createBuffer(2,n,sr);
  const pre=Math.floor(sr*.014);
  for(let ch=0;ch<2;ch++){
    const d=b.getChannelData(ch); let lp=0;
    for(let i=0;i<n;i++){
      const s=(Math.random()*2-1)*Math.pow(1-i/n,dk);
      lp=lp*.58+s*.42;
      d[i]= i<pre ? 0 : lp;
    }
  }
  return b;
}

/* ピアノ1音ぶんの波形を作って使い回す */
const CACHE=new Map();
function pianoBuf(midi){
  if(CACHE.has(midi)) return CACHE.get(midi);
  const sr=ac.sampleRate, f0=mtof(midi);
  const dur=Math.max(1.5,Math.min(7,5.0*Math.pow(2,-(midi-52)/24)));
  const n=Math.floor(sr*dur);
  const buf=ac.createBuffer(2,n,sr);
  const L=buf.getChannelData(0), R=buf.getChannelData(1);
  const B=.00012*Math.pow(2,(midi-60)/15);   // 弦の硬さ（インハーモニシティ）
  const NY=sr*.45;
  [{c:-1.2,g:1.0,p:.72},{c:1.4,g:.88,p:.28}].forEach(st=>{   // 弦2本をわずかにずらす
    const f=f0*Math.pow(2,st.c/1200);
    for(let k=1;k<=14;k++){
      const fk=f*k*Math.sqrt(1+B*k*k);
      if(fk>NY) break;
      const hammer=Math.abs(Math.sin(Math.PI*k/8));      // 打点による倍音の欠け
      const amp=st.g*Math.pow(k,-1.35)*(.45+.55*hammer);
      const dec=dur/(1+.7*(k-1));                        // 高い倍音ほど速く減衰
      const w=2*Math.PI*fk/sr, c2=2*Math.cos(w), ph=Math.random()*6.283;
      let y1=Math.sin(ph-w), y2=Math.sin(ph-2*w), a=amp;
      const ad=Math.exp(-6.9/(dec*sr));
      for(let i=0;i<n;i++){
        const y=c2*y1-y2; y2=y1; y1=y;
        const v=y*a; a*=ad;
        L[i]+=v*st.p; R[i]+=v*(1-st.p);
      }
    }
  });
  const an=Math.floor(sr*.035); let lp=0;                // 打鍵ノイズ
  for(let i=0;i<an;i++){
    const e=Math.pow(1-i/an,3);
    lp=lp*.6+(Math.random()*2-1)*.4;
    L[i]+=lp*e*.10; R[i]+=lp*e*.10;
  }
  const fa=Math.floor(sr*.0015); let peak=0;             // 頭のプチ音防止＋音量そろえ
  for(let i=0;i<n;i++){
    if(i<fa){ L[i]*=i/fa; R[i]*=i/fa; }
    const m=Math.max(Math.abs(L[i]),Math.abs(R[i])); if(m>peak) peak=m;
  }
  if(peak>0){ const g=.9/peak; for(let i=0;i<n;i++){ L[i]*=g; R[i]*=g; } }
  CACHE.set(midi,buf); return buf;
}
function prewarm(){                                      // デモで使う音域を裏で先に用意
  let m=43;
  const step=()=>{ if(m>76) return; pianoBuf(m++); setTimeout(step,25); };
  setTimeout(step,80);
}

function note(midi,t0,dur,vol){
  const c=audio();
  const v=Math.max(.02,vol||.25);
  const src=c.createBufferSource(); src.buffer=pianoBuf(midi);
  const f=c.createBiquadFilter();                        // 弱い音ほど柔らかい音色に
  f.type='lowpass'; f.Q.value=.4;
  f.frequency.value=Math.max(1800,Math.min(15000,2200+38000*v));
  const g=c.createGain();
  const rel=Math.max(.28,Math.min(.7,dur*.35));
  g.gain.setValueAtTime(v*1.2,t0);
  g.gain.setValueAtTime(v*1.2,t0+dur);
  g.gain.exponentialRampToValueAtTime(.0001,t0+dur+rel);
  src.connect(f); f.connect(g); g.connect(dry); g.connect(wet);
  src.start(t0); src.stop(t0+dur+rel+.05);
}
function playSeq(items){
  const c=audio(), t0=c.currentTime+LEAD;
  let end=0;
  items.forEach(it=>{
    (Array.isArray(it.n)?it.n:[it.n]).forEach((m,i)=> note(m, t0+it.t+i*.03, it.d||1.4, it.v||.20));
    end=Math.max(end, it.t+(it.d||1.4));
  });
  return end;                                            // 鳴り終わるまでの秒数
}

/* =========================================================
   耳で確かめる（デモ7本）── アプリ本体と同じ内容
   ========================================================= */
const DEMOS=[
{t:'① 明暗を決めているのは「3rd」', s:'長3度 ↔ 短3度',
 d:'Cmaj7 → Cm7 の順に鳴ります。動くのは <b>3rd の1音だけ（ミ→ミ♭）</b>。「メジャーかマイナーか」を耳で判断するというのは、この半音を聴き分けるということです。',
 p:()=>playSeq([{n:[60,64,67,71],t:0,d:2.0},{n:[60,63,67,70],t:2.4,d:2.4}])},
{t:'② おしゃれさを決めているのは「7th」', s:'長7度 ↔ 短7度',
 d:'Cmaj7 → C7。動くのは <b>7th の1音だけ（シ→シ♭）</b>。前は落ち着き、後は「まだ先がある」感じ。耳コピでコードを取り違える最大の原因がここです。',
 p:()=>playSeq([{n:[60,64,67,71],t:0,d:2.0},{n:[60,64,67,70],t:2.4,d:2.4}])},
{t:'③ トライトーンが「解決したい力」の正体', s:'増4度 → 解決',
 d:'まず G7 の中の <b>シ と ファ</b>（トライトーン）だけ。次に、それが半音ずつ外へ内へ動いて <b>ド と ミ</b> に解決します。この2音の動きが、II-V-I の推進力そのものです。',
 p:()=>playSeq([{n:[59,65],t:0,d:1.9},{n:[60,64],t:2.2,d:2.4}])},
{t:'④ ガイドトーン2音だけで進行が分かる', s:'Dm7 → G7 → Cmaj7 の 3rd と 7th',
 d:'各コードの <b>3rdと7thだけ</b>（＋ルート）を鳴らします。ファは残り、ド→シが半音。次はファ→ミが半音で、シは残る。<b>たった2音で進行が完全に分かります</b>。アドリブでここを狙えば、まず外れません。',
 p:()=>playSeq([{n:[50],t:0,d:1.7,v:.15},{n:[65,72],t:0,d:1.7},
                {n:[55],t:1.9,d:1.7,v:.15},{n:[65,71],t:1.9,d:1.7},
                {n:[48],t:3.8,d:2.6,v:.15},{n:[64,71],t:3.8,d:2.6}])},
{t:'⑤ 同じ形が4度ずつ移動していく', s:'完全4度',
 d:'ルートが4度ずつ上がります（C→F→B♭→E♭）。ジャズの曲はこの動きだらけ。だから音名でなく <b>度数</b> で覚えると、1つ覚えた形がそのまま12キーで使えます。',
 p:()=>playSeq([{n:[48,52,55,58],t:0,d:1.4},{n:[53,57,60,63],t:1.5,d:1.4},
                {n:[58,62,65,68],t:3.0,d:1.4},{n:[63,67,70,73],t:4.5,d:2.2}])},
{t:'⑥ テンションを足すと何が変わるか', s:'♭9th・13th',
 d:'ふつうの C7 → 色を足した C7(♭9,13)。<b>コードトーンは同じまま</b>で、上に乗る音だけが違います。アドリブで「ジャズっぽい」と感じる部分は、たいていここです。',
 p:()=>playSeq([{n:[48,52,58,64],t:0,d:2.0},{n:[48,52,58,61,69],t:2.4,d:2.6}])},
{t:'⑦ II-V-I をまるごと', s:'Dm7 → G7 → Cmaj7',
 d:'ジャズでいちばん多い進行です。この中で④のガイドトーンが動いています。聴きながら「いま緊張／いま解決」を追えるようになるのが当面のゴールです。',
 p:()=>playSeq([{n:[50,60,64,65,69],t:0,d:1.9},{n:[55,59,62,65,69],t:2.1,d:1.9},{n:[48,59,64,67,71],t:4.2,d:2.8}])}
];
(function(){
  const el=document.getElementById('demo-list');
  if(!el) return;                                        // トップ以外のページには無い
  el.innerHTML=DEMOS.map((x,i)=>`<div class="demo">
    <h3>${x.t}</h3><p class="s">${x.s}</p><p class="d">${x.d}</p>
    <button class="btn primary small play" data-i="${i}">▶ 聴いてみる</button></div>`).join('');
  el.querySelectorAll('.play').forEach(b=> b.onclick=()=>{
    if(b.classList.contains('playing')) return;
    const sec=DEMOS[+b.dataset.i].p();
    b.classList.add('playing'); b.textContent='♪ 再生中…';
    setTimeout(()=>{ b.classList.remove('playing'); b.textContent='▶ 聴いてみる'; }, (sec+.6)*1000);
  });
})();

/* =========================================================
   お問い合わせフォーム（contact.html）
   送信先は Google Apps Script のウェブアプリ。中身はスプレッドシートに記録され、
   制作者にメールで通知される。サーバーを持たない静的サイトでも、これで受け口が作れる。
   ========================================================= */
const CONTACT_URL='https://script.google.com/macros/s/AKfycbzX-gsSZHJoHuqnbqmTsyUzhKwzQB2-XaxjLBmk_jh93F66bxFrsLaKWcQCvRJaOSlS/exec';
(function(){
  const form=document.getElementById('contact-form');
  if(!form) return;                                      // お問い合わせページ以外には無い
  const st=document.getElementById('form-status');
  const btn=form.querySelector('button[type=submit]');
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const d=Object.fromEntries(new FormData(form).entries());
    if(!String(d.message||'').trim()){ st.className='muted'; st.textContent='内容を入力してください。'; form.message.focus(); return; }
    btn.disabled=true; st.className='muted'; st.textContent='送信中…';
    try{
      const r=await fetch(CONTACT_URL,{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},   // text/plain だと事前確認（preflight）が要らない
        body:JSON.stringify({name:d.name||'', email:d.email||'', message:d.message, website:d.website||'', page:location.href})
      });
      const j=await r.json();
      if(j.ok){ form.reset(); st.className='ok'; st.textContent='送信しました。ありがとうございます。'; }
      else{ st.className='muted'; st.textContent='送信できませんでした（'+(j.reason||'不明')+'）。'; btn.disabled=false; }
    }catch(err){
      st.className='muted'; st.textContent='送信に失敗しました。時間をおいて、もう一度お試しください。'; btn.disabled=false;
    }
  });
})();
