const {app}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');
test('two lead performances retain bends and legato and the tone crossfades independently',()=>{
 const a=app();a.run(`sound=new LoopSound();globalThis.calls=[];sound.voice=(buffer,time,length,velocity,output,legato)=>{const detune={events:[],setValueAtTime(value,time){this.events.push([time,value]);},linearRampToValueAtTime(value,time){this.events.push([time,value]);}};calls.push({buffer,time,length,output,legato,detune});return {detune};};sound.lead(0,{root:76,length:4,articulation:'single',expression:'bend',bendCents:200,bendShape:'up-return'},.1);`);
 assert.equal(a.run('calls.length'),2);assert.equal(a.run('calls[0].time'),0);assert.equal(a.run('calls[1].time'),.007);assert.notStrictEqual(a.run('calls[0].buffer'),a.run('calls[1].buffer'));
 assert.deepEqual(a.plain(a.run('calls[0].detune.events.map(e=>e[1])')),[0,200,0]);assert.deepEqual(a.plain(a.run('calls[1].detune.events.map(e=>e[1])')),[0,200,0]);
 a.run("sound.setLeadTone('dark');calls=[];sound.lead(1,{root:74,length:2,transition:'pull',articulation:'single'},.1)");assert.ok(a.run('calls.every(c=>c.legato)'));assert.equal(a.run('sound.leadToneGates.dark.gain.value'),1);assert.equal(a.run('sound.leadToneGates.riff.gain.value'),0);
 a.run("sound.setLeadTone('riff')");assert.equal(a.run('sound.leadToneGates.dark.gain.value'),0);assert.equal(a.run('sound.leadToneGates.riff.gain.value'),1);
});

test('sound switch preserves notes and playback position and persists per song part',async()=>{
 const a=app();a.run("refresh({lead:[[{step:0,root:76,length:8,articulation:'single'}],[],[],[]]},{lead:true});globalThis.notes=JSON.stringify(selected)");
 a.choose('melody-sound','dark');assert.equal(a.run('sound'),undefined);assert.equal(a.run('JSON.stringify(selected)'),a.run('notes'));
 await a.fire('melody-play');const playback=a.run('playback'),step=a.run('playback.step');assert.equal(a.run('sound.leadTone'),'dark');
 a.choose('melody-sound','riff');assert.strictEqual(a.run('playback'),playback);assert.equal(a.run('playback.step'),step);assert.equal(a.run('JSON.stringify(selected)'),a.run('notes'));assert.equal(a.run('sound.leadTone'),'riff');
 a.run("saveSection();songParts.push({id:2,name:'Bridge',type:'Bridge',pattern:structuredClone(selected),meta:structuredClone(songParts[0].meta)});openSection(2)");a.choose('melody-sound','dark');a.run('openSection(1)');assert.equal(a.get('melody-sound').value,'riff');a.run('openSection(2)');assert.equal(a.get('melody-sound').value,'dark');
 a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.get('melody-sound').value,'dark');
 const legacy=JSON.parse(a.context.saved);for(const p of legacy.parts)delete p.meta.composeSettings.melody.sound;a.context.legacy=JSON.stringify(legacy);assert.equal(a.run('readArrangement(legacy).parts[0].meta.composeSettings.melody.sound'),'riff');
 const bad=JSON.parse(a.context.saved);bad.parts[0].meta.composeSettings.melody.sound='unknown';a.context.bad=JSON.stringify(bad);assert.throws(()=>a.run('readArrangement(bad)'),/Melodieklang/);
});

test('whole-song playback uses the sound saved for each part',async()=>{
 const a=app();a.run("refresh({lead:[[{step:0,root:76,length:4,articulation:'single'}],[],[],[]]},{lead:true});saveSection();const meta=structuredClone(songParts[0].meta);meta.composeSettings.melody.sound='dark';songParts.push({id:2,name:'Bridge',type:'Bridge',pattern:structuredClone(selected),meta});");
 await a.run('togglePlayback(true)');const tones=new Set();for(let i=0;i<400&&a.run('Boolean(playback)');i++){tones.add(a.run('sound.leadTone'));a.run('sound.context.currentTime+=.1;schedule()');}assert.deepEqual([...tones],['riff','dark']);assert.equal(a.run('playback'),null);
});
