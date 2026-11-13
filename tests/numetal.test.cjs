const {app,midiTracks}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');

test('new styles and selectable A-standard preserve existing pitches and restore tuning with files',async()=>{
 const a=app();a.run("commitRiff([[{step:0,root:40,length:4,articulation:'open',voicing:[[0,2],[1,2]]}],[],[],[]]);globalThis.before=JSON.stringify(selected.guitar);globalThis.pitches=JSON.stringify(guitarPitches(selected.guitar[0][0]));");
 a.choose('style','korn');a.choose('guitar-tuning','a7');assert.equal(a.run('JSON.stringify(selected.guitar)'),a.run('before'));assert.equal(a.run('JSON.stringify(guitarPitches(selected.guitar[0][0]))'),a.run('pitches'));
 a.choose('key','9');a.get('riff-pm').value='75';a.fire('riff-pm','input');await a.fire('generate-riff');
 assert.ok(a.run("selected.guitar.flat().every(n=>n.tuning==='a7'&&guitarPitches(n).length===1)"));assert.ok(a.run('selected.guitar.flat().some(n=>n.root===33)'));
 a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.run('config.tuning'),'a7');assert.equal(a.run('config.style'),'korn');assert.equal(a.get('guitar-tuning').value,'a7');
 assert.equal(a.get('tabs').textContent.split('\n').length,8);assert.match(a.get('tab-tuning').textContent,/7 Saiten/);
 a.fire('riff-undo');assert.equal(a.run('JSON.stringify(guitarPitches(selected.guitar[0][0]))'),a.run('pitches'));
 const legacy=JSON.parse(a.context.saved);for(const part of legacy.parts){delete part.pattern.tuning;}a.context.legacy=JSON.stringify(legacy);assert.equal(a.run('readArrangement(legacy).parts[0].pattern.tuning'),'dropd');
});

test('Nu Metal and Korn riffs are scale-correct across both tunings and export low notes',async()=>{
 const a=app();a.run(`(()=>{
 let seed=25;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const style of ['numetal','korn'])for(const tuning of Object.keys(guitarTunings))for(const scale of Object.keys(scales))for(let key=0;key<12;key++)for(const count of [4,8,16]){
   const p={...composeSettings.riff,pm:key%2?100:50},bars=composeRiff({...config,style,tuning,scale,key,bars:count},p,{},random);projectNotes(bars,count,false);
   const notes=bars.flat();if(notes.some(n=>n.voicing.length!==1||guitarPitches(n).some(p=>!scales[scale].includes((p-key+120)%12))))throw Error('Wrong notes');
   if(notes.filter(n=>n.articulation==='mute').length!==Math.round(notes.length*p.pm/100))throw Error('PM');
 }
 })()`);
 a.choose('style','korn');a.choose('guitar-tuning','a7');a.choose('key','9');await a.fire('generate-riff');
 const midi=midiTracks(a.run('encodeMidi(selected,"guitar")'))[0];assert.ok(midi.some(e=>(e.status&240)===144&&e.body[0]===33));
 a.run('sound=new LoopSound();sound.guitar(0,riffAttacks(selected.guitar[0]),15/90,.8)');
});

test('seven-string ChatGPT prompts include exact tuning, style, PM and valid low-note import',async()=>{
 const a=app();a.choose('style','korn');a.choose('guitar-tuning','a7');a.choose('key','9');
 for(const part of ['riff','arrangement','section']){
   const prompt=a.run(`chatTrackPrompt(chatTrackContext('${part}'),'')`);assert.match(prompt,/Korn-inspiriert/);assert.match(prompt,/33, 38, 43, 48, 53, 57, 62/);assert.match(prompt,/33–84/);assert.match(prompt,/genau EIN Ton/);assert.doesNotMatch(prompt,/undefined|Drop-D-Leersaiten/);
 }
 a.context.answer={notes:[{step:0,pitches:[33],duration:4,articulation:'open'}]};a.run('commitRiff(readChatRiff(answer,chatTrackContext("riff")))');assert.equal(a.run('guitarPitches(selected.guitar[0][0])[0]'),33);assert.equal(a.run('selected.guitar[0][0].tuning'),'a7');
 a.run('commitRiff(editRiffPitch(selected.guitar,0,6,35,"open"))');assert.equal(a.run('guitarPitches(selected.guitar[0][1])[0]'),35);
 a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.run('guitarPitches(selected.guitar[0][1])[0]'),35);
 a.fire('open-ai-riff');a.run('aiPromptContext=chatTrackContext("riff")');a.choose('guitar-tuning','dropd');a.get('ai-response').value=JSON.stringify(a.context.answer);await a.fire('ai-melody-form','submit');assert.match(a.get('ai-dialog-status').textContent,/geändert/);
});

test('style profiles change musical results while explicit block selections stay authoritative',async()=>{
 const a=app();const signatures=[];
 for(const style of ['stoner','numetal','korn']){
  a.context.style=style;
  signatures.push(a.run(`(()=>{let seed=42;riffTake=0;recentRiffs.clear();const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);return JSON.stringify(composeRiff({...config,style},composeSettings.riff,{},random));})()`));
 }
 assert.equal(new Set(signatures).size,3);
 a.run(`for(const style of ['numetal','korn']){const bars=composeRiff({...config,style},{...composeSettings.riff,density:1,blocks:{rhythms:['pulse'],motions:['pedal'],form:'aaab'}});if(bars.some(notes=>notes.some(n=>![0,8].includes(n.step))))throw Error('Ignored straight pulse');}`);
});
