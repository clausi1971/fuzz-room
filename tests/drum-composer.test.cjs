const {app,midiTracks}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');

test('all styles, complete groove families and section sizes generate playable valid drums',()=>{
 const a=app();a.run(`(()=>{
  let seed=41;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(const style of Object.keys(drumStyleProfiles))for(const block of Object.keys(drumGrooveBlocks))for(const count of [4,8,16])for(const density of [1,3,5]){
   const bars=composeDrums({...config,style,bars:count},{...composeSettings.drums,blocks:[block],density},random);projectDrums(bars,count);
   if(bars.length!==count)throw Error('Length');
   for(const beats of bars)for(const hits of beats){
    if(new Set(hits.map(h=>h.kind)).size!==hits.length)throw Error('Duplicate hit');
    if(hits.filter(h=>h.kind!=='kick').length>2)throw Error('Too many hands');
    if(hits.some(h=>h.kind==='hat')&&hits.some(h=>h.kind==='open'))throw Error('Conflicting hats');
    if(hits.some(h=>!drumVoice[h.kind]||h.velocity<=0||h.velocity>1))throw Error('Bad sound');
   }
   for(const [bar,beats] of bars.entries())for(const step of block==='halftime'?[8]:[4,12])if(!beats[step].some(h=>h.kind==='snare'))throw Error('Lost backbeat');
  }
 })()`);
});

test('drums are independent of riff notes, density changes the groove and styles vary',()=>{
 const a=app();const results=[];
 for(const style of ['stoner','punk','hard','numetal','korn']){
  a.context.style=style;results.push(a.run(`(()=>{let seed=175;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);recentDrums.clear();return JSON.stringify(composeDrums({...config,style},composeSettings.drums,random).map(beats=>beats.map(hits=>hits.map(h=>h.kind))));})()`));
 }
 assert.ok(new Set(results).size>=4);
 a.run(`(()=>{
  const make=density=>{let seed=62;recentDrums.clear();const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);return composeDrums(config,{...composeSettings.drums,density,blocks:['drive']},random);};
  if(make(1).flat(2).length>=make(5).flat(2).length)throw Error('Density');
  const before=JSON.stringify(make(3));selected.guitar=[[{step:7,root:45,length:2,articulation:'open'}],[],[],[]];
  if(JSON.stringify(make(3))!==before)throw Error('Riff influenced drums');
 })()`);
});

test('new drums preserve companions, start playback, undo and export three toms',async()=>{
 const a=app();a.run("commitRiff([[{step:0,root:40,length:4,articulation:'open'}],[],[],[]]);refresh({lead:[[{step:0,root:64,length:4,articulation:'single'}],[],[],[]]},{lead:true});globalThis.companions=JSON.stringify([selected.guitar,selected.lead,selected.bass,selected.vocal]);");
 await a.fire('generate-drums');assert.ok(a.run('playback'));assert.equal(a.run('playback.visual[0].bar'),0);assert.equal(a.run('JSON.stringify([selected.guitar,selected.lead,selected.bass,selected.vocal])'),a.run('companions'));
 const first=a.run('JSON.stringify(selected.drums)');a.fire('drums-undo');assert.equal(a.run('selected.drums.flat(2).length'),0);a.fire('drums-redo');assert.equal(a.run('JSON.stringify(selected.drums)'),first);
 const signatures=new Set();for(let i=0;i<7;i++){await a.fire('generate-drums');signatures.add(a.run('JSON.stringify(selected.drums.map(beats=>beats.map(hits=>hits.map(h=>h.kind))))'));}assert.ok(signatures.size>=5);
 const kinds=a.plain(a.run('[...new Set(selected.drums.flat(2).map(h=>h.kind))]'));for(const kind of ['tom-high','tom-mid','tom'])assert.ok(kinds.includes(kind));
 const events=midiTracks(a.run('encodeMidi(selected,"drums")'))[0];for(const note of [50,47,41])assert.ok(events.some(e=>e.status===153&&e.body[0]===note));
 a.get('lock-drums').checked=true;a.fire('lock-drums','change');assert.equal(a.get('generate-drums').disabled,true);a.run('stop()');
});

test('groove selection saves per part, rejects empty choices and migrates older arrangements',()=>{
 const a=app();for(const key of ['halftime','drive','sync','toms','space']){a.get('drum-block-'+key).checked=false;a.fire('drum-block-'+key,'change');}
 a.get('drum-block-backbeat').checked=false;a.fire('drum-block-backbeat','change');assert.equal(a.get('drum-block-backbeat').checked,true);assert.match(a.get('drum-block-status').textContent,/Mindestens/);
 a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.deepEqual(a.plain(a.run('composeSettings.drums.blocks')),['backbeat']);
 const old=JSON.parse(a.context.saved);for(const p of old.parts)delete p.meta.composeSettings.drums.blocks;a.context.old=JSON.stringify(old);assert.equal(a.run('readArrangement(old).parts[0].meta.composeSettings.drums.blocks.length'),6);
 const bad=JSON.parse(a.context.saved);bad.parts[0].meta.composeSettings.drums.blocks=['missing'];a.context.bad=JSON.stringify(bad);assert.throws(()=>a.run('readArrangement(bad)'),/Groove/);
});

test('ChatGPT uses groove choices and style without riff-playing instructions and rejects stale choices',async()=>{
 const a=app();a.choose('style','korn');
 for(const part of ['drums','arrangement','section']){const prompt=a.run(`chatTrackPrompt(chatTrackContext('${part}'),'')`);assert.match(prompt,/DRUM-GROOVE-BAUSTEINE/);assert.match(prompt,/Kick NICHT automatisch/);assert.match(prompt,/Korn-inspirierter Funk/);assert.match(prompt,/Standtom/);if(part==='drums')assert.doesNotMatch(prompt,/Aktive Gitarrenstimmung|genau ein Ton pro Anschlag/);}
 a.fire('open-ai-drums');a.run('aiPromptContext=chatTrackContext("drums")');a.get('drum-block-space').checked=false;a.fire('drum-block-space','change');a.get('ai-response').value=JSON.stringify({hits:[{step:0,kind:'kick'}]});await a.fire('ai-melody-form','submit');assert.match(a.get('ai-dialog-status').textContent,/geändert/);
});
