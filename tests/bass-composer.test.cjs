const {app,midiTracks}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');
const seed=a=>a.run(`commitRiff([[{step:0,root:40,length:4,articulation:'open'},{step:6,root:43,length:3,articulation:'open'},{step:12,root:45,length:4,articulation:'open'}],[{step:0,root:40,length:4,articulation:'open'},{step:8,root:47,length:6,articulation:'open'}],[],[]]);refresh({drums:readChatDrums({hits:[{step:0,kind:'kick'},{step:7,kind:'kick'},{step:12,kind:'snare'}]})},{drums:true});`);

test('all bass styles, modes, tunings, scales and roots generate valid monophonic playable lines',()=>{
 const a=app();seed(a);a.run(`(()=>{
 let seed=63;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const style of Object.keys(bassStyleProfiles))for(const mode of Object.keys(bassModes))for(const tuning of Object.keys(bassTunings))for(const scale of Object.keys(scales))for(let key=0;key<12;key++){
  const count=[4,8,16][key%3],settings={...composeSettings.bass,density:key%5+1,bass:{mode,tuning,blocks:[Object.keys(bassPhraseBlocks)[key%4]]}};
  const bars=composeBass({...config,style,key,scale,bars:count},settings,fitBars(selected.guitar,count),fitBars(selected.drums,count),random);projectNotes(bars,count,true,false,21,55);
  const notes=bars.flatMap((ns,b)=>ns.map(n=>({...n,position:b*16+n.step}))),pitches=bassPitches({key,scale,bassTuning:tuning});
  if(notes.some((n,i)=>!pitches.includes(n.root)||n.length<1||n.position+n.length>count*16||(i&&notes[i-1].position+notes[i-1].length>n.position)||!bassTunings[tuning].notes.some(open=>n.root>=open&&n.root-open<=22)))throw Error('Invalid bass');
 }
 })()`);
});

test('riff mode follows notes, root mode stays on the song root and independent mode develops a motif',()=>{
 const a=app();seed(a);a.run(`(()=>{
  const p={...composeSettings.bass,bass:{...defaultBassOptions(),blocks:['pulse']}},follow=composeBass(config,p,selected.guitar,selected.drums);
  for(const n of follow[0]){const r=selected.guitar[0].find(r=>r.step===n.step);if(!r||r.root%12!==n.root%12)throw Error('Riff mismatch');}
  const root=composeBass(config,{...p,bass:{...p.bass,mode:'root'}},selected.guitar,selected.drums);if(root.flat().some(n=>n.root%12!==config.key))throw Error('Not root');
  const independent=composeBass(config,{...p,bass:{...p.bass,mode:'independent',blocks:['run']}},selected.guitar,selected.drums);if(new Set(independent.flat().map(n=>n.root)).size<2)throw Error('No melody');
 })()`);
});

test('bass controls preserve existing notes, generate from the start and support history',async()=>{
 const a=app();assert.equal(a.get('generate-bass').disabled,false);a.choose('bass-compose-mode','root');assert.equal(a.get('generate-bass').disabled,false);seed(a);
 const companions=a.run('JSON.stringify([selected.guitar,selected.drums,selected.lead,selected.vocal])');await a.fire('generate-bass');assert.ok(a.run('playback'));assert.equal(a.run('playback.visual[0].bar'),0);assert.equal(a.run('JSON.stringify([selected.guitar,selected.drums,selected.lead,selected.vocal])'),companions);
 const first=a.run('JSON.stringify(selected.bass)');a.choose('bass-tuning','a5');assert.equal(a.run('JSON.stringify(selected.bass)'),first);
 a.fire('bass-undo');assert.equal(a.run('selected.bass'),null);a.fire('bass-redo');assert.equal(a.run('JSON.stringify(selected.bass)'),first);a.run('stop()');
});

