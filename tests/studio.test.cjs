const {app,midiTracks}=require('./harness.cjs');
const assert=require('node:assert/strict');
const test=require('node:test');

test('three toms have distinct rows, sounds, fills and General MIDI notes',async()=>{
  const a=app();const voices=a.plain(a.run('drumVoices'));
  assert.deepEqual(voices.filter(v=>v.id.startsWith('tom')).map(v=>v.midi),[50,47,41]);
  assert.equal(a.get('drum-grid').children.length,10);
  a.run('sound=new LoopSound()');
  const samples=['tom-high','tom-mid','tom'].map(kind=>Buffer.from(a.run(`sound.drumSample('${kind}',0).getChannelData(0)`).buffer));
  assert.notDeepEqual(samples[0],samples[1]);assert.notEqual(samples[1].length,samples[2].length);
  a.run('selected.drums=readChatDrums({hits:[{step:0,kind:"tom-high"},{step:1,kind:"tom-mid"},{step:2,kind:"tom"}]})');
  const notes=midiTracks(a.run('encodeMidi(selected,"drums")'))[0].filter(e=>e.status===153).map(e=>e.body[0]);
  assert.deepEqual(notes,[50,47,41]);
});

test('ChatGPT bass uses companions, choice and comparison; complete song parts include bass',async()=>{
  const a=app();a.fire('open-ai-bass');assert.equal(a.get('ai-bass-fields').hidden,false);
  for(const behavior of ['riff','root','independent']){a.get('ai-bass-style').value=behavior;const prompt=a.run('chatTrackPrompt(chatTrackContext("bass"),"schwer")');assert.match(prompt,/Riff \[/);assert.match(prompt,/Drums \[/);assert.match(prompt,/90 BPM/);}
  const guitar=a.run('selected.guitar');
  a.run('aiPromptContext=chatTrackContext("bass")');a.get('ai-response').value=JSON.stringify({notes:[{step:0,pitch:28,duration:8},{step:16,pitch:31,duration:4}]});await a.fire('ai-melody-form','submit');
  assert.equal(a.run('selected.bass'),null);assert.equal(a.run('chatComparison.candidate.bass.length'),4);
  await a.run('selectComparison("after");finishComparison(true)');assert.strictEqual(a.run('selected.guitar'),guitar);assert.equal(a.run('bassStyle'),'independent');
  a.get('ai-section-bars').value='8';a.get('ai-section-type').value='Bridge';a.run('chatPart="section";aiPromptContext=chatTrackContext(chatPart)');
  const answer={riff:{notes:[{step:0,pitches:[40,47],duration:4,articulation:'open'}]},drums:{hits:[{step:0,kind:'kick'},{step:63,kind:'tom-high'}]},melody:{notes:[{step:0,pitch:67,duration:8},{step:64,pitch:69,duration:8}]},bass:{notes:[{step:0,pitch:28,duration:8},{step:120,pitch:31,duration:8}]}};
  a.get('ai-response').value=JSON.stringify(answer);await a.fire('ai-melody-form','submit');
  assert.equal(a.run('songParts.length'),2);assert.equal(a.run('selected.bass.length'),8);assert.equal(a.run('bassBar'),-1);
  a.run('openSection(1)');assert.equal(a.run('selected.bass.length'),4);
});

test('riff techniques are per tone; new tones stay normal and history restores techniques',async()=>{
 const a=app();a.run(`commitRiff([[{step:0,root:38,length:2,articulation:'open',voicing:[[0,0],[1,17]]},{step:2,root:38,length:2,articulation:'open',voicing:[[0,0],[1,19]]},{step:4,root:38,length:4,articulation:'open',voicing:[[0,0],[1,17]]}],[],[],[]]);`);
 const cell=a.get('riff-grid').querySelector('button[data-pitch="64"][data-step="2"][data-bar="0"]');
 a.get('riff-grid').handlers.click({target:cell});assert.equal(a.run('riffSelection.pitch'),64);
 a.fire('riff-tech-hammer');assert.equal(a.run('selected.guitar[0][1].voiceTechniques[64].type'),'hammer');assert.equal(a.run('selected.guitar[0][1].voiceTechniques[38]'),undefined);
 a.run("riffSelection={bar:0,step:4,pitch:62,offset:0};renderRiffGrid()");a.fire('riff-tech-pull');assert.equal(a.run('selected.guitar[0][2].voiceTechniques[62].type'),'pull');
 a.fire('riff-tech-bend-half');assert.equal(a.run('selected.guitar[0][2].voiceTechniques[62].type'),'bend-half');
 assert.deepEqual(a.plain(a.run('leadPitchCurve(riffVoiceNote(riffAttacks(selected.guitar[0]).find(v=>v.step===4&&v.pitch===62)),15/90).map(p=>p[1])')),[0,100,0]);
 a.run("commitRiff(editRiffPitch(selected.guitar,0,8,43,'open'))");assert.equal(a.run('Object.keys(selected.guitar[0].find(n=>n.step===8).voiceTechniques??{}).length'),0);
 a.fire('riff-undo');a.fire('riff-undo');assert.equal(a.run('selected.guitar[0][2].voiceTechniques[62].type'),'pull');a.fire('riff-redo');
 a.run("riffSelection={bar:0,step:4,pitch:62,offset:0};renderRiffGrid()");a.fire('riff-tech-normal');assert.equal(a.run('selected.guitar[0][2].voiceTechniques[62]'),undefined);
 assert.equal(a.run('selected.guitar[0][1].voiceTechniques[64].type'),'hammer');
 a.run("riffSelection={bar:0,step:0,pitch:38,offset:0};renderRiffGrid()");a.fire('riff-tech-bend-whole');assert.equal(a.run('selected.guitar[0][0].voiceTechniques?.[38]'),undefined);
 assert.deepEqual(a.plain(a.run('readArrangement(createArrangement()).parts[0].pattern.guitar')),a.plain(a.run('selected.guitar')));
});

test('riff bend audio and MIDI affect only the chosen string and return to zero',async()=>{
 const a=app();a.run(`commitRiff([[{step:0,root:38,length:4,articulation:'open',voicing:[[0,0],[1,19]],voiceTechniques:{64:{type:'bend-whole'}}}],[],[],[]]);globalThis.curves=[];sound=new LoopSound();sound.voice=()=>({detune:{setValueAtTime(v){curves.push(v)},linearRampToValueAtTime(v){curves.push(v)}}});sound.guitar(0,riffAttacks(selected.guitar[0]),15/90,.8);`);
 assert.deepEqual(a.plain(a.run('curves')),[0,200,0,0,200,0]);
 const events=midiTracks(a.run('encodeMidi(selected,"guitar")'))[0];
 const low=events.find(e=>(e.status&240)===144&&e.body[0]===38),high=events.find(e=>(e.status&240)===144&&e.body[0]===64);assert.notEqual(low.status&15,high.status&15);
 const bends=events.filter(e=>(e.status&240)===224);assert.ok(bends.length>3);assert.ok(bends.every(e=>(e.status&15)===(high.status&15)));assert.deepEqual(bends.at(-1).body,[0,64]);
});

test('a new G2 leaves the held D3 unchanged and each voice has its own articulation',async()=>{
 const a=app();a.run(`commitRiff([[{step:0,root:50,length:8,articulation:'open',voicing:[[2,0]]}],[],[],[]]);globalThis.held=selected.guitar[0][0];`);
 const cell=a.get('riff-grid').querySelector('button[data-pitch="43"][data-bar="0"][data-step="1"]');a.get('riff-grid').handlers.click({target:cell});
 assert.strictEqual(a.run('selected.guitar[0][0]'),a.run('held'));assert.equal(a.run('riffAttacks(selected.guitar[0]).find(v=>v.pitch===50).length'),8);
 assert.equal(a.run('riffSelection.pitch'),43);assert.equal(a.run('riffAttacks(selected.guitar[0]).find(v=>v.pitch===43).articulation'),'open');assert.equal(a.run('selected.guitar[0][1].voiceTechniques[43]'),undefined);
 a.fire('riff-tone-mute');assert.equal(a.run('riffAttacks(selected.guitar[0]).find(v=>v.pitch===43).articulation'),'mute');assert.equal(a.run('riffAttacks(selected.guitar[0]).find(v=>v.pitch===50).articulation'),'open');
 assert.match(a.get('riff-grid').querySelector('button[data-pitch="50"][data-step="2"][data-bar="0"]').attrs['aria-label'],/klingt weiter/);
 a.fire('riff-undo');assert.equal(a.run('riffAttacks(selected.guitar[0]).find(v=>v.pitch===43).articulation'),'open');a.fire('riff-redo');
 a.run("commitRiff(editRiffSpan(selected.guitar,0,1,43,0,{end:12}))");assert.equal(a.run('riffAttacks(selected.guitar[0]).find(v=>v.pitch===43).length'),11);
 a.run("commitRiff(editRiffPitch(selected.guitar,0,10,43,'open'))");assert.equal(a.run('riffAttacks(selected.guitar[0]).find(v=>v.pitch===43&&v.step===1).length'),9);assert.equal(a.run('riffAttacks(selected.guitar[0]).find(v=>v.pitch===50).length'),8);
 assert.deepEqual(a.plain(a.run('readArrangement(createArrangement()).parts[0].pattern.guitar')),a.plain(a.run('selected.guitar')));
 const events=midiTracks(a.run('encodeMidi(selected,"guitar")'))[0];assert.ok(events.some(e=>e.status===128&&e.body[0]===50&&e.tick===8*120));assert.ok(events.some(e=>e.status===144&&e.body[0]===43&&e.tick===120));
});

test('ChatGPT imports independent tone lengths and play styles without cutting other pitches',async()=>{
 const a=app();a.context.answer={notes:[{step:0,pitches:[50,57],duration:8,durations:[8,2],articulation:'open',articulations:['open','mute']},{step:1,pitches:[43],duration:2,articulation:'open'}]};
 a.run('globalThis.imported=readChatRiff(answer,chatTrackContext("riff"))');
 const voices=a.plain(a.run('riffAttacks(imported[0]).map(v=>[v.pitch,v.step,v.length,v.articulation])'));assert.deepEqual(voices,[[50,0,8,'open'],[57,0,2,'mute'],[43,1,2,'open']]);
 a.context.answer.notes[0].durations=[17,2];assert.throws(()=>a.run('readChatRiff(answer,chatTrackContext("riff"))'));
 for(const part of ['riff','arrangement','section']) {const prompt=a.run(`chatTrackPrompt(chatTrackContext('${part}'),'')`);assert.match(prompt,/Vorhandene Begleitspuren unverändert/);}
});

test('a held normal note is not affected by a later bend even when both use the same string',async()=>{
 const a=app();a.run(`commitRiff([[{step:0,root:40,length:8,articulation:'open',voicing:[[0,2]]},{step:2,root:43,length:4,articulation:'open',voicing:[[0,5]],voiceTechniques:{43:{type:'bend-half'}}}],[],[],[]]);`);
 const events=midiTracks(a.run('encodeMidi(selected,"guitar")'))[0],low=events.find(e=>(e.status&240)===144&&e.body[0]===40),high=events.find(e=>(e.status&240)===144&&e.body[0]===43);
 assert.notEqual(low.status&15,high.status&15);assert.ok(events.filter(e=>(e.status&240)===224).every(e=>(e.status&15)===(high.status&15)));
 assert.ok(events.some(e=>(e.status&240)===128&&e.body[0]===40&&e.tick===8*120));
});
