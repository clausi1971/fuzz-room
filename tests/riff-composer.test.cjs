const {app,midiTracks}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');

test('new riffs use one note per attack and preserve optional independent sustain',async()=>{
 const a=app();a.run(`for(const style of ['stoner','hard','punk'])for(const character of ['auto','heavy','raw','wide']){
   const bars=composeRiff({...config,style},{...composeSettings.riff,character});projectNotes(bars,4,false);
   for(const notes of bars)for(const note of notes){
     if(note.articulation!=='open'||note.voiceTechniques||note.voiceArticulations)throw Error('Automatic technique');
     if(guitarPitches(note).length!==1)throw Error('Chord');
     const voices=riffAttacks(notes);
     if(voices.some(v=>voices.some(other=>other.pitch===v.pitch&&other.step>v.step&&other.step<v.step+v.length)))throw Error('Same pitch overlap');
   }
 }`);
 for(const part of ['riff','arrangement','section']){
   const prompt=a.run(`chatTrackPrompt(chatTrackContext('${part}'),'')`);
   assert.match(prompt,/Palm-Mute-Anteil 0 %/);assert.doesNotMatch(prompt,/VERBINDLICHE RIFF-AUSWAHL|Riff-Spieltechniken dezent/);assert.match(prompt,/RIFF-BAUSTEINE/);
 }
 const saved=JSON.parse(a.run('createArrangement()'));assert.equal(saved.riffTechniqueProfiles,undefined);
 saved.riffTechniqueProfiles={stoner:{open:false,pm:true,hammer:true}};a.context.legacy=JSON.stringify(saved);
 a.run('loadArrangement(readArrangement(legacy))');await a.fire('generate-riff');assert.ok(a.run("selected.guitar.flat().every(n=>n.articulation==='open'&&!n.voiceTechniques)"));
});

test('riff block combinations require at least one choice and preserve existing music',async()=>{
 const a=app(),original=a.run('JSON.stringify(selected)');
 for(const kind of ['rhythms','motions']){
  const keys=a.plain(a.run(`Object.keys(${kind==='rhythms'?'riffRhythmBlocks':'riffMotionBlocks'})`));
  for(const key of keys){a.get(`riff-block-${kind}-${key}`).checked=false;a.fire(`riff-block-${kind}-${key}`,'change');}
  assert.equal(a.run(`composeSettings.riff.blocks.${kind}.length`),1);assert.match(a.get('riff-block-status').textContent,/Mindestens/);
 }
 assert.equal(a.run('JSON.stringify(selected)'),original);
 a.choose('riff-block-form','abab');assert.equal(a.run('composeSettings.riff.blocks.form'),'abab');
 a.context.saved=a.run('createArrangement()');a.run('composeSettings=defaultComposeSettings();loadArrangement(readArrangement(saved))');assert.equal(a.run('composeSettings.riff.blocks.form'),'abab');assert.equal(a.run('composeSettings.riff.blocks.rhythms.length'),1);
 const invalid=JSON.parse(a.context.saved);invalid.parts[0].meta.composeSettings.riff.blocks.motions=[];a.context.invalid=JSON.stringify(invalid);assert.throws(()=>a.run('readArrangement(invalid)'),/Baustein/);
});

