const {app,midiTracks}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');
const seed=a=>a.run(`commitRiff([[{step:0,root:40,length:4,articulation:'open'},{step:6,root:43,length:3,articulation:'open'},{step:11,root:45,length:4,articulation:'open'}],[{step:0,root:40,length:4,articulation:'open'},{step:8,root:47,length:6,articulation:'open'}],[],[]]);refresh({drums:readChatDrums({hits:[{step:0,kind:'kick'},{step:4,kind:'snare'},{step:12,kind:'snare'}]})},{drums:true});`);

test('all melody styles, scales, roots, modes and phrase families stay monophonic and in scale',()=>{
 const a=app();seed(a);a.run(`(()=>{
 let seed=30;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const style of Object.keys(melodyStyleProfiles))for(const scale of Object.keys(scales))for(let key=0;key<12;key++)for(const mode of ['solo','riff']){
   const count=[4,8,16][key%3],riff=fitBars(selected.guitar,count),drums=fitBars(selected.drums,count),blocks=[Object.keys(melodyPhraseBlocks)[key%4]];
   const settings={...composeSettings.melody,density:key%5+1,melody:{mode,blocks,techniques:{hammer:true,pull:true,bend:true}}};
   const bars=composeMelody({...config,style,key,scale,bars:count},settings,riff,drums,random);projectNotes(bars,count,true);
   const notes=bars.flatMap((ns,b)=>ns.map(n=>({...n,position:b*16+n.step})));
   if(!notes.length||notes.some((n,i)=>!melodyPitches({scale,key}).includes(n.root)||n.length<1||n.position+n.length>count*16||(i&&notes[i-1].position+notes[i-1].length>n.position)))throw Error('Invalid phrase');
   for(let i=0;i<notes.length;i++){const n=notes[i],p=notes[i-1];if(n.transition&&(!p||p.position+p.length!==n.position||!melodyLegatoPossible(p.root,n.root)))throw Error('Invalid legato');if(n.expression==='bend'&&!melodyPitches({scale,key}).includes(n.root+n.bendCents/100))throw Error('Invalid bend target');}
 }
 })()`);
});

test('riff-development mode follows source rhythm and pitch classes and solo differs',()=>{
 const a=app();seed(a);a.run(`(()=>{
   const settings={...composeSettings.melody,melody:{...defaultMelodyOptions(),mode:'riff',blocks:['hook']}};
   const bars=composeMelody(config,settings,selected.guitar,selected.drums);
   for(const [b,notes] of bars.slice(0,2).entries())for(const n of notes){const source=selected.guitar[b].find(x=>x.step===n.step);if(!source||n.root%12!==source.root%12)throw Error('Lost riff motif');}
   const solo=composeMelody(config,{...settings,melody:{...settings.melody,mode:'solo'}},selected.guitar,selected.drums);
   if(JSON.stringify(solo)===JSON.stringify(bars))throw Error('No mode difference');
 })()`);
});

test('generation preserves companions, starts at bar one and supports history and files',async()=>{
 const a=app();seed(a);const companions=a.run('JSON.stringify([selected.guitar,selected.drums,selected.bass,selected.vocal])');
 await a.fire('generate-melody');assert.ok(a.run('selected.lead.flat().length>0'));assert.ok(a.run('playback'));assert.equal(a.run('playback.visual[0].bar'),0);assert.equal(a.run('JSON.stringify([selected.guitar,selected.drums,selected.bass,selected.vocal])'),companions);
 const before=a.run('JSON.stringify(selected.lead)');a.fire('melody-undo');assert.equal(a.run('selected.lead'),null);a.fire('melody-redo');assert.equal(a.run('JSON.stringify(selected.lead)'),before);
 const shapes=new Set();for(let i=0;i<10;i++){await a.fire('generate-melody');shapes.add(a.run('JSON.stringify(selected.lead)'));}assert.ok(shapes.size>=7);
 a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.ok(a.run('selected.lead'));assert.equal(a.get('export-lead').disabled,false);
});

