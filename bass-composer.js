'use strict';

const bassTunings={dropd:{name:'Drop D · 4 Saiten · D–A–D–G',notes:[26,33,38,43]},a5:{name:'A Standard · 5 Saiten · A–D–G–C–F',notes:[21,26,31,36,41]}};
const bassModes={riff:'Riff mitspielen',root:'Einfacher Grundton-Groove',independent:'Eigenständige Basslinie'};
const bassPhraseBlocks={hold:'Lange Grundtöne',pulse:'Rhythmischer Puls',octave:'Oktavsprünge',run:'Kurze Läufe'};
const bassStyleProfiles={
  stoner:{weights:{hold:4,pulse:3,octave:2,run:1},description:'Stoner Rock: tiefes, tragendes Fundament mit Raum für lange Noten und melodische Antworten.'},
  punk:{weights:{hold:1,pulse:5,octave:2,run:2},description:'Punk Rock: direkter Achtelpuls, klare Grundtöne und kurze Übergänge.'},
  hard:{weights:{hold:2,pulse:4,octave:2,run:2},description:'Hard Rock: druckvoller Grundton-Puls mit Kick-Bezug und gezielten Oktaven oder Übergängen.'},
  numetal:{weights:{hold:2,pulse:5,octave:2,run:1},description:'Nu Metal: tiefe Ankertöne, synkopierte Gruppen und bewusste Lücken im Groove.'},
  korn:{weights:{hold:1,pulse:5,octave:3,run:1},description:'Korn-inspiriert: perkussive rhythmische Antworten, tiefe Anker und gezielte Oktavkontraste. Eigene Figuren mit Raum für Riff und Drums.'},
};
function defaultBassOptions(){return {mode:'riff',blocks:Object.keys(bassPhraseBlocks),tuning:'dropd'};}
function readBassOptions(value){
  if(value===undefined)return defaultBassOptions();
  const {mode,blocks,tuning}=value??{};
  if(!Object.hasOwn(bassModes,mode)||!Object.hasOwn(bassTunings,tuning)||!Array.isArray(blocks)||!blocks.length||blocks.length>4||new Set(blocks).size!==blocks.length||blocks.some(k=>!Object.hasOwn(bassPhraseBlocks,k)))throw new Error('Ungültige Bass-Bausteine, Arbeitsweise oder Stimmung.');
  return {mode,blocks:Object.keys(bassPhraseBlocks).filter(k=>blocks.includes(k)),tuning};
}
function effectiveBassMode(mode,riff){return mode==='riff'&&!riff?.some(notes=>notes.length)?'independent':mode;}
const recentBasses=new Map();
function composeBass(config,settings,riff,drums,random=Math.random){
  const requested=readBassOptions(settings.bass),options={...requested,mode:effectiveBassMode(requested.mode,riff)},profile=bassStyleProfiles[config.style]??bassStyleProfiles.stoner;
  const count=config.bars??riff.length,pool=bassPitches({...config,bassTuning:options.tuning}),limit=count*16;
  const choose=values=>values[Math.min(values.length-1,Math.floor(random()*values.length))];
  const pickBlock=()=>choose(options.blocks.flatMap(k=>Array(profile.weights[k]).fill(k)));
  const indexFor=pitch=>{
    const matches=pool.map((p,i)=>({p,i})).filter(v=>(v.p-pitch+120)%12===0);
    return matches.length?matches.reduce((best,v)=>Math.abs(v.p-(pitch-12))<Math.abs(best.p-(pitch-12))?v:best).i:pool.reduce((best,p,i)=>Math.abs(p-(pitch-12))<Math.abs(pool[best]-(pitch-12))?i:best,0);
  };
  const home=pool.findIndex(p=>p%12===config.key),at=i=>pool[Math.max(0,Math.min(pool.length-1,i))];
  const key=JSON.stringify([config.style,config.key,config.scale,count,settings,riff,drums]),recent=recentBasses.get(key)??[];
  let result;
  for(let attempt=0;attempt<12;attempt++){
    const main=pickBlock(),answer=pickBlock(),direction=choose([-1,1]),events=[];
    for(let bar=0;bar<count;bar++){
      const block=bar%4===3?answer:main,notes=riff[bar]??[];
      const kicks=drums?.[bar]?.flatMap((hits,step)=>hits.some(h=>h.kind==='kick')?[step]:[])??[];
      let steps=block==='hold'?[0,8]:block==='octave'?[0,6,8,14]:block==='run'?[0,8,10,12,14]:Array.from({length:settings.density<=2?4:8},(_,i)=>i*(settings.density<=2?4:2));
      if(block==='hold'&&settings.density<=2)steps=[0];
      if(settings.density===1&&block!=='hold')steps=[steps[0],steps.at(-1)];
      if(settings.rhythm==='spacious')steps=steps.filter((_,i)=>i%2===0);
      if(settings.rhythm==='syncopated'||(settings.rhythm==='auto'&&['numetal','korn'].includes(config.style)))steps=steps.map((s,i)=>i%2?Math.min(15,s+1):s);
      if(options.mode==='riff'&&notes.length){
        steps=notes.map(n=>n.step);
        if(block==='hold')steps=steps.filter((_,i)=>i%Math.max(1,Math.ceil(notes.length/(settings.density<=2?1:2)))===0);
        if(block==='run'&&settings.density>=3)for(const n of notes.slice(-2))if(n.step<14)steps.push(n.step+1);
      }else if(options.mode==='root'){
        steps=block==='hold'?[0]:[...new Set([0,...kicks.slice(0,Math.max(1,settings.density))])];
        if(settings.density>=4&&block!=='hold')steps.push(8);
      }else if(kicks.length&&block==='pulse')steps[0]=kicks[0];
      if(settings.rhythm==='straight'&&options.mode!=='riff')steps=steps.map(s=>Math.min(14,Math.round(s/2)*2));
      steps=[...new Set(steps)].sort((a,b)=>a-b);
      steps.forEach((step,i)=>{
        const source=notes.filter(n=>n.step<=step).at(-1)??notes[0];
        const anchor=options.mode==='root'?home:source?indexFor(source.root):home;
        let degree=0;
        if(options.mode==='independent'){
          if(block==='octave')degree=i%2?scales[config.scale].length:0;
          if(block==='run')degree=i===0?0:direction*(i%4);
          if(block==='pulse')degree=i%4===3?choose([-1,1,2]):0;
          if(settings.movement==='rise')degree=i%5;
          if(settings.movement==='fall')degree=-(i%4);
          if(settings.movement==='steps')degree=i%3-1;
          if(settings.movement==='leaps')degree=i%2?scales[config.scale].length:0;
          if(settings.movement==='arch')degree=Math.round(Math.sin(i/Math.max(1,steps.length-1)*Math.PI)*3);
        }else if(block==='octave'&&i%2)degree=scales[config.scale].length;
        else if(block==='run'&&i>=steps.length-2&&options.mode!=='root')degree=direction*(steps.length-i);
        let root=at(anchor+degree);
        if(degree===scales[config.scale].length){const base=at(anchor);root=pool.includes(base+12)?base+12:pool.includes(base-12)?base-12:base;}
        const length=block==='hold'?16-step:block==='run'&&i>0?2:settings.character==='wide'?6:settings.character==='raw'?1:settings.character==='heavy'?4:['numetal','korn','punk'].includes(config.style)?2:3;
        events.push({position:bar*16+step,root,length});
      });
    }
    events.sort((a,b)=>a.position-b.position);result=Array.from({length:count},()=>[]);
    events.forEach((e,i)=>result[Math.floor(e.position/16)].push({step:e.position%16,root:e.root,length:Math.max(1,Math.min(e.length,(events[i+1]?.position??limit)-e.position)),articulation:'single',bassTuning:options.tuning}));
    if(!recent.includes(JSON.stringify(result)))break;
  }
  recent.push(JSON.stringify(result));recentBasses.set(key,recent.slice(-10));if(recentBasses.size>50)recentBasses.delete(recentBasses.keys().next().value);
  return result;
}
function bassBlocksPrompt(settings,style,mode){
  const p=readBassOptions(settings.bass),actualMode=mode??p.mode;
  return 'BASS-BAUSTEINE: '+p.blocks.map(k=>bassPhraseBlocks[k]).join(', ')+'. Arbeitsweise: '+bassModes[actualMode]+'. '+(bassStyleProfiles[style]??bassStyleProfiles.stoner).description+' Stimmung '+bassTunings[p.tuning].name+', tief nach hoch. Klang warm und leicht angezerrt. '+(actualMode==='riff'?'Wenn kein Riff vorhanden ist, automatisch eine eigenständige Basslinie passend zu Stil, Grundton, Tonart und Tempo erzeugen. Wenn ein Riff vorhanden ist, wichtige Einsätze und Grundtonbewegungen des Riffs in Basslage übertragen; die gewählten Bausteine gestalten Notenlängen und kleine Ergänzungen.':actualMode==='root'?'Einfacher tragender Song-Grundton, wenige Einsätze und Bezug zur Kick; keine eigenständigen Läufe.':'Eigenes zusammenhängendes Bassmotiv mit Bezug zu Riff-Harmonie und Drum-Groove; Pausen für Melodie und Gesang lassen.')+' Ausschließlich Töne der gewählten Tonleiter und Basslage. Einstimmig, keine Akkorde oder überlappenden Bassnoten. Lange Töne und kleine Variationen zulassen, Dichte/Rhythmus/Charakter beachten. Keine automatischen Spieltechniken. Vorhandene Begleitspuren erhalten.';
}
function renderBassBlocks(){
  const p=composeSettings.bass.bass;
  get('bass-compose-mode').value=p.mode;get('bass-tuning').value=p.tuning;
  for(const k of Object.keys(bassPhraseBlocks))get('bass-block-'+k).checked=p.blocks.includes(k);
  const missing=p.mode==='riff'&&!selected.guitar.flat().length;
  get('generate-bass').disabled=Boolean(chatComparison);
  get('generate-bass').title=missing?'Ohne Riff entsteht automatisch eine eigenständige Basslinie.':'';
  get('bass-style-description').textContent=(bassStyleProfiles[config.style]??bassStyleProfiles.stoner).description+(missing?' Noch kein Riff: Es entsteht automatisch eine eigenständige Basslinie.':'');
}
function bindBassBlocks(){
  const update=patch=>{endComparison();const bass=readBassOptions({...composeSettings.bass.bass,...patch});composeSettings={...composeSettings,bass:{...composeSettings.bass,bass}};bassStyle=bass.mode;renderBassBlocks();saveSection();renderBassGrid();renderTabView();};
  get('bass-compose-mode').addEventListener('change',e=>update({mode:e.target.value}));
  get('bass-tuning').addEventListener('change',e=>update({tuning:e.target.value}));
  for(const k of Object.keys(bassPhraseBlocks))get('bass-block-'+k).addEventListener('change',e=>{
    const current=composeSettings.bass.bass.blocks,blocks=e.target.checked?[...current,k]:current.filter(v=>v!==k);
    if(!blocks.length){renderBassBlocks();get('bass-block-status').textContent='Mindestens einen Bass-Baustein auswählen.';return;}update({blocks});
  });
  get('generate-bass').addEventListener('click',()=>{
    if(get('generate-bass').disabled)return;
    const bass=composeBass({...config,bars:selected.guitar.length},composeSettings.bass,selected.guitar,selected.drums);
    bassStyle=composeSettings.bass.bass.mode;commitBass(bass,'Neuer '+(bassStyleProfiles[config.style]?.name??'')+'-Bass');
    get('bass-block-status').textContent='Neue Bassspur · '+bassModes[effectiveBassMode(bassStyle,selected.guitar)]+'. Begleitspuren bleiben erhalten.';return restartGeneratedPlayback();
  });
}