test('new riff generation preserves companions and supports undo, redo and MIDI',async()=>{
 const a=app();a.run(`refresh({drums:readChatDrums({hits:[{step:0,kind:'kick'},{step:6,kind:'kick'}]}),lead:[[{step:0,root:64,length:8,articulation:'single'}],[],[],[]],bass:[[{step:0,root:28,length:8,articulation:'single'}],[],[],[]],vocal:[[{step:0,root:52,length:8,articulation:'single'}],[],[],[]]},{drums:true,lead:true,bass:true,vocal:true});globalThis.companions=JSON.stringify([selected.drums,selected.lead,selected.bass,selected.vocal]);`);
 await a.fire('generate-riff');const first=a.run('JSON.stringify(selected.guitar)');assert.ok(a.run('selected.guitar.flat().length>0'));assert.equal(a.run('JSON.stringify([selected.drums,selected.lead,selected.bass,selected.vocal])'),a.run('companions'));
 a.fire('riff-undo');assert.equal(a.run('selected.guitar.flat().length'),0);a.fire('riff-redo');assert.equal(a.run('JSON.stringify(selected.guitar)'),first);
 const riffs=new Set([first]);for(let i=0;i<8;i++){await a.fire('generate-riff');riffs.add(a.run('JSON.stringify(selected.guitar)'));}assert.equal(riffs.size,9);
 assert.deepEqual(a.plain(a.run('readArrangement(createArrangement()).parts[0].pattern.guitar')),a.plain(a.run('selected.guitar')));
 assert.ok(midiTracks(a.run('encodeMidi(selected,"guitar")'))[0].some(e=>(e.status&240)===144));
 a.get('lock-guitar').checked=true;a.fire('lock-guitar','change');assert.equal(a.get('generate-riff').disabled,true);
});

test('all keys, scales, styles and block pairings produce valid playable in-scale notes',async()=>{
 const a=app();a.run(`(()=>{
  let seed=123;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const tech={open:true,pm:true,sustain:true,hammer:true,pull:true,bend:true};
  for(const style of ['stoner','hard','punk'])for(const scale of Object.keys(scales))for(let key=0;key<12;key++){
    const rhythms=Object.keys(riffRhythmBlocks),motions=Object.keys(riffMotionBlocks),forms=Object.keys(riffForms);
    const c={...config,style,scale,key,bars:[4,8,16][key%3]};
    const p={...composeSettings.riff,density:key%5+1,character:['auto','heavy','raw','wide'][key%4],blocks:{rhythms:[rhythms[key%4]],motions:[motions[(key+1)%4]],form:forms[key%3]}};
    const bars=composeRiff(c,p,{},random);projectNotes(bars,c.bars,false);
    for(const notes of bars){if(!notes.length)throw Error('Empty motif');for(const n of notes){if(!n.voicing||new Set(n.voicing.map(v=>v[0])).size!==n.voicing.length)throw Error('Invalid fingering');for(const pitch of guitarPitches(n))if(!scales[scale].includes((pitch-key+120)%12))throw Error('Out of scale');}const voices=riffAttacks(notes);if(voices.some(v=>voices.some(w=>w.pitch===v.pitch&&w.step>v.step&&w.step<v.step+v.length)))throw Error('Same pitch overlaps');}
  }
  for(const rhythm of Object.keys(riffRhythmBlocks))for(const motion of Object.keys(riffMotionBlocks))for(const form of Object.keys(riffForms))projectNotes(composeRiff({...config,bars:4},{...composeSettings.riff,blocks:{rhythms:[rhythm],motions:[motion],form}},{},random),4,false);
 })()`);
});

test('four-bar forms retain their main motif and density influences rhythmic families',async()=>{
 const a=app();a.run(`(()=>{
  const tech={open:true,pm:false,sustain:false,hammer:false,pull:false,bend:false};
  for(const form of Object.keys(riffForms)){
    const bars=composeRiff(config,{...composeSettings.riff,blocks:{rhythms:['pulse'],motions:['steps'],form}});
    const signature=notes=>JSON.stringify(notes.map(n=>[n.step,n.root,n.length]));
    if(form==='aaab'&&signature(bars[0])!==signature(bars[1]))throw Error('A lost');
    if(form==='abab'&&signature(bars[0])!==signature(bars[2]))throw Error('A return lost');
    for(const notes of bars)if(JSON.stringify(notes.map(n=>n.step))!==JSON.stringify(bars[0].map(n=>n.step)))throw Error('Pulse changed');
  }
  const make=density=>composeRiff(config,{...composeSettings.riff,density,blocks:{rhythms:['pulse'],motions:['pedal'],form:'aaab'}}).flat().length;
  if(!(make(1)<make(3)&&make(3)<make(5)))throw Error('Density has no effect');
 })()`);
});

