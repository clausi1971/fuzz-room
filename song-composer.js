'use strict';

const automaticSongForm=[
  {name:'Intro',role:'intro',bars:4},
  {name:'Strophe 1',role:'verse',bars:8},
  {name:'Refrain 1',role:'chorus',bars:8},
  {name:'Strophe 2',role:'verse',bars:8},
  {name:'Refrain 2',role:'chorus',bars:8},
  {name:'Bridge',role:'bridge',bars:4},
  {name:'Refrain 3',role:'chorus',bars:8},
  {name:'Outro',role:'outro',bars:4},
];

function automaticTrackSettings(style,role='verse'){
  const settings=defaultComposeSettings(),nu=['numetal','korn'].includes(style);
  const sparse=['intro','outro','bridge'].includes(role),density=sparse?2:role==='chorus'?4:3;
  for(const track of composeTracks){settings[track].density=density;settings[track].character=style==='punk'?'raw':nu?'heavy':sparse?'wide':'auto';}
  settings.riff.blocks={rhythms:style==='punk'?['pulse','phrases']:nu?['sync','phrases']:sparse?['long','phrases']:['pulse','sync','phrases'],motions:nu?['pedal','answer']:['pedal','steps','answer'],form:role==='bridge'?'aaba':'aaab'};
  settings.riff.pm=style==='punk'?20:nu?75:style==='hard'?35:15;
  settings.drums.blocks=sparse?['space','toms']:style==='punk'?['drive','backbeat']:nu?['sync','halftime']:['backbeat','drive'];
  settings.bass.bass={...defaultBassOptions(),mode:nu?'independent':'riff',blocks:sparse?['hold','octave']:['pulse','octave','run']};
  settings.melody.melody={...defaultMelodyOptions(),blocks:style==='punk'||role==='chorus'?['hook']:nu?['arc','hook']:['arc','blues']};
  settings.melody.density=Math.max(1,density-1);
  settings.vocal.vocal={...defaultVocalOptions(),blocks:role==='chorus'?['hook','answer']:nu?['speech','arc','answer']:['arc','hook','answer']};
  return readComposeSettings(settings);
}

function composeAutomaticPart(base,role,bars,range,preferences){
  const settings=automaticTrackSettings(base.style,role);
  // Keep instrument/range choices; composition controls are chosen automatically.
  settings.bass.bass.tuning=preferences.bass.bass.tuning;
  settings.melody.sound=preferences.melody.sound;
  settings.vocal.vocal.sound=preferences.vocal.vocal.sound;
  const cfg={...base,mode:'riff',bars};
  const drums=composeDrums(cfg,settings.drums);
  const guitar=composeRiff(cfg,settings.riff,{drums});
  const bass=composeBass(cfg,settings.bass,guitar,drums);
  const lead=composeMelody(cfg,settings.melody,guitar,drums);
  const vocal=composeVocal(cfg,settings.vocal,range,guitar,bass,drums,lead);
  const {bars:unused,...patternConfig}=cfg;
  return {pattern:{...patternConfig,guitar,drums,bass,lead,vocal},settings};
}

function automaticPartMeta(settings,range){
  return {...comparisonMeta(),composeSettings:structuredClone(settings),mode:'riff',style:config.style,
    melodyStyle:config.melodyStyle,groove:0,leadTake:0,preset:null,polyphonicRiff:false,
    guitarName:'Arrangement-Riff',grooveName:'Arrangement-Groove',melodyEdited:false,
    bassName:'Arrangement-Bass',bassStyle:settings.bass.bass.mode,vocalName:'Arrangement-Gesang',vocalRange:range};
}

function automaticReplacementNeeded(scope){
  const hasNotes=p=>Boolean(p.guitar.flat().length||p.drums.flat(2).length||p.bass?.flat().length||p.lead?.flat().length||p.vocal?.flat().length);
  return scope==='song'?(songParts.length>1||songParts.some(part=>hasNotes(part.id===activeSection?selected:part.pattern))):hasNotes(selected);
}

