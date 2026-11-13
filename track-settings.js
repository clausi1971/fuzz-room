'use strict';

// Track preferences shared by the local composer, ChatGPT and arrangement files.
const composeTracks=['riff','melody','bass','vocal','drums'];
const composeLabels={riff:'Riff',melody:'Melodie',bass:'Bass',vocal:'Gesang',drums:'Drums'};
const composeChoices={
  rhythm:{auto:'Passend zum Stil',straight:'Gerade',syncopated:'Synkopiert',spacious:'Mit viel Luft'},
  movement:{auto:'Passend zum Stil',repeat:'Wiederholend',rise:'Aufsteigend',fall:'Absteigend',arch:'Bogen: hoch und zurück',steps:'Kleine Tonschritte',leaps:'Mit Tonsprüngen'},
  character:{auto:'Passend zum Stil',heavy:'Schwer und druckvoll',raw:'Direkt und rau',wide:'Weit und atmosphärisch'},
};
function defaultComposeSettings(){
  return Object.fromEntries(composeTracks.map(track=>[track,{rhythm:'auto',density:3,movement:'auto',character:'auto',...(track==='riff'?{blocks:defaultRiffBlocks(),pm:0}:track==='drums'?{blocks:defaultDrumBlocks()}:track==='melody'?{melody:defaultMelodyOptions(),sound:'riff'}:track==='bass'?{bass:defaultBassOptions()}:track==='vocal'?{vocal:defaultVocalOptions()}:{})}]));
}
let composeSettings=defaultComposeSettings();
function readComposeSettings(value){
  if(value===undefined)return defaultComposeSettings();
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Ungültige Spur-Einstellungen.');
  return Object.fromEntries(composeTracks.map(track=>{
    const p=value[track];
    if(!p||!Number.isInteger(p.density)||p.density<1||p.density>5)throw new Error('Ungültige Dichte für '+composeLabels[track]+'.');
    if(track==='riff'&&p.pm!==undefined&&(!Number.isInteger(p.pm)||p.pm<0||p.pm>100))throw new Error('Palm-Mute-Anteil muss zwischen 0 und 100 % liegen.');
    if(track==='melody'&&p.sound!==undefined&&!['riff','dark'].includes(p.sound))throw new Error('Ungültiger Melodieklang.');
    for(const field of ['rhythm','movement','character'])if(!Object.hasOwn(composeChoices[field],p[field])||(track==='drums'&&field==='movement'&&['steps','leaps'].includes(p[field])))throw new Error('Ungültige Spur-Auswahl.');
    return [track,{rhythm:p.rhythm,density:p.density,movement:p.movement,character:p.character,...(track==='riff'?{blocks:readRiffBlocks(p.blocks),pm:p.pm??0}:track==='drums'?{blocks:readDrumBlocks(p.blocks)}:track==='melody'?{melody:readMelodyOptions(p.melody),sound:p.sound??'riff'}:track==='bass'?{bass:readBassOptions(p.bass)}:track==='vocal'?{vocal:readVocalOptions(p.vocal)}:{})}];
  }));
}
function renderComposeSettings(){
  for(const track of composeTracks)for(const [field,value] of Object.entries(composeSettings[track])){
    if(field==='blocks'||field==='pm'||field==='melody'||field==='sound'||field==='bass'||field==='vocal')continue;
    get(`compose-${track}-${field}`).value=value;
    if(field==='density')get(`compose-${track}-density-label`).textContent=value+' / 5';
  }
  renderRiffBlocks();
  renderDrumBlocks();
  renderMelodyBlocks();
  renderBassBlocks();
  renderVocalBlocks();
}
function composePromptGuidance(context){
  const settings=readComposeSettings(JSON.parse(context.composeSignature??JSON.stringify(composeSettings)));
  const tracks=['arrangement','section'].includes(context.part)?composeTracks:[context.part];
  return '\nWÜNSCHE FÜR DIE NEUE SPUR: '+tracks.map(track=>{
    const p=settings[track];
    return composeLabels[track]+': Rhythmus '+composeChoices.rhythm[p.rhythm]+', Dichte '+p.density+'/5 (1 = wenige Einsätze und viel Raum, 5 = viele Einsätze), '+(track==='drums'?'Akzentverlauf ':'Tonbewegung ')+composeChoices.movement[p.movement]+', Charakter '+composeChoices.character[p.character];
  }).join('; ')+'. Rhythmus und Tonbewegung unabhängig gestalten, dann musikalisch verbinden. Wiedererkennbare Motive mit zusammenhängenden Variationen. Vorhandene Begleitspuren berücksichtigen und erhalten.'+(tracks.includes('riff')?'\n'+riffBlocksPrompt(settings.riff):'')+(tracks.includes('drums')?'\n'+drumBlocksPrompt(settings.drums,context.musicStyle):'')+(tracks.includes('melody')?'\n'+melodyBlocksPrompt(settings.melody,context.musicStyle):'')+(tracks.includes('bass')?'\n'+bassBlocksPrompt(settings.bass,context.musicStyle,context.part==='bass'?context.bassStyle:undefined):'')+(tracks.includes('vocal')?'\n'+vocalBlocksPrompt(settings.vocal,context.musicStyle):'');
}
function bindComposeSettings(){
  bindRiffBlocks();
  bindDrumBlocks();
  bindMelodyBlocks();
  bindBassBlocks();
  bindVocalBlocks();
  for(const track of composeTracks){
    for(const field of ['rhythm','density','movement','character'])get(`compose-${track}-${field}`).addEventListener(field==='density'?'input':'change',event=>{
      endComparison();
      const value=field==='density'?Number(event.target.value):event.target.value;
      const next={...composeSettings,[track]:{...composeSettings[track],[field]:value}};
      composeSettings=readComposeSettings(next);

      renderComposeSettings();saveSection();
    });
    get('clear-'+track).addEventListener('click',()=>{
      if(get('clear-'+track).disabled)return;
      const field={riff:'guitar',melody:'lead',bass:'bass',vocal:'vocal',drums:'drums'}[track];
      const data=track==='riff'?selected.guitar.map(()=>[]):track==='drums'?selected.drums.map(()=>Array.from({length:16},()=>[])):null;
      refresh({[field]:data},{[field]:true,keepLead:true});
    });
  }
}