test('phrase and technique selections migrate, persist and cannot become empty',()=>{
 const a=app();a.choose('melody-compose-mode','riff');assert.equal(a.get('generate-melody').disabled,true);seed(a);assert.equal(a.get('generate-melody').disabled,false);
 for(const k of ['blues','hook','run']){a.get('melody-block-'+k).checked=false;a.fire('melody-block-'+k,'change');}a.get('melody-block-arc').checked=false;a.fire('melody-block-arc','change');assert.equal(a.get('melody-block-arc').checked,true);
 a.get('melody-allow-pull').checked=true;a.fire('melody-allow-pull','change');a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.run('composeSettings.melody.melody.techniques.pull'),true);assert.equal(a.get('melody-compose-mode').value,'riff');
 const old=JSON.parse(a.context.saved);for(const p of old.parts)delete p.meta.composeSettings.melody.melody;a.context.old=JSON.stringify(old);assert.equal(a.run('readArrangement(old).parts[0].meta.composeSettings.melody.melody.mode'),'solo');
 const bad=JSON.parse(a.context.saved);bad.parts[0].meta.composeSettings.melody.melody.techniques.pull='yes';a.context.bad=JSON.stringify(bad);assert.throws(()=>a.run('readArrangement(bad)'),/Spieltechnik/);
});

test('technique permissions are separate; generated pull-offs, hammer-ons and bends survive MIDI and files',()=>{
 const a=app();seed(a);a.run(`(()=>{
  let seed=96;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(const enabled of ['none','hammer','pull','bend']){
   const techniques={hammer:enabled==='hammer',pull:enabled==='pull',bend:enabled==='bend'},found=new Set();
   for(let i=0;i<35;i++){
    const settings={...composeSettings.melody,density:5,melody:{mode:'solo',blocks:[enabled==='bend'?'arc':'run'],techniques}};
    const notes=composeMelody(config,settings,selected.guitar,selected.drums,random).flat();
    for(const n of notes){if(n.transition){if(n.transition!==enabled)throw Error('Excluded legato');found.add(n.transition);}if(n.expression){if(enabled!=='bend')throw Error('Excluded bend');found.add('bend');}}
   }
   if(enabled!=='none'&&!found.has(enabled))throw Error('Technique never used: '+enabled);
  }
 })()`);
 a.run(`refresh({lead:[[{step:0,root:76,length:2,articulation:'single'},{step:2,root:74,length:2,articulation:'single',transition:'pull'},{step:4,root:76,length:4,articulation:'single',expression:'bend',bendCents:200,bendShape:'up-return'}],[],[],[]]},{lead:true});sound=new LoopSound();sound.lead(0,selected.lead[0][1],15/90);`);
 a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.run('selected.lead[0][1].transition'),'pull');assert.match(a.get('lead-tabs').textContent,/P/);
 const events=midiTracks(a.run('encodeMidi(selected,"lead")'))[0];assert.ok(events.some(e=>(e.status&240)===224));assert.ok(events.some(e=>(e.status&240)===144&&e.body[0]===74));
});

test('ChatGPT includes selected mode, blocks and permissions and validates pull-offs',async()=>{
 const a=app();seed(a);a.choose('melody-compose-mode','riff');a.get('melody-allow-pull').checked=true;a.fire('melody-allow-pull','change');
 for(const part of ['melody','arrangement','section']){const prompt=a.run(`chatTrackPrompt(chatTrackContext('${part}'),'')`);assert.match(prompt,/MELODIE-BAUSTEINE/);assert.match(prompt,/Riffmotiv melodisch weiterentwickeln/);assert.match(prompt,/Freigegebene Techniken: Pull-offs/);assert.match(prompt,/Schnelle Läufe/);}
 a.context.answer={notes:[{step:0,pitch:76,duration:2,technique:'none'},{step:2,pitch:74,duration:2,technique:'pull'}]};
 a.run('globalThis.notes=readChatMelody(answer,chatTrackContext("melody"));globalThis.bars=aiMelodyBars(notes)');assert.equal(a.run('bars[0][1].transition'),'pull');
 a.get('melody-allow-pull').checked=false;a.fire('melody-allow-pull','change');assert.throws(()=>a.run('readChatMelody(answer,chatTrackContext("melody"))'),/freigegebene/);
 a.fire('open-ai-melody');a.run('aiPromptContext=chatTrackContext("melody")');a.get('melody-allow-hammer').checked=true;a.fire('melody-allow-hammer','change');a.get('ai-response').value=JSON.stringify(a.context.answer);await a.fire('ai-melody-form','submit');assert.match(a.get('ai-dialog-status').textContent,/geändert/);
});
