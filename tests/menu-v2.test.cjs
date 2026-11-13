const {app,midiTracks}=require('./harness.cjs');
const fs=require('node:fs'),path=require('node:path');
const assert=require('node:assert/strict'),test=require('node:test');
const seed=a=>a.run(`commitRiff([[{step:0,root:40,length:4,articulation:'open',voicing:[[0,2],[1,2]]}],[],[],[]]);refresh({drums:readChatDrums({hits:[{step:0,kind:'kick'},{step:4,kind:'snare'}]})},{drums:true});commitBass([[{step:0,root:28,length:6,articulation:'single'}],[],[],[]]);refresh({lead:[[{step:2,root:64,length:6,articulation:'single',expression:'bend',bendCents:100,bendShape:'up-return'}],[],[],[]]},{lead:true});commitVocal([[{step:0,root:64,length:5,articulation:'single'}],[],[],[]]);`);

test('V2 starts empty, editors closed, and old composers and banks are absent',async()=>{
 const a=app();assert.equal(a.run('selected.guitar.flat().length+selected.drums.flat(2).length'),0);
 for(const field of ['lead','bass','vocal'])assert.equal(a.run('selected.'+field),null);
 for(const track of ['riff','melody','bass','vocal','drums'])assert.equal(a.get('generate-'+track).disabled,false);
 for(const id of ['export','export-guitar','export-drums','export-lead','export-bass','export-vocal','tab-riff','tab-melody','tab-bass'])assert.equal(a.get(id).disabled,true);
 for(const symbol of ['originals','styles','generateGuitar','generatePolyRiff','makeLead','makeGroove','makeBass','makeVocal','stonerProfiles','motifLibrary'])assert.equal(a.run('typeof '+symbol),'undefined');
 const root=path.resolve(__dirname,'..');
 const html=fs.readFileSync(path.join(root,fs.existsSync(path.join(root,'dist/index.html'))?'dist/index.html':'index.html'),'utf8');
 const editors=[...html.matchAll(/<details[^>]*class="editor track-editor"[^>]*>/g)];assert.equal(editors.length,5);assert.ok(editors.every(m=>!m[0].includes(' open')));
 assert.equal(new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])).size,[...html.matchAll(/\bid="([^"]+)"/g)].length);
});

test('rhythm, density, movement and character change independently without composing',async()=>{
 const a=app(),before=a.run('JSON.stringify(selected)');
 a.choose('compose-riff-rhythm','syncopated');a.choose('compose-riff-movement','steps');a.choose('compose-riff-character','heavy');a.get('compose-riff-density').value='4';a.fire('compose-riff-density','input');
 assert.equal(a.run('JSON.stringify(selected)'),before);assert.equal(a.run('composeSettings.riff.density'),4);
 assert.equal(a.run('composeSettings.bass.rhythm'),'auto');assert.equal(a.get('compose-riff-density-label').textContent,'4 / 5');
 for(const part of ['riff','bass','melody','vocal','drums','arrangement','section']){
  const prompt=a.run(`chatTrackPrompt(chatTrackContext('${part}'),'druckvoll')`);assert.match(prompt,/WÜNSCHE FÜR DIE NEUE SPUR/);assert.match(prompt,/Rhythmus und Tonbewegung unabhängig/);
 }
 const prompt=a.run('chatTrackPrompt(chatTrackContext("riff"),"")');assert.match(prompt,/Synkopiert/);assert.match(prompt,/Kleine Tonschritte/);assert.match(prompt,/4\/5/);
});

test('settings survive song-part switching and V2 files; old files get neutral settings',async()=>{
 const a=app();a.choose('compose-riff-movement','arch');
 a.run(`saveSection();songParts.push({id:2,name:'Bridge',type:'Bridge',pattern:structuredClone(selected),meta:{...structuredClone(songParts[0].meta),composeSettings:defaultComposeSettings()}});openSection(2);`);
 assert.equal(a.get('compose-riff-movement').value,'auto');a.choose('compose-bass-rhythm','straight');a.run('openSection(1)');assert.equal(a.get('compose-riff-movement').value,'arch');
 a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.run('composeSettings.riff.movement'),'arch');a.run('openSection(2)');assert.equal(a.run('composeSettings.bass.rhythm'),'straight');
 const legacy=JSON.parse(a.context.saved);legacy.version=2;for(const p of legacy.parts)delete p.meta.composeSettings;a.context.legacy=JSON.stringify(legacy);a.run('loadArrangement(readArrangement(legacy))');assert.equal(a.run('composeSettings.riff.movement'),'auto');
 const invalid=JSON.parse(a.context.saved);invalid.parts[0].meta.composeSettings.riff.density=300;a.context.invalid=JSON.stringify(invalid);assert.throws(()=>a.run('readArrangement(invalid)'),/Dichte/);
});

