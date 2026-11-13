const {app,midiTracks}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');
test('vocal phrases respect all styles, scales, keys, ranges and automatic breathing',()=>{
 const a=app();a.run(`(()=>{let seed=47;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(const style of Object.keys(vocalStyleProfiles))for(const scale of Object.keys(scales))for(let key=0;key<12;key++)for(const range of Object.keys(vocalRanges)){
 const count=[4,8,16][key%3],p={...composeSettings.vocal,density:key%5+1,vocal:{blocks:[Object.keys(vocalPhraseBlocks)[key%4]],sound:'ah'}},cfg={...config,style,scale,key,bars:count};
 const bars=composeVocal(cfg,p,range,Array.from({length:count},()=>[]),null,null,null,random),pool=vocalPitches(cfg,range),notes=bars.flatMap((ns,b)=>ns.map(n=>({...n,pos:b*16+n.step})));
 if(!notes.length)throw Error('Empty');for(let i=0;i<notes.length;i++){const n=notes[i];if(!pool.includes(n.root)||n.length<1||n.pos+n.length>count*16||(i&&notes[i-1].pos+notes[i-1].length>n.pos)||n.expression)throw Error('Invalid note');}
 for(let end=32;end<=count*16;end+=32)if(notes.some(n=>n.pos<end&&n.pos+n.length>end-vocalStyleProfiles[style].breath))throw Error('Missing breath');
 }})()`);
});
test('every isolated vocal block produces varied new phrases',()=>{
 const a=app();a.run(`(()=>{let seed=82;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);for(const block of Object.keys(vocalPhraseBlocks)){const p={...composeSettings.vocal,vocal:{blocks:[block],sound:'ah'}},results=Array.from({length:12},()=>JSON.stringify(composeVocal(config,p,'mid',selected.guitar,null,selected.drums,null,random)));if(new Set(results).size<10)throw Error('Insufficient variation '+block);}})()`);
});
test('vocal generation preserves companions and supports autoplay, history and MIDI',async()=>{
 const a=app();a.run(`commitRiff([[{step:0,root:40,length:8,articulation:'open'}],[],[],[]]);`);const before=a.run('JSON.stringify([selected.guitar,selected.bass,selected.drums,selected.lead])');
 await a.fire('generate-vocal');assert.equal(a.run('JSON.stringify([selected.guitar,selected.bass,selected.drums,selected.lead])'),before);assert.equal(a.run('playback.visual[0].bar'),0);assert.ok(a.run('selected.vocal.flat().length')>0);
 const notes=a.run('JSON.stringify(selected.vocal)');a.fire('vocal-undo');assert.equal(a.run('selected.vocal'),null);a.fire('vocal-redo');assert.equal(a.run('JSON.stringify(selected.vocal)'),notes);
 assert.ok(midiTracks(a.run('encodeMidi(selected,"vocal")'))[0].some(e=>(e.status&240)===144));a.run('stop()');
});
test('vocal settings migrate, persist and reach ChatGPT with range and companion context',()=>{
 const a=app();for(const k of ['hook','speech','answer']){a.get('vocal-block-'+k).checked=false;a.fire('vocal-block-'+k,'change');}a.get('vocal-block-arc').checked=false;a.fire('vocal-block-arc','change');assert.equal(a.get('vocal-block-arc').checked,true);
 a.choose('vocal-sound','guide');a.choose('vocal-range','low');a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.get('vocal-sound').value,'guide');assert.equal(a.get('vocal-range').value,'low');
 const legacy=JSON.parse(a.context.saved);for(const p of legacy.parts)delete p.meta.composeSettings.vocal.vocal;a.context.legacy=JSON.stringify(legacy);assert.equal(a.run('readArrangement(legacy).parts[0].meta.composeSettings.vocal.vocal.sound'),'guide');
 a.fire('open-ai-vocal');const prompt=a.run('chatTrackPrompt(chatTrackContext("vocal"),"")');assert.match(prompt,/GESANGS-BAUSTEINE/);assert.match(prompt,/Lange Gesangsbögen/);assert.match(prompt,/Atempausen/);assert.match(prompt,/Riff, Bass und Drums/);assert.throws(()=>a.run('readVocalOptions({blocks:[],sound:"guide"})'));
});
test('guide tone and Ah use the same pitch with different synthesis and saved part selection',async()=>{
 const a=app();assert.equal(a.get('vocal-sound').value,'guide');assert.equal(a.get('vocal-volume').value,'100');await a.fire('generate-vocal');a.run(`(()=>{const ctx=sound.context,original=ctx.createOscillator.bind(ctx),made=[];ctx.createOscillator=()=>{const n=original();made.push(n);return n;};sound.setVocalTone('guide');sound.vocal(0,{root:69,length:4},.1);if(made.length!==1||made[0].type!=='triangle'||made[0].frequency.value!==440)throw Error('Guide');made.length=0;sound.setVocalTone('ah');sound.vocal(0,{root:69,length:4},.1);if(made.length!==2||made[0].type!=='sawtooth'||made[0].frequency.value!==440)throw Error('Ah');ctx.createOscillator=original;playback.song=[{id:'other',meta:{composeSettings:{vocal:{vocal:{sound:'guide'}}}}}];playback.songIndex=0;if(currentVocalTone()!=='guide')throw Error('Part sound');})()`);a.run('stop()');
});
