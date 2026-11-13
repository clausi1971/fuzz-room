const {app}=require('./harness.cjs');const assert=require('node:assert/strict'),test=require('node:test');
const seed=a=>a.run(`commitRiff([[{step:0,root:40,length:4,articulation:'open'}],[],[],[]]);commitMelody([[{step:0,root:67,length:4,articulation:'single'}],[],[],[]]);commitBass([[{step:0,root:28,length:4,articulation:'single'}],[],[],[]]);commitVocal([[{step:0,root:64,length:4,articulation:'single'}],[],[],[]]);refresh({drums:readChatDrums({hits:[{step:0,kind:'kick'}]})},{drums:true});`);
test('all heading solo controls share transport and state with raster controls while retaining mutes',async()=>{
 const a=app();seed(a);a.fire('bass-volume-mute');
 for(const track of ['riff','melody','bass','vocal','drums']){
 await a.fire('heading-'+track+'-solo');assert.equal(a.run('playback.soloTrack'),track);assert.equal(a.get(track+'-solo').attrs['aria-pressed'],'true');assert.equal(a.get('heading-'+track+'-solo').attrs['aria-pressed'],'true');assert.equal(a.get('bass-volume-mute').attrs['aria-pressed'],'true');
 for(const other of ['riff','melody','bass','vocal','drums'].filter(t=>t!==track)){assert.equal(a.get('heading-'+other+'-solo').attrs['aria-pressed'],'false');assert.ok(a.get('heading-volume-'+other).classes.has('heading-solo-muted'));}
 }
 await a.fire('drums-solo');assert.equal(a.run('playback.soloTrack'),null);assert.equal(a.get('heading-drums-solo').attrs['aria-pressed'],'false');assert.equal(a.run('isMixerMuted("bass-volume")'),true);a.run('stop()');
});
test('song-card play starts the chosen section, switches directly and toggles stop',async()=>{
 const a=app();seed(a);a.run(`saveSection();songParts.push({id:2,name:'Bridge',type:'Bridge',pattern:structuredClone(selected),meta:structuredClone(songParts[0].meta)});sectionSerial=2;renderSong();`);
 const button=id=>a.get('song-parts').children.find(c=>Number(c.children[0].dataset.section)===id).querySelector('button[data-play]');
 const click=async id=>a.get('song-parts').handlers.click({target:button(id)});
 await click(2);assert.equal(a.run('activeSection'),2);assert.equal(a.run('playback.song'),null);assert.equal(a.run('playback.visual[0].bar'),0);assert.equal(button(2).textContent,'■ Stopp');assert.equal(button(1).textContent,'▶ Play');
 await click(1);assert.equal(a.run('activeSection'),1);assert.equal(button(1).attrs['aria-pressed'],'true');assert.equal(button(2).textContent,'▶ Play');await click(1);assert.equal(a.run('playback'),null);assert.equal(button(1).textContent,'▶ Play');
 await a.run('togglePlayback(true)');await click(2);assert.equal(a.run('playback.song'),null);assert.equal(a.run('activeSection'),2);assert.equal(button(2).textContent,'■ Stopp');a.run('stop()');
});
test('empty melody bass and vocal heading solos are disabled until notes exist',()=>{
 const a=app();for(const track of ['melody','bass','vocal'])assert.equal(a.get('heading-'+track+'-solo').disabled,true);seed(a);for(const track of ['riff','melody','bass','vocal','drums'])assert.equal(a.get('heading-'+track+'-solo').disabled,false);
});
