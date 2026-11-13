'use strict';

// Complete groove families; instruments are composed together, never copied from the riff.
const drumGrooveBlocks={backbeat:'Klarer Backbeat',halftime:'Schwerer Halftime',drive:'Treibender Puls',sync:'Synkopierter Groove',toms:'Tom-Groove',space:'Luftiger Groove'};
const drumStyleProfiles={
  stoner:{name:'Stoner Rock',weights:{backbeat:3,halftime:3,drive:1,sync:2,toms:3,space:2},kick:[0,6,8,10,14],ghost:.22,open:.35,fill:4,description:'Schwerer, entspannter Groove mit tragenden Backbeats, bewussten Lücken und runden Tom-Antworten.'},
  punk:{name:'Punk Rock',weights:{backbeat:2,halftime:1,drive:5,sync:2,toms:1,space:1},kick:[0,2,6,8,10,14],ghost:.08,open:.18,fill:4,description:'Direkter Achtel-Vortrieb, deutliche Snare und kurze Übergänge. Das gewählte Songtempo bleibt unverändert.'},
  hard:{name:'Hard Rock',weights:{backbeat:5,halftime:1,drive:3,sync:2,toms:1,space:1},kick:[0,6,8,10],ghost:.1,open:.28,fill:4,description:'Stabiler Backbeat, klarer Beckenpuls und gezielte Kick-Variationen. Wenige prägnante Fills statt dauernder Verzierungen.'},
  numetal:{name:'Nu Metal',weights:{backbeat:2,halftime:3,drive:1,sync:5,toms:2,space:2},kick:[0,3,6,7,10,11,14],ghost:.25,open:.22,fill:4,description:'Synkopierte Kick-Gruppen, harte Stopps und Halftime-Kontraste; ein eigenständiger Groove mit rhythmischem Druck.'},
  korn:{name:'Korn',weights:{backbeat:2,halftime:2,drive:1,sync:5,toms:4,space:2},kick:[0,2,3,6,10,11,14,15],ghost:.42,open:.4,fill:4,description:'Korn-inspirierter Funk-/Metal-Groove mit bewegter Kick, leisen Snare-Zwischentönen, Tom-Antworten und klarer Dynamik. Eigenständige Ideen statt kopierter Songbeats.'},
};
function defaultDrumBlocks(){return Object.keys(drumGrooveBlocks);}
function readDrumBlocks(value){
  if(value===undefined)return defaultDrumBlocks();
  if(!Array.isArray(value)||!value.length||value.length>6||new Set(value).size!==value.length||value.some(k=>!Object.hasOwn(drumGrooveBlocks,k)))throw new Error('Mindestens einen gültigen Drum-Groove auswählen.');
  return Object.keys(drumGrooveBlocks).filter(k=>value.includes(k));
}
let drumTake=0;
const recentDrums=new Map();
function composeDrums(config,settings,random=Math.random){
  const blocks=readDrumBlocks(settings.blocks),profile=drumStyleProfiles[config.style]??drumStyleProfiles.stoner;
  const count=config.bars??4,density=settings.density,take=++drumTake;
  const choose=values=>values[Math.min(values.length-1,Math.floor(random()*values.length))];
  const shuffled=items=>{const values=[...items];for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;};
  const weighted=()=>choose(blocks.flatMap(id=>Array(profile.weights[id]).fill(id)));
  const key=JSON.stringify([config.style,count,settings]),previous=recentDrums.get(key)??[];
  let result;
  for(let attempt=0;attempt<12;attempt++){
    const main=weighted(),answer=weighted();
    function groove(family){
      const half=family==='halftime',airy=family==='space'||settings.rhythm==='spacious';
      const snares=half?[8]:[4,12];
      const kicks=family==='drive'?[0,2,8,10]:family==='sync'?[0,choose(profile.kick.filter(p=>p%4!==0))]:family==='space'?[0]:[0,8];
      if(density>=3)for(const at of shuffled(profile.kick).slice(0,density-2))if(!kicks.includes(at))kicks.push(at);
      if(settings.rhythm==='syncopated'&&density>=2)kicks.push(choose([3,7,11,15]));
      const cymbalStride=airy?4:density===1?4:2;
      const cymbals=Array.from({length:16/cymbalStride},(_,i)=>i*cymbalStride);
      if(density===5&&!airy&&family==='drive')for(const at of [3,7,11,15])cymbals.push(at);
      // Explicit straight timing uses only eighth-note positions for the main groove.
      const positions=values=>[...new Set(values.map(p=>settings.rhythm==='straight'?Math.min(14,Math.round(p/2)*2):p))].sort((a,b)=>a-b);
      return {family,kicks:positions(kicks),snares,cymbals:positions(cymbals),opening:random()<profile.open,ghosts:random()<profile.ghost?shuffled([3,7,11,15]).slice(0,Math.max(0,density-2)):[]};
    }
    const A=groove(main),B=groove(answer);
    result=Array.from({length:count},(_,bar)=>{
      const base=bar%4===3?B:A,beats=Array.from({length:16},()=>[]);
      const rise=settings.movement==='rise'?bar%4/3:settings.movement==='fall'?1-bar%4/3:settings.movement==='arch'?1-Math.abs(bar%4-1.5)/1.5:.5;
      const strength=(settings.character==='heavy'?1.04:settings.character==='wide'?.88:1)+ (rise-.5)*.08;
      function add(step,kind,velocity=drumVoice[kind].velocity){
        if(step<0||step>15||beats[step].some(h=>h.kind===kind))return;
        const hands=beats[step].filter(h=>h.kind!=='kick');
        if(kind!=='kick'&&hands.length>=2)return;
        if(['hat','open'].includes(kind)&&hands.some(h=>['hat','open'].includes(h.kind)))return;
        beats[step].push({kind,velocity:Math.max(.12,Math.min(1,velocity*strength*(.94+random()*.12)))});
      }
      for(const step of base.kicks)add(step,'kick');
      for(const step of base.snares)add(step,'snare',.86);
      for(const step of base.cymbals){
        const kind=base.family==='toms'?(step%8===0?'tom':'tom-mid'):base.opening&&step===14?'open':'hat';
        add(step,kind,kind==='hat'?(step%4===0?.48:.34):kind==='open'?.44:.64);
      }
      if(settings.rhythm!=='straight')for(const step of base.ghosts)add(step,'snare',.24);
      // Subtle second/third-bar answers keep the main groove recognisable.
      if(density>=3&&bar%4===2&&settings.movement!=='repeat')add(choose(profile.kick),'kick',.77);
      if(settings.character==='raw'&&bar%4===0){beats[0]=beats[0].filter(h=>h.kind==='kick'||h.kind==='snare');add(0,'crash',.52);}
      // A short complete-groove turnaround every four bars uses all three available toms.
      if(bar%4===3&&density>=2){
        const fillSteps=density>=4?[12,13,14,15]:[10,12,14];
        const toms=settings.movement==='rise'?['tom','tom-mid','tom-high']:['tom-high','tom-mid','tom'];
        for(let i=0;i<fillSteps.length;i++){
          const step=fillSteps[i];beats[step]=beats[step].filter(h=>h.kind==='kick'||h.kind==='snare');
          add(step,toms[Math.min(2,i)],.68+Math.min(.15,i*.04));
        }
      }
      return beats;
    });
    if(!previous.includes(JSON.stringify(result)))break;
  }
  previous.push(JSON.stringify(result));recentDrums.set(key,previous.slice(-10));if(recentDrums.size>100)recentDrums.delete(recentDrums.keys().next().value);
  return result;
}
function drumBlocksPrompt(settings,style){
  const ids=readDrumBlocks(settings.blocks),profile=drumStyleProfiles[style]??drumStyleProfiles.stoner;
  return 'DRUM-GROOVE-BAUSTEINE: '+ids.map(k=>drumGrooveBlocks[k]).join(', ')+'. Komplette Grooves daraus auswählen und über Takte kombinieren, mit wiedererkennbarem Hauptgroove und kurzen Antworten. '+profile.description+' Eigenständiger Groove passend zum Musikstil und Tempo. Kick NICHT automatisch aus den Riffanschlägen ableiten oder verdoppeln. Vorhandene Begleitspuren unverändert lassen. Dichte, Rhythmus, Akzentbewegung und Charakter beachten. Dezente Übergänge mit hoher Tom, mittlerer Tom und Standtom, ohne Backbeat und Puls zu verlieren. Höchstens zwei Handinstrumente gleichzeitig plus Kick; keine offene und geschlossene Hi-Hat gleichzeitig. Nur die vorhandenen Instrumente verwenden.';
}
function renderDrumBlocks(){
  for(const key of Object.keys(drumGrooveBlocks))get('drum-block-'+key).checked=composeSettings.drums.blocks.includes(key);
  get('drum-style-description').textContent=(drumStyleProfiles[config.style]??drumStyleProfiles.stoner).description;
  get('generate-drums').disabled=get('lock-drums').checked||Boolean(chatComparison);
}
function bindDrumBlocks(){
  for(const key of Object.keys(drumGrooveBlocks))get('drum-block-'+key).addEventListener('change',event=>{
    const current=composeSettings.drums.blocks,next=event.target.checked?[...current,key]:current.filter(k=>k!==key);
    if(!next.length){renderDrumBlocks();get('drum-block-status').textContent='Mindestens einen Groove-Baustein auswählen.';return;}
    endComparison();composeSettings={...composeSettings,drums:{...composeSettings.drums,blocks:readDrumBlocks(next)}};renderDrumBlocks();saveSection();
    get('drum-block-status').textContent='Groove-Auswahl gespeichert. Vorhandene Noten bleiben erhalten.';
  });
  get('generate-drums').addEventListener('click',()=>{
    if(get('generate-drums').disabled)return;
    const drums=composeDrums({...config,bars:selected.guitar.length},composeSettings.drums);
    grooveName='Neuer '+(drumStyleProfiles[config.style]?.name??'Drum')+'-Groove';
    refresh({drums},{drums:true});get('drum-block-status').textContent='Neuer eigenständiger Groove. Die anderen Spuren bleiben erhalten.';
    return restartGeneratedPlayback();
  });
}