test('five-string bass supports A0 in the grid, tabs, sound, MIDI and arrangement history',async()=>{
 const a=app();a.choose('key','9');a.choose('bass-compose-mode','root');a.choose('bass-tuning','a5');await a.fire('generate-bass');
 assert.equal(a.run('selected.bass[0][0].root'),21);assert.ok(a.get('bass-grid').querySelector('button[data-pitch="21"]'));assert.equal(a.get('bass-tabs').textContent.split('\n').length,6);assert.match(a.get('bass-tabs').textContent,/A\|0--/);
 assert.ok(midiTracks(a.run('encodeMidi(selected,"bass")'))[0].some(e=>e.status===146&&e.body[0]===21));a.run('sound.bass(0,selected.bass[0][0],15/90)');
 a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.run('selected.bass[0][0].root'),21);assert.equal(a.get('bass-tuning').value,'a5');a.fire('bass-undo');assert.equal(a.run('selected.bass'),null);a.fire('bass-redo');assert.equal(a.run('selected.bass[0][0].root'),21);
 a.choose('bass-tuning','dropd');assert.equal(a.run('selected.bass[0][0].root'),21);
 a.fire('tab-bass');assert.match(a.get('tab-tuning').textContent,/5 Saiten/);
});

test('bass blocks persist and migrate; new settings and AI tuning reach ChatGPT',async()=>{
 const a=app();for(const key of ['pulse','octave','run']){a.get('bass-block-'+key).checked=false;a.fire('bass-block-'+key,'change');}a.get('bass-block-hold').checked=false;a.fire('bass-block-hold','change');assert.equal(a.get('bass-block-hold').checked,true);
 a.choose('bass-compose-mode','independent');a.choose('bass-tuning','a5');a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.get('bass-tuning').value,'a5');assert.equal(a.get('bass-compose-mode').value,'independent');
 const legacy=JSON.parse(a.context.saved);for(const p of legacy.parts)delete p.meta.composeSettings.bass.bass;a.context.legacy=JSON.stringify(legacy);assert.equal(a.run('readArrangement(legacy).parts[0].meta.composeSettings.bass.bass.tuning'),'dropd');
 a.choose('key','9');a.fire('open-ai-bass');const prompt=a.run('chatTrackPrompt(chatTrackContext("bass"),"")');assert.match(prompt,/BASS-BAUSTEINE/);assert.match(prompt,/5 Saiten/);assert.match(prompt,/21, /);assert.match(prompt,/warm und leicht angezerrt/);
 a.get('ai-response').value=JSON.stringify({notes:[{step:0,pitch:21,duration:8}]});await a.fire('ai-melody-form','submit');await a.run('finishComparison(true)');assert.equal(a.run('selected.bass[0][0].root'),21);assert.equal(a.run('selected.bass[0][0].bassTuning'),'a5');a.run('stop()');
});

test('empty arrangement generates only bass and riff mode falls back to independent without changing preference',async()=>{
 const a=app(),before=a.run('JSON.stringify([selected.guitar,selected.drums,selected.lead,selected.vocal])');assert.equal(a.get('generate-bass').disabled,false);
 a.run(`(()=>{const settings={...composeSettings.bass,bass:{...defaultBassOptions(),blocks:['run']}},empty=selected.guitar;let seed=7;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);const one=composeBass(config,settings,empty,selected.drums,random);seed=7;const two=composeBass(config,{...settings,bass:{...settings.bass,mode:'independent'}},empty,selected.drums,random);if(JSON.stringify(one)!==JSON.stringify(two))throw Error('Not independent fallback');})()`);
 await a.fire('generate-bass');assert.ok(a.run('selected.bass.flat().length')>0);assert.equal(a.run('composeSettings.bass.bass.mode'),'riff');assert.equal(a.run('JSON.stringify([selected.guitar,selected.drums,selected.lead,selected.vocal])'),before);assert.equal(a.run('playback.visual[0].bar'),0);
 a.fire('bass-undo');assert.equal(a.run('selected.bass'),null);a.fire('bass-redo');assert.ok(a.run('selected.bass.flat().length')>0);a.run('stop()');
 a.fire('open-ai-bass');const prompt=a.run('chatTrackPrompt(chatTrackContext("bass"),"")');assert.match(prompt,/Eigenständiges wiedererkennbares Bassmotiv/);assert.match(prompt,/Wenn kein Riff vorhanden/);assert.doesNotMatch(prompt,/Folge den Grundtönen und wichtigen Anschlägen des Riffs/);
 seed(a);assert.equal(a.run('effectiveBassMode(composeSettings.bass.bass.mode,selected.guitar)'),'riff');
});
