'use strict';

const riffRhythmBlocks={pulse:'Gerader Puls',sync:'Synkopierter Groove',long:'Lange Anschläge',phrases:'Kurze Figuren mit Pausen'};
const riffMotionBlocks={pedal:'Wiederkehrender Grundton',steps:'Kleine Tonschritte',line:'Auf- und absteigende Linien',answer:'Tonsprung mit Antwort'};
const riffForms={aaab:{name:'A – A – A′ – B',bars:['A','A','A1','B']},abab:{name:'A – B – A – B′',bars:['A','B','A','B1']},aaba:{name:'A – A′ – B – A″',bars:['A','A1','B','A2']}};
function defaultRiffBlocks(){return {rhythms:Object.keys(riffRhythmBlocks),motions:Object.keys(riffMotionBlocks),form:'aaab'};}
function readRiffBlocks(value){
  if(value===undefined)return defaultRiffBlocks();
  const list=(items,labels)=>{
    if(!Array.isArray(items)||!items.length||items.length>Object.keys(labels).length||items.some(k=>!Object.hasOwn(labels,k))||new Set(items).size!==items.length)throw new Error('Wähle mindestens einen gültigen Riff-Baustein je Bereich.');
    return Object.keys(labels).filter(k=>items.includes(k));
  };
  if(!value||!Object.hasOwn(riffForms,value.form))throw new Error('Ungültiger Riff-Taktablauf.');
  return {rhythms:list(value.rhythms,riffRhythmBlocks),motions:list(value.motions,riffMotionBlocks),form:value.form};
}
let riffTake=0;
const recentRiffs=new Map();
function newRiffStyleGuidance(style){
  return ({numetal:'Nu Metal: tiefe wiederkehrende Bezugstöne, synkopierte kurze Anschlagsgruppen, klare Stopps und rhythmische Pausen, enger Bezug zur Kick. Die ausgewählten Rhythmus- und Tonbewegungsbausteine bleiben verbindlich.',korn:'Korn-inspiriert: tiefer perkussiver Groove mit Hip-Hop-Bezug, kantige Ruf-und-Antwort-Figuren und gezielte Kontraste zwischen tiefem Anker und höheren Einzeltönen. Spannung nur mit Tönen der gewählten Tonleiter. Eigenständige Motive entwickeln, keine Song-Riffs kopieren.'})[style]??'Rhythmus, Tonbewegung und Pausen passend zum ausgewählten Musikstil gestalten.';
}
function composeRiff(config,settings,companions={},random=Math.random){
  const blocks=readRiffBlocks(settings.blocks),count=config.bars??4;
  const density=settings.density,character=settings.character;
  const choose=values=>values[Math.min(values.length-1,Math.floor(random()*values.length))];
  const tuningId=config.tuning??'dropd',openStrings=guitarTunings[tuningId].notes;
  const nu=['numetal','korn'].includes(config.style);
  const pool=Array.from({length:nu?37:25},(_,i)=>openStrings[0]+i).filter(p=>scales[config.scale].includes((p-config.key+120)%12));
  const home=pool.findIndex(p=>p%12===config.key);
  const atDegree=d=>pool[Math.max(0,Math.min(pool.length-1,home+d))];
  const take=++riffTake;
  const historiesKey=JSON.stringify([config.style,tuningId,config.key,config.scale,count,settings]);
  const history=recentRiffs.get(historiesKey)??[];
  let result;
  for(let attempt=0;attempt<16;attempt++){
    // A and B use separately chosen rhythm and pitch contours. Variations retain identity.
    function theme(answer=false){
      const family=choose(nu?[...blocks.rhythms,...blocks.rhythms.filter(k=>['sync','phrases'].includes(k))]:blocks.rhythms),motion=choose(nu?[...blocks.motions,...blocks.motions.filter(k=>['pedal','answer'].includes(k))]:blocks.motions);
      let positions;
      if(family==='pulse'){
        const stride=density<=2?4:2;
        positions=Array.from({length:16/stride},(_,i)=>i*stride);
        if(density===1)positions=[0,8];
        if(density===3)positions=positions.filter((p,i)=>i%4!==3);
        if(density===5)positions.push(3,11);
      }else if(family==='sync'){
        const target=2+density;
        positions=[0];
        const candidates=config.style==='korn'?[2,3,6,10,11,14,15]:nu?[1,3,6,7,9,10,14]:[3,6,7,10,11,14,15];
        for(let i=candidates.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
        positions.push(...candidates.slice(0,target-1));
      }else if(family==='long'){
        positions=[0];if(density>=2)positions.push(8+choose([0,2,4]));if(density>=4)positions.push(4);if(density===5)positions.push(14);
      }else{
        const start=choose([0,1,2]),second=choose([9,10,11]);
        positions=[start,second];
        if(density>=2)positions.push(start+2);
        if(density>=3)positions.push(second+2);
        if(density>=4)positions.push(start+3);
        if(density===5)positions.push(second+3);
      }
      positions=[...new Set(positions)].sort((a,b)=>a-b);
      // A small relation to the current kick, without replacing the chosen rhythm family.
      const kicks=companions.drums?.[answer?1:0]?.flatMap((hits,step)=>hits.some(h=>h.kind==='kick')?[step]:[])??[];
      if(family==='sync'&&kicks.length&&positions.length>2){const candidate=kicks.find(s=>s%4!==0&&!positions.includes(s));if(candidate!==undefined)positions[positions.length-1]=candidate;positions=[...new Set(positions)].sort((a,b)=>a-b);}
      const direction=choose([-1,1]);
      let degree=answer?choose([0,1,2]):0;
      const excursion=2+((take+attempt)%3);
      return positions.map((step,i)=>{
        if(motion==='pedal')degree=nu?(i%4===3?choose([1,2,config.style==='korn'?scales[config.scale].length:3]):0):i%3===2?choose([1,2,3]):0;
        else if(motion==='steps')degree=i===0?degree:Math.max(-2,Math.min(4,degree+choose([-1,1])));
        else if(motion==='line')degree=Math.round(Math.sin(i/Math.max(1,positions.length-1)*Math.PI)*excursion)*direction;
        else degree=i%3===0?0:i%3===1?(config.style==='korn'?excursion+3:excursion):1;
        const next=positions[i+1]??16,gap=next-step;
        const length=family==='long'?gap:Math.max(1,Math.min(gap,Math.round(gap*(character==='wide'?.95:nu?.45:config.style==='punk'?.55:.72))));
        return {step,degree,length};
      });
    }
    const A=theme(),B=theme(true);
    const variant=(theme,amount)=>theme.map((e,i)=>({...e,degree:i===theme.length-1?0:i===theme.length-2?e.degree+(amount===2?-1:1):e.degree}));
    const templates={A,B,A1:variant(A,1),A2:variant(A,2),B1:variant(B,1)};
    result=Array.from({length:count},(_,bar)=>{
      const sequence=templates[riffForms[blocks.form].bars[bar%4]];
      let lastVoicing=[];
      return sequence.map((event,i)=>{
        const root=atDegree(event.degree);
        const voicing=findRiffVoicing([root],lastVoicing,null,openStrings);
        lastVoicing=voicing;
        const length=Math.min(16-event.step,event.length+(character==='wide'?2:0));
        return {tuning:tuningId,step:event.step,root,length,articulation:'open',voicing};
      });
    });
    // The percentage changes articulation only, never the number or timing of attacks.
    const attacks=result.flat(),indices=attacks.map((_,i)=>i);
    for(let i=indices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}
    for(const i of indices.slice(0,Math.round(attacks.length*(settings.pm??0)/100)))attacks[i].articulation='mute';
    result=normalizeRiffVoices(result);
    if(!history.includes(JSON.stringify(result)))break;
  }
  history.push(JSON.stringify(result));recentRiffs.set(historiesKey,history.slice(-12));
  if(recentRiffs.size>100)recentRiffs.delete(recentRiffs.keys().next().value);
  return result;
}
function riffBlocksPrompt(settings){
  const p=readRiffBlocks(settings.blocks);
  return 'RIFF-BAUSTEINE: Rhythmus ausschließlich aus '+p.rhythms.map(k=>riffRhythmBlocks[k]).join(', ')+'. Tonbewegung ausschließlich aus '+p.motions.map(k=>riffMotionBlocks[k]).join(', ')+'. Mehrere ausgewählte Bausteine dürfen kombiniert werden. Taktablauf '+riffForms[p.form].name+'; A = Hauptmotiv, B = verwandte Antwort, Striche = kleine erkennbare Variationen. Bei 8/16 Takten diese Vierergruppen sinnvoll fortführen. Rhythmus und Tonbewegung unabhängig auswählen und dann verbinden. Pro Anschlag genau EIN Ton (pitches mit genau einem Eintrag), keine Akkorde oder Powerchords. Unterschiedliche ausklingende Töne dürfen sich überlagern; gleiche Tonhöhe bei erneutem Anschlag beenden. Palm-Mute-Anteil '+(settings.pm??0)+' % aller Anschläge, auf die nächste ganze Anzahl gerundet: mute für PM, open für den Rest. Bei 0 % ausschließlich open, bei 100 % ausschließlich mute. Keine zusätzlichen Anschläge für PM einfügen.';
}
function renderRiffBlocks(){
  const settings=composeSettings.riff.blocks;
  for(const [kind,labels] of [['rhythms',riffRhythmBlocks],['motions',riffMotionBlocks]])for(const key of Object.keys(labels))get(`riff-block-${kind}-${key}`).checked=settings[kind].includes(key);
  get('riff-block-form').value=settings.form;
  get('riff-pm').value=composeSettings.riff.pm;
  get('riff-pm-value').textContent=composeSettings.riff.pm+' %';
  get('generate-riff').disabled=get('lock-guitar').checked||Boolean(chatComparison);
}
function bindRiffBlocks(){
  get('riff-pm').addEventListener('input',event=>{
    const pm=Number(event.target.value);
    if(!Number.isInteger(pm)||pm<0||pm>100)return;
    endComparison();composeSettings={...composeSettings,riff:{...composeSettings.riff,pm}};
    renderRiffBlocks();saveSection();
    get('riff-block-status').textContent='PM-Anteil für neue Riffs: '+pm+' %. Bestehende Noten bleiben erhalten.';
  });
  for(const [kind,labels] of [['rhythms',riffRhythmBlocks],['motions',riffMotionBlocks]])for(const key of Object.keys(labels))get(`riff-block-${kind}-${key}`).addEventListener('change',event=>{
    const current=composeSettings.riff.blocks;
    const values=event.target.checked?[...current[kind],key]:current[kind].filter(k=>k!==key);
    if(!values.length){renderRiffBlocks();get('riff-block-status').textContent='Mindestens einen Baustein je Bereich auswählen.';return;}
    endComparison();
    composeSettings={...composeSettings,riff:{...composeSettings.riff,blocks:readRiffBlocks({...current,[kind]:values})}};
    renderRiffBlocks();saveSection();get('riff-block-status').textContent='Auswahl gilt für neue Riffs und ChatGPT. Vorhandene Noten bleiben erhalten.';
  });
  get('riff-block-form').addEventListener('change',event=>{
    endComparison();composeSettings={...composeSettings,riff:{...composeSettings.riff,blocks:{...composeSettings.riff.blocks,form:event.target.value}}};saveSection();renderRiffBlocks();
  });
  get('generate-riff').addEventListener('click',()=>{
    if(get('generate-riff').disabled)return;
    const bars=composeRiff({...config,bars:selected.guitar.length},composeSettings.riff,{drums:selected.drums,bass:selected.bass,lead:selected.lead,vocal:selected.vocal});
    preset=null;polyphonicRiff=false;guitarName='Neue Motivkombination';
    refresh({guitar:bars},{guitar:true,keepLead:true});
    get('riff-block-status').textContent='Neues Riff · '+riffForms[composeSettings.riff.blocks.form].name+'. Begleitspuren bleiben erhalten.';
    return restartGeneratedPlayback();
  });
}
