const {app}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');
const header=(a,track,bar)=>a.get(track==='drums'?'drum-grid':track+'-grid').querySelector(`button[data-loop-bar="${bar}"]`);

test('bar headings do not start stopped audio and toggle a shared loop across all grids',async()=>{
 const a=app();header(a,'riff',1).click();assert.equal(a.run('playback'),undefined);assert.equal(header(a,'riff',1).attrs['aria-pressed'],'false');
 await a.fire('generate-riff');header(a,'melody',1).click();
 assert.equal(a.run('playback.loopBar'),1);assert.equal(a.run('playback.visual[0].bar'),1);assert.equal(a.run('playback.visual[0].step'),0);
 for(const track of ['riff','melody','bass','vocal','drums'])assert.equal(header(a,track,1).attrs['aria-pressed'],'true');
 for(let i=0;i<100;i++){a.run('sound.context.currentTime+=.05;schedule()');assert.ok(a.run('playback.visual.every(v=>v.bar===1)'));}
 a.run('renderRiffGrid()');assert.equal(header(a,'riff',1).attrs['aria-pressed'],'true');
 header(a,'bass',1).click();assert.equal(a.run('playback.loopBar'),null);assert.equal(a.run('playback.visual[0].bar'),0);assert.equal(a.run('playback.visual[0].step'),0);
 for(const track of ['riff','melody','bass','vocal','drums'])assert.equal(header(a,track,1).attrs['aria-pressed'],'false');a.run('stop()');
});

test('switching loop bars retains solo, mutes and gains and works in single-bar views',async()=>{
 const a=app();await a.fire('generate-riff');await a.fire('riff-solo');a.fire('drum-volume-mute');const levels=a.run('JSON.stringify([...mixerMutes])');
 header(a,'drums',2).click();assert.equal(a.run('playback.loopBar'),2);assert.equal(a.run('playback.soloTrack'),'riff');assert.equal(a.run('sound.drumLevel.gain.value'),0);assert.equal(a.run('JSON.stringify([...mixerMutes])'),levels);
 a.run('melodyBar=3;renderMelodyGrid()');header(a,'melody',3).click();assert.equal(a.run('playback.loopBar'),3);assert.equal(header(a,'riff',2).attrs['aria-pressed'],'false');assert.equal(header(a,'riff',3).attrs['aria-pressed'],'true');
 a.run('sound.context.currentTime+=10;schedule()');assert.ok(a.run('playback.visual.every(v=>v.bar===3)'));
 a.run('stop()');assert.equal(header(a,'riff',3).attrs['aria-pressed'],'false');
});

test('bar loops clip long melody notes and include notes held over from earlier bars',async()=>{
 const a=app();a.run("refresh({lead:[[{step:8,root:64,length:40,articulation:'single'}],[],[],[]]},{lead:true})");await a.fire('riff-play');
 a.run('globalThis.heard=[];sound.lead=(time,note)=>heard.push({...note})');header(a,'riff',1).click();assert.equal(a.run('heard[0].root'),64);assert.equal(a.run('heard[0].length'),16);
 await a.fire('generate-riff');assert.ok(a.run('playback'));assert.equal(a.run('playback.loopBar'),undefined);assert.equal(a.run('playback.visual[0].bar'),0);a.run('stop()');
});