test('song settings apply to every part without creating or replacing notes',async()=>{
 const a=app();seed(a);a.run("saveSection();songParts.push({id:2,name:'Bridge',type:'Bridge',pattern:structuredClone(selected),meta:structuredClone(songParts[0].meta)});globalThis.before=songParts.map(p=>JSON.stringify([p.pattern.guitar,p.pattern.drums,p.pattern.lead,p.pattern.bass,p.pattern.vocal]));");
 a.choose('style','hard');a.choose('key','7');a.choose('scale','phrygian');a.get('tempo').value='110';a.fire('tempo','change');
 assert.ok(a.run("songParts.every((p,i)=>p.pattern.style==='hard'&&p.pattern.key===7&&p.pattern.scale==='phrygian'&&p.pattern.tempo===110&&JSON.stringify([p.pattern.guitar,p.pattern.drums,p.pattern.lead,p.pattern.bass,p.pattern.vocal])===before[i])"));
 a.run('openSection(2)');assert.equal(a.get('tempo').value,110);
});

test('track menus clear with undo and redo while retaining companions',async()=>{
 const a=app();seed(a);
 for(const [track,field] of Object.entries({riff:'guitar',drums:'drums',melody:'lead',bass:'bass',vocal:'vocal'})){
  const before=a.run('JSON.stringify(selected.'+field+')');const companions=a.run(`JSON.stringify(Object.fromEntries(['guitar','drums','lead','bass','vocal'].filter(f=>f!=='${field}').map(f=>[f,selected[f]])))`);
  a.fire('clear-'+track);assert.ok(a.run(`!selected.${field}||selected.${field}.flat(2).length===0`));
  a.fire(track+'-undo');assert.equal(a.run('JSON.stringify(selected.'+field+')'),before);
  assert.equal(a.run(`JSON.stringify(Object.fromEntries(['guitar','drums','lead','bass','vocal'].filter(f=>f!=='${field}').map(f=>[f,selected[f]])))`),companions);
  a.fire(track+'-redo');assert.ok(a.run(`!selected.${field}||selected.${field}.flat(2).length===0`));a.fire(track+'-undo');
 }
});

test('new track menus retain ChatGPT comparison, stale-context rejection and export dialogs',async()=>{
 const a=app();seed(a);a.fire('track-ai-guitar');assert.equal(a.run('chatPart'),'riff');
 a.run('aiPromptContext=chatTrackContext("riff")');a.choose('compose-riff-movement','rise');
 a.get('ai-response').value=JSON.stringify({notes:[{step:0,pitches:[40],duration:4,articulation:'open'}]});await a.fire('ai-melody-form','submit');assert.match(a.get('ai-dialog-status').textContent,/geändert/);
 a.run('aiPromptContext=chatTrackContext("riff")');await a.fire('ai-melody-form','submit');assert.ok(a.run('chatComparison'));a.run('finishComparison(false)');
 for(const field of ['guitar','drums','lead','bass','vocal']){a.fire('export-'+field);assert.equal(a.get('midi-export-dialog').open,true);a.fire('midi-export-cancel');const tracks=midiTracks(a.run(`encodeMidi(selected,'${field}')`));assert.equal(tracks.length,1);}
 a.fire('save-arrangement');assert.equal(a.get('arrangement-save-dialog').open,true);a.get('arrangement-filename').value='Version 2';a.fire('arrangement-save-form','submit');assert.equal(a.downloads[0].name,'Version 2.json');
});

test('all five tracks keep audio, solo switching and whole-song playback',async()=>{
 const a=app();seed(a);
 for(const track of ['riff','drums','melody','bass','vocal']){await a.fire(track+'-solo');assert.equal(a.run('playback.soloTrack'),track);}
 await a.fire('vocal-solo');assert.equal(a.run('playback.soloTrack'),null);a.run('stop();saveSection();songParts.push({id:2,name:"Bridge",type:"Bridge",pattern:structuredClone(selected),meta:structuredClone(songParts[0].meta)})');
 await a.run('togglePlayback(true)');const visited=new Set();for(let i=0;i<400&&a.run('Boolean(playback)');i++){visited.add(a.run('playback.songIndex'));a.run('sound.context.currentTime+=.1;schedule()');}assert.deepEqual([...visited],[0,1]);assert.equal(a.run('playback'),null);
});
