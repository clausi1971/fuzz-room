'use strict';

const vocalPhraseBlocks={arc:'Lange Gesangsbögen',hook:'Kurze Hooks',speech:'Rhythmische Sprechgesang-Figuren',answer:'Ruf & Antwort'};
const vocalStyleProfiles={
  stoner:{weights:{arc:5,hook:2,speech:1,answer:3},breath:4,description:'Stoner Rock: lange, ruhige Gesangsbögen und verwandte Antworten mit Raum zwischen den Phrasen.'},
  punk:{weights:{arc:1,hook:5,speech:2,answer:3},breath:2,description:'Punk Rock: kurze, einprägsame Hooks und rhythmisch direkte Antworten.'},
  hard:{weights:{arc:3,hook:4,speech:1,answer:3},breath:3,description:'Hard Rock: tragende Melodiebögen, klare Hooks und prägnante Ruf-und-Antwort-Phrasen.'},
  numetal:{weights:{arc:2,hook:4,speech:5,answer:3},breath:4,description:'Nu Metal: rhythmisch markante, sprechnahe Figuren im Wechsel mit melodischen Hooks und bewussten Pausen.'},
  korn:{weights:{arc:4,hook:3,speech:5,answer:4},breath:4,description:'Korn-inspiriert: Wechsel zwischen sprechnaher Rhythmik und dunklen singbaren Bögen. Eigene Motive mit Platz für das Arrangement.'},
};
function defaultVocalOptions(){return {blocks:Object.keys(vocalPhraseBlocks),sound:'ah'};}
function readVocalOptions(value){
  if(value===undefined)return defaultVocalOptions();
  const {blocks,sound}=value??{};
  if(!Array.isArray(blocks)||!blocks.length||blocks.length>4||new Set(blocks).size!==blocks.length||blocks.some(k=>!Object.hasOwn(vocalPhraseBlocks,k))||!['ah','guide'].includes(sound))throw new Error('Ungültige Gesangs-Bausteine oder Klangwahl.');
  return {blocks:Object.keys(vocalPhraseBlocks).filter(k=>blocks.includes(k)),sound};
}
const recentVocals=new Map();
function composeVocal(config,settings,range,riff,bass,drums,lead,random=Math.random){
  const options=readVocalOptions(settings.vocal),profile=vocalStyleProfiles[config.style]??vocalStyleProfiles.stoner;
  const pool=vocalPitches(config,range),count=config.bars??riff.length;
  const choose=values=>values[Math.min(values.length-1,Math.floor(random()*values.length))];
  const family=()=>choose(options.blocks.flatMap(k=>Array(profile.weights[k]).fill(k)));
  const near=(pitch,center)=>{const matches=pool.map((p,i)=>({p,i})).filter(v=>(v.p-pitch+120)%12===0);return matches.length?matches.reduce((a,b)=>Math.abs(b.p-center)<Math.abs(a.p-center)?b:a).i:pool.reduce((a,p,i)=>Math.abs(p-center)<Math.abs(pool[a]-center)?i:a,0);};
  const at=i=>pool[Math.max(0,Math.min(pool.length-1,i))],center=(pool[0]+pool.at(-1))/2,home=near(config.key,center);
  const key=JSON.stringify([config.style,config.key,config.scale,count,range,settings,riff,bass,drums,lead]),recent=recentVocals.get(key)??[];
  let result;
  for(let attempt=0;attempt<14;attempt++){
    const main=family(),answer=family(),height=choose([2,3,4]),direction=choose([-1,1]),startShift=choose([0,1,2]),phraseShift=choose([-1,0,1]),lengthScale=choose([.75,1,1.25]);
    result=Array.from({length:count},()=>[]);
    for(let bar=0;bar<count;bar+=2){
      const block=bar%4===0?main:answer,base=bar*16,end=Math.min((bar+2)*16,count*16)-profile.breath;
      const source=bass?.[bar]?.[0]?.root??riff[bar]?.[0]?.root??config.key;
      const leadPitch=lead?.[bar]?.[0]?.root;
      const anchor=near(source,leadPitch?Math.min(center,leadPitch-5):center);
      let steps=block==='arc'?[0,8,16,23]:block==='hook'?[2,6,10,18,22,26]:block==='speech'?[0,3,6,8,11,16,19,22,24,27]:[0,4,9,18,22,26];
      if(settings.density<=2)steps=steps.filter((_,i)=>i%2===0||i===steps.length-1);
      if(settings.density>=4&&block==='arc')steps=[0,6,12,18,24];
      if(settings.density===5&&block==='speech')steps.push(5,13,21,25);
      if(settings.rhythm==='spacious')steps=steps.filter((_,i)=>i%2===0);
      if(settings.rhythm==='straight')steps=steps.map(s=>Math.round(s/2)*2);
      if(settings.rhythm==='syncopated')steps=steps.map((s,i)=>i%2?s+1:s);
      steps=steps.map(s=>s+startShift);
      const accents=drums?.[bar]?.flatMap((hits,step)=>hits.some(h=>['kick','snare'].includes(h.kind))?[step]:[])??[];
      const first=accents.find(s=>s>=steps[0]&&s<=steps[0]+2);if(first!==undefined)steps[0]=first;
      steps=[...new Set(steps)].filter(s=>base+s<end).sort((a,b)=>a-b);
      steps.forEach((step,i)=>{
        let offset=block==='arc'?Math.round(Math.sin(i/Math.max(1,steps.length-1)*Math.PI)*height)*direction:block==='hook'?[0,1,0][i%3]:block==='speech'?[0,0,1,0,-1][i%5]:[0,2,1,1,0,-1][i%6];
        if(settings.movement==='rise')offset=Math.min(4,i);
        if(settings.movement==='fall')offset=-Math.min(4,i);
        if(settings.movement==='steps')offset=i%3-1;
        if(settings.movement==='leaps')offset=i%2?3:0;
        if(settings.movement==='arch')offset=Math.round(Math.sin(i/Math.max(1,steps.length-1)*Math.PI)*height);
        if(settings.movement==='repeat')offset=0;
        let root=at(anchor+phraseShift+offset*(block==='arc'?1:direction));
        if(bar+2>=count&&i===steps.length-1)root=at(home);
        const next=base+(steps[i+1]??(end-base));
        const natural=block==='arc'?(settings.character==='wide'?12:8):block==='speech'?(settings.character==='raw'?1:2):block==='hook'?3:4;
        const length=Math.max(1,Math.min(Math.round(natural*lengthScale),next-base-step,end-base-step));
        const position=base+step;result[Math.floor(position/16)].push({step:position%16,root,length,articulation:'single'});
      });
    }
    if(!recent.includes(JSON.stringify(result)))break;
  }
  recent.push(JSON.stringify(result));recentVocals.set(key,recent.slice(-12));if(recentVocals.size>40)recentVocals.delete(recentVocals.keys().next().value);
  return result;
}
function vocalBlocksPrompt(settings,style){
  const p=readVocalOptions(settings.vocal),profile=vocalStyleProfiles[style]??vocalStyleProfiles.stoner;
  return 'GESANGS-BAUSTEINE: '+p.blocks.map(k=>vocalPhraseBlocks[k]).join(', ')+'. Immer eine eigene zusammenhängende Gesangsmelodie passend zu Riff, Bass und Drums entwickeln, das Riff nicht einfach verdoppeln. '+profile.description+' Atempausen und Notenlängen automatisch passend zum Stil planen, mindestens eine deutliche Pause am Ende jeder Zweitaktphrase. Kleine singbare Tonschritte, erkennbare Motive und verwandte Antworten. Raum für die instrumentale Melodie lassen. Sprechgesang meint kurze rhythmische Tonfiguren, keinen Text oder Sprach-Audio. Keine Gitarren-Spieltechniken. Keine überlappenden Gesangsnoten. Klangwahl ist nur eine Hörhilfe und verändert die Noten nicht.';
}
function currentVocalTone(){
  const part=playback?.song?.[playback.songIndex];
  return part&&part.id!==activeSection?part.meta?.composeSettings?.vocal?.vocal?.sound??'ah':composeSettings.vocal.vocal.sound;
}
function renderVocalBlocks(){
  const p=composeSettings.vocal.vocal;get('vocal-sound').value=p.sound;
  for(const k of Object.keys(vocalPhraseBlocks))get('vocal-block-'+k).checked=p.blocks.includes(k);
  get('generate-vocal').disabled=Boolean(chatComparison);
  get('vocal-style-description').textContent=(vocalStyleProfiles[config.style]??vocalStyleProfiles.stoner).description;
}
function bindVocalBlocks(){
  const update=patch=>{endComparison();composeSettings={...composeSettings,vocal:{...composeSettings.vocal,vocal:readVocalOptions({...composeSettings.vocal.vocal,...patch})}};saveSection();renderVocalBlocks();};
  for(const k of Object.keys(vocalPhraseBlocks))get('vocal-block-'+k).addEventListener('change',e=>{
    const current=composeSettings.vocal.vocal.blocks,blocks=e.target.checked?[...current,k]:current.filter(x=>x!==k);
    if(!blocks.length){renderVocalBlocks();get('vocal-block-status').textContent='Mindestens einen Gesangs-Baustein auswählen.';return;}update({blocks});
  });
  get('vocal-sound').addEventListener('change',e=>{update({sound:e.target.value});if(sound)sound.setVocalTone(currentVocalTone());get('vocal-block-status').textContent='Klang wirkt ab dem nächsten Gesangston. Die Noten bleiben erhalten.';});
  get('generate-vocal').addEventListener('click',()=>{
    if(get('generate-vocal').disabled)return;
    const bars=composeVocal({...config,bars:selected.guitar.length},composeSettings.vocal,vocalRange,selected.guitar,selected.bass,selected.drums,selected.lead);
    commitVocal(bars,'Neue eigene Gesangsmelodie');get('vocal-block-status').textContent='Neue Gesangsmelodie mit stilabhängigen Atempausen. Begleitspuren bleiben erhalten.';return restartGeneratedPlayback();
  });
}
