const {app}=require('./harness.cjs');
const assert=require('node:assert/strict'),test=require('node:test');
test('PM percentage rounds exactly, preserves rhythm and generates single-note attacks',async()=>{
 const a=app();a.run(`(()=>{
  let seed;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const settings={...composeSettings.riff,character:'wide',blocks:{rhythms:['pulse'],motions:['line'],form:'abab'}};
  let first;
  for(const pm of [0,1,25,50,75,99,100]){
    seed=65;riffTake=0;recentRiffs.clear();
    const bars=composeRiff(config,{...settings,pm},{},random),notes=bars.flat();projectNotes(bars,4,false);
    if(notes.filter(n=>n.articulation==='mute').length!==Math.round(notes.length*pm/100))throw Error('Wrong PM percentage');
    if(notes.some(n=>guitarPitches(n).length!==1))throw Error('Chord');
    const shape=JSON.stringify(bars.map(bar=>bar.map(n=>[n.step,n.root,n.length])));
    if(first&&shape!==first)throw Error('PM changed rhythm or notes');first=shape;
  }
  seed=65;const bars=composeRiff(config,{...settings,pm:0},{},random);
  if(!bars.some(notes=>notes.some(n=>notes.some(other=>other.root!==n.root&&other.step>n.step&&other.step<n.step+n.length))))throw Error('No independent sustain');
 })()`);
});

test('PM slider preserves existing chords and companions, roundtrips and invalidates stale prompts',async()=>{
 const a=app();a.run(`commitRiff([[{step:0,root:40,length:8,articulation:'open',voicing:[[0,2],[1,2]]}],[],[],[]]);globalThis.before=JSON.stringify(selected);`);
 a.get('riff-pm').value='50';a.fire('riff-pm','input');assert.equal(a.run('JSON.stringify(selected)'),a.run('before'));assert.equal(a.get('riff-pm-value').textContent,'50 %');
 for(const part of ['riff','arrangement','section']){
  const prompt=a.run(`chatTrackPrompt(chatTrackContext('${part}'),'')`);assert.match(prompt,/Palm-Mute-Anteil 50 %/);assert.match(prompt,/genau EIN Ton/);assert.match(prompt,/ausklingende Töne dürfen sich überlagern/);assert.doesNotMatch(prompt,/Keine automatischen[^.]*Palm-Mutes/);
 }
 a.context.saved=a.run('createArrangement()');a.run('loadArrangement(readArrangement(saved))');assert.equal(a.run('composeSettings.riff.pm'),50);assert.equal(a.get('riff-pm').value,50);assert.equal(a.run('guitarPitches(selected.guitar[0][0]).length'),2);
 const old=JSON.parse(a.context.saved);for(const part of old.parts)delete part.meta.composeSettings.riff.pm;a.context.old=JSON.stringify(old);assert.equal(a.run('readArrangement(old).parts[0].meta.composeSettings.riff.pm'),0);
 const bad=JSON.parse(a.context.saved);bad.parts[0].meta.composeSettings.riff.pm=101;a.context.bad=JSON.stringify(bad);assert.throws(()=>a.run('readArrangement(bad)'),/Palm-Mute/);
 a.fire('open-ai-riff');a.run('aiPromptContext=chatTrackContext("riff")');a.get('riff-pm').value='100';a.fire('riff-pm','input');a.get('ai-response').value=JSON.stringify({notes:[{step:0,pitches:[40],duration:4,articulation:'mute'}]});await a.fire('ai-melody-form','submit');assert.match(a.get('ai-dialog-status').textContent,/geändert/);
 await a.fire('generate-riff');assert.ok(a.run("selected.guitar.flat().every(n=>n.articulation==='mute'&&guitarPitches(n).length===1)"));a.fire('riff-undo');assert.equal(a.run('guitarPitches(selected.guitar[0][0]).length'),2);
});