function renderAutomaticDialog(){
  const scope=get('generate-arrangement-scope').value,replace=automaticReplacementNeeded(scope);
  get('generate-arrangement-summary').textContent=scope==='song'
    ?'Ganzer Song · 8 Teile · 52 Takte: Intro → Strophe → Refrain → Strophe → Refrain → Bridge → Refrain → Outro. Wiederkehrende Strophen und Refrains behalten ihre Motive.'
    :`Nur der geöffnete Teil · ${selected.guitar.length} Takte. Andere Songteile bleiben erhalten.`;
  get('generate-arrangement-warning').hidden=!replace;
  get('generate-arrangement-warning-text').textContent=scope==='song'
    ?'Alle bisherigen Songteile mit ihren fünf Spuren werden ersetzt. Das lässt sich nicht über die Spur-Rückgängig-Buttons zurückholen. Speichere dein Arrangement bei Bedarf vorher als Datei.'
    :'Alle fünf Spuren des geöffneten Teils werden ersetzt. Die bisherigen Noten lassen sich je Spur mit Rückgängig zurückholen.';
  get('generate-arrangement-confirm').disabled=Boolean(playButton.disabled||chatComparison||(replace&&!get('generate-arrangement-replace').checked));
}

get('generate-arrangement').addEventListener('click',()=>{
  if(playButton.disabled||chatComparison){get('ai-status').textContent='Beende zuerst die Audio-Vorbereitung oder den ChatGPT-Vergleich.';return;}
  get('generate-arrangement-scope').value='song';
  get('generate-arrangement-replace').checked=false;
  get('generate-arrangement-status').textContent='';
  renderAutomaticDialog();get('generate-arrangement-dialog').showModal();
});
get('generate-arrangement-scope').addEventListener('change',()=>{get('generate-arrangement-replace').checked=false;renderAutomaticDialog();});
get('generate-arrangement-replace').addEventListener('change',renderAutomaticDialog);
get('generate-arrangement-cancel').addEventListener('click',()=>get('generate-arrangement-dialog').close());
get('generate-arrangement-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const scope=get('generate-arrangement-scope').value;
  if(!['song','part'].includes(scope))return;
  renderAutomaticDialog();if(get('generate-arrangement-confirm').disabled)return;
  get('generate-arrangement-confirm').disabled=true;
  try{
    const base={...config},preferences=structuredClone(composeSettings),range=vocalRange;
    if(scope==='song'){
      const themes=new Map();
      // Build everything before replacing any user content.
      const parts=automaticSongForm.map((entry,index)=>{
        if(!themes.has(entry.role))themes.set(entry.role,composeAutomaticPart(base,entry.role,entry.bars,range,preferences));
        const {pattern,settings}=structuredClone(themes.get(entry.role));
        return {id:sectionSerial+index+1,name:entry.name,type:{verse:'Strophe',chorus:'Refrain',intro:'Intro',bridge:'Bridge',outro:'Outro'}[entry.role],pattern,meta:automaticPartMeta(settings,range)};
      });
      if(playback)stop();
      songParts=parts;sectionSerial=parts.at(-1).id;
      openSection(parts[0].id,{skipSave:true});
    }else{
      const {pattern,settings}=composeAutomaticPart(base,'verse',selected.guitar.length,range,preferences);
      if(playback)stop();
      const meta=automaticPartMeta(settings,range);
      composeSettings=settings;config.mode='riff';
      ({guitarName,grooveName,preset,polyphonicRiff,melodyEdited,bassName,bassStyle,vocalName}=meta);
      groove=0;leadTake=0;get('mode').value='riff';
      refresh(pattern,{guitar:true,drums:true,lead:true,bass:true,vocal:true,keepLead:true});
    }
    aiPromptContext=null;get('generate-arrangement-dialog').close();
    get('ai-status').textContent=scope==='song'?'Neuer Song · 8 Teile · 52 Takte · alle fünf Spuren.':'Geöffneter Teil mit allen fünf Spuren neu erzeugt.';
    if(scope==='song')await togglePlayback(true);else await restartGeneratedPlayback();
  }catch(error){get('generate-arrangement-status').textContent='Erzeugen fehlgeschlagen: '+error.message;renderAutomaticDialog();}
});
