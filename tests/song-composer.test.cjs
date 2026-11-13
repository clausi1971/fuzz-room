const {app}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');
test('automatic arrangement settings and all five generated tracks are valid across styles and lengths',()=>{
 const a=app();a.run(`(()=>{for(const style of Object.keys(bassStyleProfiles))for(const role of ['intro','verse','chorus','bridge','outro'])for(const bars of [4,8,16]){
 const {pattern:p,settings}=composeAutomaticPart({...config,style},role,bars,'mid',composeSettings);readComposeSettings(settings);projectNotes(p.guitar,bars,false);projectNotes(p.lead,bars,true,true,0,127);projectNotes(p.bass,bars,true,true,21,55);projectNotes(p.vocal,bars,true,true,45,77);projectDrums(p.drums,bars);
 if(!p.guitar.flat().length||!p.drums.flat(2).length||!p.lead.flat().length||!p.bass.flat().length||!p.vocal.flat().length)throw Error('Empty track');if(p.mode!=='riff')throw Error('Not riff');
 }})()`);
});
test('whole-song button generates named recurring sections, starts at the beginning and roundtrips',async()=>{
 const a=app();a.fire('generate-arrangement');assert.equal(a.get('generate-arrangement-dialog').open,true);assert.equal(a.get('generate-arrangement-warning').hidden,true);
 await a.fire('generate-arrangement-form','submit');assert.equal(a.run('songParts.length'),8);assert.equal(a.run('songParts.reduce((n,p)=>n+p.pattern.guitar.length,0)'),52);assert.equal(a.run('playback.song.length'),8);assert.equal(a.run('playback.visual[0].bar'),0);
 assert.equal(a.run('songParts[0].name'),'Intro');assert.equal(a.run('songParts[5].name'),'Bridge');assert.equal(a.run('JSON.stringify(songParts[1].pattern)'),a.run('JSON.stringify(songParts[3].pattern)'));assert.equal(a.run('JSON.stringify(songParts[2].pattern)'),a.run('JSON.stringify(songParts[6].pattern)'));assert.equal(a.run('songParts[2].pattern===songParts[4].pattern'),false);
 a.context.saved=a.run('createArrangement()');assert.equal(a.run('readArrangement(saved).parts.length'),8);a.run('loadArrangement(readArrangement(saved))');assert.equal(a.run('songParts[7].name'),'Outro');
});
test('existing song requires explicit replacement and cancellation preserves notes and playback',async()=>{
 const a=app();await a.fire('generate-bass');const before=a.run('JSON.stringify(songParts)');a.fire('generate-arrangement');assert.equal(a.get('generate-arrangement-warning').hidden,false);assert.equal(a.get('generate-arrangement-confirm').disabled,true);
 await a.fire('generate-arrangement-form','submit');assert.equal(a.run('JSON.stringify(songParts)'),before);assert.ok(a.run('playback'));a.fire('generate-arrangement-cancel');assert.equal(a.get('generate-arrangement-dialog').open,false);assert.equal(a.run('JSON.stringify(songParts)'),before);
 a.fire('generate-arrangement');a.get('generate-arrangement-replace').checked=true;a.fire('generate-arrangement-replace','change');assert.equal(a.get('generate-arrangement-confirm').disabled,false);a.choose('generate-arrangement-scope','part');assert.equal(a.get('generate-arrangement-confirm').disabled,true);
 a.get('generate-arrangement-replace').checked=true;a.fire('generate-arrangement-replace','change');await a.fire('generate-arrangement-form','submit');assert.equal(a.run('songParts.length'),1);assert.ok(a.run('selected.guitar.flat().length'));assert.equal(a.run('playback.song'),null);a.fire('riff-undo');assert.equal(a.run('selected.guitar.flat().length'),0);a.run('stop()');
});
test('single-part generation retains other sections, sound and tuning choices and supports undo',async()=>{
 const a=app();a.run(`songParts.push({id:2,name:'Behalten',type:'Bridge',pattern:structuredClone(selected),meta:{...comparisonMeta(),style:config.style,melodyStyle:config.melodyStyle,groove:0,leadTake:0}});sectionSerial=2;`);
 a.choose('bass-tuning','a5');a.choose('vocal-range','low');a.choose('vocal-sound','guide');a.choose('melody-sound','dark');const other=a.run('JSON.stringify(songParts[1])');
 a.fire('generate-arrangement');a.choose('generate-arrangement-scope','part');assert.equal(a.get('generate-arrangement-warning').hidden,true);await a.fire('generate-arrangement-form','submit');assert.equal(a.run('JSON.stringify(songParts[1])'),other);assert.equal(a.run('selected.guitar.length'),4);assert.equal(a.get('bass-tuning').value,'a5');assert.equal(a.get('vocal-sound').value,'guide');assert.equal(a.get('melody-sound').value,'dark');assert.equal(a.get('vocal-range').value,'low');
 a.fire('vocal-undo');assert.equal(a.run('selected.vocal'),null);a.fire('vocal-redo');assert.ok(a.run('selected.vocal.flat().length'));a.context.saved=a.run('createArrangement()');assert.equal(a.run('readArrangement(saved).parts.length'),2);a.run('stop()');
});
