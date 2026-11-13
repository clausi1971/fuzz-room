const {app,midiTracks}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');

test('octave buttons transpose the whole section, including techniques, with one undo step',()=>{
 const a=app();assert.equal(a.get('melody-octave-up').disabled,true);assert.equal(a.get('melody-octave-down').disabled,true);
 a.run(`refresh({lead:[[{step:0,root:83,length:4,articulation:'single',expression:'bend',bendCents:100},{step:4,root:81,length:4,articulation:'single',transition:'pull'}],[],[{step:0,root:76,from:74,length:8,articulation:'single',transition:'slide'}],[]]},{lead:true});melodyBar=2;renderMelodyGrid();globalThis.before=JSON.stringify(selected.lead);globalThis.companions=JSON.stringify([selected.guitar,selected.drums,selected.bass,selected.vocal]);`);
 a.fire('melody-octave-up');assert.deepEqual(a.plain(a.run('selected.lead.flat().map(n=>n.root)')),[95,93,88]);assert.equal(a.run('selected.lead[2][0].from'),86);assert.equal(a.run('selected.lead[0][0].bendCents'),100);assert.equal(a.run('selected.lead[0][1].transition'),'pull');assert.equal(a.run('selected.lead[2][0].length'),8);assert.equal(a.run('JSON.stringify([selected.guitar,selected.drums,selected.bass,selected.vocal])'),a.run('companions'));assert.equal(a.run('playback'),undefined);
 a.fire('melody-undo');assert.equal(a.run('JSON.stringify(selected.lead)'),a.run('before'));a.fire('melody-redo');assert.equal(a.run('selected.lead[0][0].root'),95);a.fire('melody-octave-down');assert.equal(a.run('JSON.stringify(selected.lead)'),a.run('before'));
});

test('transposed notes beyond the base grid save, reload and export as actual shifted MIDI notes',()=>{
 const a=app();a.run("refresh({lead:[[{step:0,root:83,length:4,articulation:'single'}],[],[],[]]},{lead:true})");a.fire('melody-octave-up');
 assert.ok(a.get('melody-grid').querySelector('button[data-pitch="95"]'));
 a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.run('selected.lead[0][0].root'),95);a.fire('melody-undo');assert.equal(a.run('selected.lead[0][0].root'),83);a.fire('melody-redo');
 assert.ok(midiTracks(a.run('encodeMidi(selected,"lead")'))[0].some(e=>(e.status&240)===144&&e.body[0]===95));
});

test('octave limits block the whole move without clipping notes or altering history',()=>{
 const a=app();a.run("refresh({lead:[[{step:0,root:120,length:4,articulation:'single'}],[],[],[]]},{lead:true})");assert.equal(a.get('melody-octave-up').disabled,true);const notes=a.run('JSON.stringify(selected.lead)');a.fire('melody-octave-up');assert.equal(a.run('JSON.stringify(selected.lead)'),notes);
 a.run("refresh({lead:[[{step:0,root:5,length:4,articulation:'single'}],[],[],[]]},{lead:true})");assert.equal(a.get('melody-octave-down').disabled,true);a.fire('melody-octave-up');assert.equal(a.run('selected.lead[0][0].root'),17);
});
