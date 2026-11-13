'use strict';

const melodyPhraseBlocks={arc:'Singende Bögen',blues:'Blues-Phrasen',hook:'Kurze Hooks',run:'Schnelle Läufe'};
const melodyModes={solo:'Eigenes Solo passend zu Riff und Groove',riff:'Riffmotiv melodisch weiterentwickeln'};
const melodyTechniqueLabels={hammer:'Hammer-ons',pull:'Pull-offs',bend:'Bendings'};
const melodyStyleProfiles={
  stoner:{weights:{arc:4,blues:4,hook:2,run:1},description:'Stoner Rock: weite Phrasen, bluesige Antworten und Raum für lange Gitarrentöne.'},
  punk:{weights:{arc:1,blues:1,hook:5,run:2},description:'Punk Rock: kurze, direkte Hooks mit klaren Wiederholungen und knappen Antworten.'},
  hard:{weights:{arc:3,blues:4,hook:3,run:2},description:'Hard Rock: singende Motive, bluesige Wendungen und gezielte schnelle Übergänge.'},
  numetal:{weights:{arc:2,blues:1,hook:5,run:1},description:'Nu Metal: rhythmisch prägnante Hooks und freier Raum zwischen schweren Riff-Akzenten; Läufe nur als gezielte Kontraste.'},
  korn:{weights:{arc:4,blues:1,hook:4,run:1},description:'Korn-inspiriert: atmosphärische Bögen und kantige Antworten auf das tiefe Riff. Eigene Melodien statt kopierter Band-Phrasen.'},
};
function defaultMelodyOptions(){return {mode:'solo',blocks:Object.keys(melodyPhraseBlocks),techniques:{hammer:false,pull:false,bend:false}};}
function readMelodyOptions(value){
  if(value===undefined)return defaultMelodyOptions();
  const {mode,blocks,techniques}=value??{};
  if(!Object.hasOwn(melodyModes,mode)||!Array.isArray(blocks)||!blocks.length||blocks.length>4||new Set(blocks).size!==blocks.length||blocks.some(b=>!Object.hasOwn(melodyPhraseBlocks,b)))throw new Error('Ungültige Melodie-Bausteine oder Arbeitsweise.');
  if(!techniques||Object.keys(melodyTechniqueLabels).some(k=>typeof techniques[k]!=='boolean'))throw new Error('Ungültige Melodie-Spieltechniken.');
  return {mode,blocks:Object.keys(melodyPhraseBlocks).filter(k=>blocks.includes(k)),techniques:Object.fromEntries(Object.keys(melodyTechniqueLabels).map(k=>[k,techniques[k]]))};
}
function melodyLegatoPossible(from,to,tuning='dropd'){
  return Math.abs(from-to)>=1&&Math.abs(from-to)<=4&&guitarTunings[tuning].notes.some(open=>Math.min(from,to)>=open&&Math.max(from,to)-open<=22);
}
const recentMelodies=new Map();
function composeMelody(config,settings,riff,drums,random=Math.random){
  const options=readMelodyOptions(settings.melody),profile=melodyStyleProfiles[config.style]??melodyStyleProfiles.stoner;
  const count=config.bars??riff.length,pool=melodyPitches(config),tuning=config.tuning??'dropd';
  const choose=values=>values[Math.min(values.length-1,Math.floor(random()*values.length))];
  const family=()=>choose(options.blocks.flatMap(k=>Array(profile.weights[k]).fill(k)));
  const indexFor=target=>pool.reduce((best,p,i)=>Math.abs(p-target)<Math.abs(pool[best]-target)?i:best,0);
  const indexForPitchClass=pitch=>{
    const matches=pool.map((p,i)=>({p,i})).filter(v=>(v.p-pitch+120)%12===0);
    return matches.length?matches.reduce((best,v)=>Math.abs(v.p-74)<Math.abs(best.p-74)?v:best).i:indexFor(pitch+24);
  };
  const tonicIndex=indexForPitchClass(config.key);
  const atIndex=i=>pool[Math.max(0,Math.min(pool.length-1,i))];
  const key=JSON.stringify([config.style,config.key,config.scale,tuning,count,settings,riff,drums]),recent=recentMelodies.get(key)??[];
  let result;
  for(let attempt=0;attempt<12;attempt++){
    const main=family(),answer=family(),excursion=choose([2,3,4]),direction=choose([-1,1]);
    const events=[];
    for(let bar=0;bar<count;bar++){
      const block=bar%4===3?answer:main,response=bar%4>=2;
      const notes=riff[bar]??[];
      const harmony=notes[0]?.root??tonic(config.key),anchor=indexForPitchClass(harmony);
      let steps=block==='arc'?[0,6,11]:block==='blues'?[1,4,7,11]:block==='hook'?[2,5,10]:Array.from({length:4+settings.density},(_,i)=>2+i*(settings.density>=4?1:2)).filter(s=>s<15);
      if(settings.density===1&&block!=='run')steps=[steps[0],steps.at(-1)];
      if(settings.density>=4&&block!=='run')steps=[...new Set([...steps,8,14])].sort((a,b)=>a-b);
      if(settings.rhythm==='spacious')steps=steps.filter((_,i)=>i%2===0);
      if(settings.rhythm==='straight')steps=[...new Set(steps.map(s=>Math.min(14,Math.round(s/2)*2)))];
      if(settings.rhythm==='syncopated')steps=steps.map((s,i)=>i===0?s:Math.min(15,s+(i%2)));
      const riffMode=options.mode==='riff'&&notes.length;
      if(riffMode){
        const limit=Math.min(notes.length,block==='run'?4+settings.density:2+settings.density);
        steps=notes.filter((_,i)=>i===0||i%Math.max(1,Math.ceil(notes.length/limit))===0).map(n=>n.step);
        if(block==='run'&&settings.density>=3)for(const n of notes)if(n.step<14&&!steps.includes(n.step+1))steps.push(n.step+1);
      }else{
        // The first phrase accent may answer a real drum accent, without copying every hit.
        const accents=drums?.[bar]?.flatMap((hits,step)=>hits.some(h=>h.kind==='snare'||h.kind==='kick')?[step]:[])??[];
        const candidate=accents.find(s=>s>=steps[0]&&s<=steps[0]+2);
        if(candidate!==undefined)steps[0]=candidate;
      }
      steps=[...new Set(steps)].sort((a,b)=>a-b);
      steps.forEach((step,i)=>{
        let degree;
        if(block==='arc')degree=Math.round(Math.sin(i/Math.max(1,steps.length-1)*Math.PI)*excursion)*direction;
        else if(block==='blues')degree=[0,2,1,0,-1][i%5];
        else if(block==='hook')degree=[0,1,0,2][i%4];
        else degree=direction*(i%6);
        if(settings.movement==='rise')degree=Math.min(5,i);
        if(settings.movement==='fall')degree=Math.max(-5,-i);
        if(settings.movement==='steps')degree=(i%3)-1;
        if(settings.movement==='leaps')degree=i%2?excursion:0;
        if(settings.movement==='arch')degree=Math.round(Math.sin(i/Math.max(1,steps.length-1)*Math.PI)*excursion);
        if(response&&settings.movement!=='repeat'&&i===steps.length-1)degree=0;
        let pitch=atIndex(anchor+degree);
        if(block==='blues'){
          const bluesPool=pool.filter(p=>[0,3,5,6,7,10].includes((p-config.key+120)%12));
          if(bluesPool.length)pitch=bluesPool.reduce((best,p)=>Math.abs(p-pitch)<Math.abs(best-pitch)?p:best,bluesPool[0]);
        }
        if(riffMode){
          const source=notes.filter(n=>n.step<=step).at(-1)??notes[0];
          pitch=atIndex(indexForPitchClass(source.root)+(response&&i===steps.length-1?0:block==='run'&&step!==source.step?direction:0));
        }
        if(bar===count-1&&i===steps.length-1)pitch=atIndex(tonicIndex);
        const length=block==='arc'?(settings.character==='wide'?12:8):block==='run'?1:block==='blues'?3:2;
        events.push({position:bar*16+step,root:pitch,length});
      });
    }
    events.sort((a,b)=>a.position-b.position);
    result=Array.from({length:count},()=>[]);
    events.forEach((event,i)=>{
      const next=events[i+1]?.position??count*16,length=Math.max(1,Math.min(event.length,next-event.position));
      const note={step:event.position%16,root:event.root,length,articulation:'single'};
      const previous=events[i-1],joined=previous&&previous.position+Math.min(previous.length,event.position-previous.position)===event.position;
      const interval=previous?event.root-previous.root:0;
      const techniqueChance=config.style==='punk'?.12:.3;
      if(joined&&melodyLegatoPossible(previous.root,note.root,tuning)&&random()<techniqueChance){
        if(interval>0&&options.techniques.hammer)note.transition='hammer';
        if(interval<0&&options.techniques.pull)note.transition='pull';
      }
      if(!note.transition&&options.techniques.bend&&length>=3&&random()<.25){
        const cents=pool.includes(note.root+2)?200:pool.includes(note.root+1)?100:0;
        if(cents&&guitarTunings[tuning].notes.some(open=>note.root>open&&note.root-open<=22))Object.assign(note,{expression:'bend',bendCents:cents,bendShape:cents===200?'up-return':undefined});
      }
      result[Math.floor(event.position/16)].push(note);
    });
    if(!recent.includes(JSON.stringify(result)))break;
  }
  recent.push(JSON.stringify(result));recentMelodies.set(key,recent.slice(-10));if(recentMelodies.size>50)recentMelodies.delete(recentMelodies.keys().next().value);
  return result;
}
function melodyBlocksPrompt(settings,style){
  const p=readMelodyOptions(settings.melody),allowed=Object.keys(p.techniques).filter(k=>p.techniques[k]);
  return 'MELODIE-BAUSTEINE: '+p.blocks.map(k=>melodyPhraseBlocks[k]).join(', ')+'. Arbeitsweise: '+melodyModes[p.mode]+'. '+(melodyStyleProfiles[style]??melodyStyleProfiles.stoner).description+' '+(p.mode==='riff'?'Rhythmische und tonale Kontur des vorhandenen Riffs erkennbar weiterentwickeln, in die Sololage übertragen und mit kleinen Antworten variieren.':'Eigene zusammenhängende Solophrasen mit Bezug zu Riff-Akzenten, Harmonietönen und Drum-Groove. Nicht jeden Anschlag verdoppeln.')+' Ausschließlich Töne der gewählten Tonleiter. Blues-Phrasen beziehen sich auf Phrasierung; keine tonleiterfremden Blues-Töne einschleusen. Einstimmig, keine überlappenden Noten; lange Töne dürfen Riffanschläge und Taktgrenzen überklingen. Pausen und erkennbare Motive mit kleinen Variationen. Freigegebene Techniken: '+(allowed.map(k=>melodyTechniqueLabels[k]).join(', ')||'keine, nur normale Töne')+'. Nicht freigegebene Techniken weglassen; keine automatischen Slides oder Vibratos. hammer nur aufwärts, pull nur abwärts, 1–4 Halbtöne, direkt verbundene Noten auf derselben spielbaren Saite. Bendings sparsam auf langen gegriffenen Tönen, Halbton/Ganzton hoch und zurück, Zielton ebenfalls in der Tonleiter. JSON technique: none'+(p.techniques.hammer?', hammer':'')+(p.techniques.pull?', pull':'')+(p.techniques.bend?', bend-half, bend-up-return':'')+'. Vorhandene Begleitspuren erhalten.';
}
function renderMelodyOctaveButtons(){
  const notes=melodySource()?.flat()??[];
  for(const [name,shift] of [['down',-12],['up',12]]){
    get('melody-octave-'+name).disabled=!notes.length||historyLocked('melody')||notes.some(n=>[n.root,...(n.from===undefined?[]:[n.from])].some(p=>p+shift<0||p+shift>127));
  }
}
function renderMelodyBlocks(){
  renderMelodyOctaveButtons();
  get('melody-sound').value=composeSettings.melody.sound??'riff';
  const p=composeSettings.melody.melody;
  get('melody-compose-mode').value=p.mode;
  for(const k of Object.keys(melodyPhraseBlocks))get('melody-block-'+k).checked=p.blocks.includes(k);
  for(const k of Object.keys(melodyTechniqueLabels))get('melody-allow-'+k).checked=p.techniques[k];
  const missing=p.mode==='riff'&&!selected.guitar.flat().length;
  get('generate-melody').disabled=Boolean(chatComparison)||missing;
  get('generate-melody').title=missing?'Erzeuge oder zeichne zuerst ein Riff.':'';
  get('melody-style-description').textContent=(melodyStyleProfiles[config.style]??melodyStyleProfiles.stoner).description+(missing?' Für „Riffmotiv weiterentwickeln“ wird ein vorhandenes Riff benötigt.':'');
}
function bindMelodyBlocks(){
  for(const [name,shift] of [['down',-12],['up',12]])get('melody-octave-'+name).addEventListener('click',()=>{
    if(get('melody-octave-'+name).disabled)return;
    const source=melodySource();
    const bars=source.map(notes=>notes.map(note=>({...note,root:note.root+shift,...(note.from===undefined?{}:{from:note.from+shift}),...(note.voicing?{voicing:undefined}:{})})));
    commitMelody(bars);
    get('melody-octave-status').textContent='Gesamte Melodie des geöffneten Teils eine Oktave '+(shift<0?'tiefer.':'höher.');
  });
  get('melody-sound').addEventListener('change',e=>{
    const tone=e.target.value;if(!['riff','dark'].includes(tone))return;
    composeSettings={...composeSettings,melody:{...composeSettings.melody,sound:tone}};
    saveSection();if(sound)sound.setLeadTone(currentLeadTone());
    get('melody-block-status').textContent=tone==='riff'?'Melodieklang: wie offenes Riff · schmaleres Stereo.':'Melodieklang: dunkel & fett · schmaleres Stereo.';
  });
  const update=patch=>{endComparison();composeSettings={...composeSettings,melody:{...composeSettings.melody,melody:readMelodyOptions({...composeSettings.melody.melody,...patch})}};renderMelodyBlocks();saveSection();};
  get('melody-compose-mode').addEventListener('change',e=>update({mode:e.target.value}));
  for(const k of Object.keys(melodyPhraseBlocks))get('melody-block-'+k).addEventListener('change',e=>{
    const current=composeSettings.melody.melody.blocks,blocks=e.target.checked?[...current,k]:current.filter(v=>v!==k);
    if(!blocks.length){renderMelodyBlocks();get('melody-block-status').textContent='Mindestens einen Melodie-Baustein auswählen.';return;}update({blocks});
  });
  for(const k of Object.keys(melodyTechniqueLabels))get('melody-allow-'+k).addEventListener('change',e=>update({techniques:{...composeSettings.melody.melody.techniques,[k]:e.target.checked}}));
  get('generate-melody').addEventListener('click',()=>{
    if(get('generate-melody').disabled)return;
    const lead=composeMelody({...config,bars:selected.guitar.length},composeSettings.melody,selected.guitar,selected.drums);
    melodyEdited=true;get('mute-lead').checked=false;
    refresh({lead},{lead:true,keepLead:true});get('melody-block-status').textContent='Neue Melodie · '+melodyModes[composeSettings.melody.melody.mode]+'. Begleitspuren bleiben erhalten.';
    return restartGeneratedPlayback();
  });
}
