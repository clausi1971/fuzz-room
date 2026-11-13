const {app}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');
test('generated riffs immediately play the current part from bar one with solo cleared',async()=>{
 const a=app();await a.fire('generate-riff');assert.ok(a.run('playback'));assert.strictEqual(a.run('playback.active'),a.run('selected'));assert.equal(a.run('playback.soloTrack'),null);assert.equal(a.run('playback.song'),null);assert.equal(a.run('playback.visual[0].step'),0);
 await a.fire('riff-solo');assert.equal(a.run('playback.soloTrack'),'riff');a.run('sound.context.currentTime+=2;schedule()');
 const previous=a.run('playback');await a.fire('generate-riff');assert.notStrictEqual(a.run('playback'),previous);assert.equal(a.run('playback.soloTrack'),null);assert.equal(a.run('playback.visual[0].step'),0);assert.strictEqual(a.run('playback.active'),a.run('selected'));
 assert.equal(a.run('sound.drumLevel.gain.value>0&&sound.guitarLevel.gain.value>0'),true);
 a.run('stop()');
});

test('adopting any ChatGPT track plays from bar one; comparison and discarding do not auto-start',async()=>{
 for(const part of ['riff','drums','melody','bass','vocal','arrangement']){
  const a=app();a.context.part=part;
  a.run(`chatPart=part;const base=selected;const candidate={...selected,guitar:[[{step:0,root:40,length:4,articulation:'open'}],[],[],[]],drums:readChatDrums({hits:[{step:0,kind:'kick'}]}),lead:[[{step:0,root:64,length:4,articulation:'single'}],[],[],[]],bass:[[{step:0,root:28,length:4,articulation:'single'}],[],[],[]],vocal:[[{step:0,root:64,length:4,articulation:'single'}],[],[],[]]};chatComparison={base,candidate,beforeMeta:comparisonMeta(),afterMeta:comparisonMeta(),part,active:'before'};renderComparison();`);
  assert.equal(a.run('playback'),undefined);a.run('selectComparison("after")');assert.equal(a.run('playback'),undefined);
  await a.run('finishComparison(true)');assert.ok(a.run('playback'));assert.equal(a.run('playback.visual[0].step'),0);assert.equal(a.run('playback.soloTrack'),null);assert.ok(a.run('sound.leadLevel.gain.value>0&&sound.bassLevel.gain.value>0&&sound.vocalLevel.gain.value>0'));a.run('stop()');
 }
 const a=app();a.run(`chatComparison={base:selected,candidate:{...selected},beforeMeta:comparisonMeta(),afterMeta:comparisonMeta(),part:'riff',active:'before'};finishComparison(false)`);assert.equal(a.run('playback'),undefined);
});

test('rapid regeneration during audio startup leaves only the latest riff playing',async()=>{
 const a=app();const starts=[a.fire('generate-riff'),a.fire('generate-riff'),a.fire('generate-riff')];await Promise.all(starts);await Promise.resolve();await Promise.resolve();
 assert.ok(a.run('playback'));assert.strictEqual(a.run('playback.active'),a.run('selected'));assert.equal(a.run('playback.soloTrack'),null);assert.equal(a.run('generatedRestartPending'),false);assert.equal(a.get('play').disabled,false);a.run('stop()');
});
