const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const appDir = fs.existsSync(path.join(root, 'dist/index.html')) ? path.join(root, 'dist') : root;

function app() {
  const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const elements = new Map(), downloads = [], blobs = new Map();
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.handlers = {};
      this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this._text = '';
      this.style = {setProperty(){}}; this.classes = new Set();
      this.classList = {add:(...names)=>names.forEach(name=>this.classes.add(name)), remove:(...names)=>names.forEach(name=>this.classes.delete(name)), toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};
    }
    set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classes].join(' '); }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child=>typeof child==='string'?child:child.textContent).join(''); }
    append(...nodes) { for(const node of nodes) if(typeof node==='object')node.parentElement=this; this.children.push(...nodes); }
    replaceChildren(...nodes) { this._text=''; this.children=[]; this.append(...nodes); }
    setAttribute(key,value) { this.attrs[key]=String(value); }
    addEventListener(event,fn) { this.handlers[event]=fn; }
    click() { if(this.disabled)return; if(this.tagName==='a')downloads.push({name:this.download,blob:blobs.get(this.href)}); return this.handlers.click?.({target:this}); }
    matches(selector) {
      const tag=selector.match(/^[a-z]+/); if(tag&&tag[0]!==this.tagName)return false;
      for(const [,name] of selector.matchAll(/\.([\w-]+)/g))if(!this.classes.has(name))return false;
      for(const [,key,value] of selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)) {
        const actual=key.startsWith('data-')?this.dataset[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]:this.attrs[key];
        if(value===undefined?actual===undefined:String(actual)!==value)return false;
      }
      return true;
    }
    closest(selector) { return this.matches(selector)?this:this.parentElement?.closest(selector); }
    querySelectorAll(selector) { const all=this.children.flatMap(child=>typeof child==='object'?[child,...child.querySelectorAll('*')]:[]); return selector==='*'?all:all.filter(child=>child.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
    get selectedOptions() { return this.options?.filter(option=>option.value===String(this.value)) ?? []; }
    showModal() { this.open=true; } close() { this.open=false; } focus(){} select(){} setPointerCapture(){}
    getBoundingClientRect(){return {left:100+(Number(this.dataset.bar)*16+Number(this.dataset.step))*20,right:119+(Number(this.dataset.bar)*16+Number(this.dataset.step))*20};}
  }
  const get=id=>{
    assert.ok(ids.has(id),`Missing element #${id}`);
    if(!elements.has(id)){const element=new Element();element.id=id;elements.set(id,element);}return elements.get(id);
  };
  for(const [,tag,attrs] of html.matchAll(/<(input|button|select)\b([^>]*)>/g)) {
    const id=attrs.match(/\bid="([^"]+)"/)?.[1];if(!id)continue;
    const node=get(id);node.tagName=tag;node.value=attrs.match(/\bvalue="([^"]*)"/)?.[1]??'';
    node.disabled=/\bdisabled\b/.test(attrs);node.hidden=/\bhidden\b/.test(attrs);
  }
  for(const [,attrs,body] of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const id=attrs.match(/\bid="([^"]+)"/)?.[1];if(!id)continue;
    const node=get(id);node.options=[...body.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map(([,attrs,text])=>({value:attrs.match(/value="([^"]*)"/)?.[1],textContent:text,selected:/\bselected\b/.test(attrs)}));
    node.value=(node.options.find(option=>option.selected)??node.options[0])?.value??'';
  }
  const param=()=>({value:0,events:[],setValueAtTime(value,time){this.events.push([time,value]);},linearRampToValueAtTime(value,time){this.events.push([time,value]);},setTargetAtTime(value){this.value=value;}});
  const node=()=>({gain:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),frequency:param(),Q:param(),pan:param(),detune:param(),connect(next){return next;},disconnect(){},start(){},stop(){},addEventListener(){},setPeriodicWave(){}});
  class AudioContext {
    constructor(){this.currentTime=0;this.sampleRate=8000;this.destination=node();}
    resume(){return Promise.resolve();} createPeriodicWave(){return {};}
    createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return {duration:length/rate,getChannelData:index=>data[index]};}
  }
  for(const kind of ['Gain','DynamicsCompressor','Convolver','BiquadFilter','WaveShaper','StereoPanner','BufferSource','Oscillator'])AudioContext.prototype['create'+kind]=node;
  const context=vm.createContext({document:{getElementById:get,createElement:tag=>new Element(tag)},AudioContext,TextEncoder,Blob,structuredClone,console,
    URL:{createObjectURL(blob){const id='blob:'+blobs.size;blobs.set(id,blob);return id;},revokeObjectURL(){}},navigator:{clipboard:{writeText:async()=>{}}},
    setInterval(){return 1;},clearInterval(){},setTimeout(){},requestAnimationFrame(){return 1;},cancelAnimationFrame(){}});
  const run=code=>vm.runInContext(code,context);
  for(const [,file] of html.matchAll(/<script src="([^"]+)"/g))run(fs.readFileSync(path.join(appDir,file.split('?')[0]),'utf8'));
  const fire=(id,event='click')=>get(id).handlers[event]({target:get(id),preventDefault(){}});
  const choose=(id,value)=>{get(id).value=value;fire(id,'change');};
  const plain=value=>JSON.parse(JSON.stringify(value));
  return {get,run,fire,choose,context,downloads,plain};
}

function midiTracks(bytes) {
  const buffer=Buffer.from(bytes);assert.equal(buffer.toString('ascii',0,4),'MThd');
  const count=buffer.readUInt16BE(10),tracks=[];let at=14;
  const variable=()=>{let value=0,byte;do{byte=buffer[at++];value=value*128+(byte&127);}while(byte&128);return value;};
  for(let i=0;i<count;i++){
    assert.equal(buffer.toString('ascii',at,at+4),'MTrk');const end=at+8+buffer.readUInt32BE(at+4);at+=8;let tick=0;const events=[];
    while(at<end){tick+=variable();const status=buffer[at++];if(status===255){const type=buffer[at++],size=variable();events.push({tick,status,type,body:[...buffer.subarray(at,at+size)]});at+=size;}else{const size=(status&240)===192?1:2;events.push({tick,status,body:[...buffer.subarray(at,at+size)]});at+=size;}}
    assert.equal(at,end);tracks.push(events);
  }
  assert.equal(at,buffer.length);return tracks;
}

test('three toms have distinct rows, sounds, fills and General MIDI notes',()=>{
  const a=app();const voices=a.plain(a.run('drumVoices'));
  assert.deepEqual(voices.filter(v=>v.id.startsWith('tom')).map(v=>v.midi),[50,47,41]);
  assert.equal(a.get('drum-grid').children.length,10);
  a.run('sound=new LoopSound()');
  const samples=['tom-high','tom-mid','tom'].map(kind=>Buffer.from(a.run(`sound.drumSample('${kind}',0).getChannelData(0)`).buffer));
  assert.notDeepEqual(samples[0],samples[1]);assert.notEqual(samples[1].length,samples[2].length);
  a.run('selected.drums=readChatDrums({hits:[{step:0,kind:"tom-high"},{step:1,kind:"tom-mid"},{step:2,kind:"tom"}]})');
  const notes=midiTracks(a.run('encodeMidi(selected,"drums")'))[0].filter(e=>e.status===153).map(e=>e.body[0]);
  assert.deepEqual(notes,[50,47,41]);
});

test('bass edits, history, scale changes, playback and solo preserve companions',async()=>{
  const a=app();const guitar=a.run('selected.guitar'),drums=a.run('selected.drums');
  a.fire('toggle-bass');assert.equal(a.run('selected.bass.length'),4);assert.equal(a.get('bass-volume').disabled,false);
  const generated=a.run('JSON.stringify(selected.bass)');
  a.run('commitBass(editMelodyNote(selected.bass,0,0,28,{length:8,resize:true}))');
  assert.notEqual(a.run('JSON.stringify(selected.bass)'),generated);
  a.fire('bass-undo');assert.equal(a.run('JSON.stringify(selected.bass)'),generated);a.fire('bass-redo');
  assert.strictEqual(a.run('selected.guitar'),guitar);assert.strictEqual(a.run('selected.drums'),drums);
  await a.fire('bass-solo');assert.equal(a.run('playback.soloTrack'),'bass');assert.equal(a.run('sound.bassLevel.gain.value'),1);assert.equal(a.run('sound.guitarLevel.gain.value'),0);
  await a.fire('bass-solo');assert.equal(a.run('playback.soloTrack'),null);a.run('stop()');
  a.choose('key','7');assert.ok(a.run('selected.bass.flat().every(note=>bassPitches(config).includes(note.root))'));
  a.fire('toggle-bass');assert.equal(a.run('selected.bass'),null);a.fire('bass-undo');assert.ok(a.run('Boolean(selected.bass)'));
});

test('ChatGPT bass uses companions, choice and comparison; complete song parts include bass',()=>{
  const a=app();a.fire('open-ai-bass');assert.equal(a.get('ai-bass-fields').hidden,false);
  for(const behavior of ['riff','root','independent']){a.get('ai-bass-style').value=behavior;const prompt=a.run('chatTrackPrompt(chatTrackContext("bass"),"schwer")');assert.match(prompt,/Riff \[/);assert.match(prompt,/Drums \[/);assert.match(prompt,/90 BPM/);}
  const guitar=a.run('selected.guitar');
  a.run('aiPromptContext=chatTrackContext("bass")');a.get('ai-response').value=JSON.stringify({notes:[{step:0,pitch:28,duration:8},{step:16,pitch:31,duration:4}]});a.fire('ai-melody-form','submit');
  assert.equal(a.run('selected.bass'),null);assert.equal(a.run('chatComparison.candidate.bass.length'),4);
  a.run('selectComparison("after");finishComparison(true)');assert.strictEqual(a.run('selected.guitar'),guitar);assert.equal(a.run('bassStyle'),'independent');
  a.get('ai-section-bars').value='8';a.get('ai-section-type').value='Bridge';a.run('chatPart="section";aiPromptContext=chatTrackContext(chatPart)');
  const answer={riff:{notes:[{step:0,pitches:[40,47],duration:4,articulation:'open'}]},drums:{hits:[{step:0,kind:'kick'},{step:63,kind:'tom-high'}]},melody:{notes:[{step:0,pitch:67,duration:8},{step:64,pitch:69,duration:8}]},bass:{notes:[{step:0,pitch:28,duration:8},{step:120,pitch:31,duration:8}]}};
  a.get('ai-response').value=JSON.stringify(answer);a.fire('ai-melody-form','submit');
  assert.equal(a.run('songParts.length'),2);assert.equal(a.run('selected.bass.length'),8);assert.equal(a.run('bassBar'),-1);
  a.run('openSection(1)');assert.equal(a.run('selected.bass.length'),4);
});

test('bass has a separate MIDI channel and MIDI download asks for a file name',async()=>{
  const a=app();a.fire('toggle-bass');a.fire('toggle-lead');
  const tracks=midiTracks(a.run('encodeMidi(selected)'));assert.equal(tracks.length,5);
  const bass=tracks.at(-1);assert.ok(bass.some(e=>e.status===194&&e.body[0]===33));assert.ok(bass.some(e=>e.status===146));
  const lead=tracks[3];assert.ok(lead.some(e=>(e.status&240)===224));
  a.fire('export-bass');assert.equal(a.get('midi-export-dialog').open,true);assert.equal(a.downloads.length,0);
  a.fire('midi-export-cancel');assert.equal(a.downloads.length,0);
  a.fire('export-bass');a.get('midi-filename').value='Mein Stoner-Bass';a.fire('midi-export-form','submit');assert.equal(a.downloads[0].name,'Mein Stoner-Bass.mid');
  assert.equal(Buffer.from(await a.downloads[0].blob.arrayBuffer()).toString('ascii',0,4),'MThd');
});

test('new projects roundtrip bass/history/mixer and legacy files remain usable',()=>{
  const a=app();a.fire('toggle-bass');a.run('commitBass(editMelodyNote(selected.bass,0,0,28,{length:8,resize:true}))');
  const saved=a.run('createArrangement()');a.context.file=saved;
  const project=a.run('readArrangement(file)');assert.equal(project.parts[0].pattern.bass.length,4);assert.ok(project.parts[0].history.bass.past.length);
  a.run('loadArrangement(readArrangement(file))');assert.equal(a.run('bassBar'),-1);a.fire('bass-undo');assert.ok(a.run('selected.bass'));
  const legacy=JSON.parse(saved);legacy.version=1;delete legacy.mixer.levels['bass-volume'];for(const part of legacy.parts){delete part.pattern.bass;delete part.history.bass;delete part.meta.bassName;delete part.meta.bassStyle;}
  a.context.oldFile=JSON.stringify(legacy);a.run('loadArrangement(readArrangement(oldFile))');assert.equal(a.run('selected.bass'),null);assert.equal(a.get('bass-volume').value,100);
  const invalid=JSON.parse(saved);invalid.parts[0].pattern.bass[0][0].root=90;a.context.invalid=JSON.stringify(invalid);assert.throws(()=>a.run('readArrangement(invalid)'));
});
test('bass follows each rock style, key, scale and chosen behavior',()=>{
  const a=app();
  a.run(`for(const style of ['stoner','punk','hard'])for(const scale of Object.keys(scales))for(let key=0;key<12;key++)for(const behavior of ['riff','root','independent']){
    const c={...config,style,scale,key};const guitar=generateGuitar(c);const bass=makeBass(c,guitar,makeGroove(c,guitar,0),behavior);
    if(bass.length!==4||!bass.flat().every(note=>bassPitches(c).includes(note.root)&&note.length>0&&note.length<=16-note.step))throw new Error(style+' '+scale+' '+key+' '+behavior);
  }`);
});

test('whole-song playback schedules the bass across differently sized parts',async()=>{
  const a=app();a.fire('toggle-bass');
  a.run('saveSection();const p=songParts[0];songParts.push({id:2,name:"Bridge",type:"Bridge",pattern:{...p.pattern,guitar:fitBars(p.pattern.guitar,8),drums:fitBars(p.pattern.drums,8),bass:fitBars(p.pattern.bass,8)},meta:{...p.meta}})');
  await a.run('togglePlayback(true)');const visited=new Set();
  for(let i=0;i<500&&a.run('Boolean(playback)');i++){visited.add(a.run('playback.songIndex'));a.run('sound.context.currentTime+=.1;schedule()');}
  assert.deepEqual([...visited],[0,1]);assert.ok(a.run('!playback'));assert.match(a.get('song-status').textContent,/vollständig/);
});
test('arrangement saving asks for a name, can be cancelled and retains complete JSON',async()=>{
  const a=app();a.fire('toggle-bass');const notes=a.run('JSON.stringify(selected)');
  a.fire('save-arrangement');assert.equal(a.get('arrangement-save-dialog').open,true);assert.equal(a.downloads.length,0);
  a.get('arrangement-filename').value='Meine Bridge';a.fire('arrangement-save-cancel');assert.equal(a.downloads.length,0);assert.equal(a.run('JSON.stringify(selected)'),notes);
  a.fire('save-arrangement');a.get('arrangement-filename').value='Mein Stoner Song.json';a.fire('arrangement-save-form','submit');
  assert.equal(a.downloads[0].name,'Mein Stoner Song.json');assert.equal(a.get('arrangement-save-dialog').open,false);
  a.context.file=await a.downloads[0].blob.text();const project=a.run('readArrangement(file)');assert.ok(project.parts[0].pattern.bass);assert.equal(project.parts.length,1);
  a.fire('save-arrangement');assert.equal(a.get('arrangement-filename').value,'Mein Stoner Song');a.fire('arrangement-save-cancel');
  a.get('arrangement-import-dialog').showModal();a.fire('arrangement-save-current');assert.equal(a.get('arrangement-save-dialog').open,true);a.fire('arrangement-save-cancel');assert.equal(a.get('arrangement-import-dialog').open,true);
});

test('editor actions reuse track changes, ChatGPT, locks, history and MIDI dialogs',()=>{
  const a=app();
  for(const id of ['export-lead','export-bass']) {assert.equal(a.get(id).hidden,false);assert.equal(a.get(id).disabled,true);assert.equal(a.get('editor-action-'+id).disabled,true);}
  const riff=a.run('selected.guitar');
  a.fire('editor-action-toggle-bass');assert.ok(a.run('selected.bass'));assert.strictEqual(a.run('selected.guitar'),riff);
  assert.equal(a.get('editor-action-export-bass').disabled,false);
  a.fire('editor-action-export-bass');assert.equal(a.get('midi-export-dialog').open,true);a.fire('midi-export-cancel');
  a.fire('editor-action-open-ai-bass');assert.equal(a.get('ai-bass-fields').hidden,false);
  a.fire('editor-action-toggle-bass');assert.equal(a.run('selected.bass'),null);
  a.fire('bass-undo');assert.ok(a.run('selected.bass'));assert.equal(a.get('editor-action-export-bass').disabled,false);
  a.get('lock-guitar').checked=true;a.fire('lock-guitar','change');
  assert.equal(a.get('editor-action-new-guitar').disabled,true);assert.equal(a.get('editor-action-track-ai-guitar').disabled,true);
  a.fire('editor-action-toggle-lead');assert.ok(a.run('selected.lead'));assert.equal(a.get('editor-action-export-lead').disabled,false);
});

test('tab selector follows available tracks, bass frets and live edits',()=>{
  const a=app();assert.equal(a.get('tab-riff').disabled,false);assert.equal(a.get('tab-melody').disabled,true);assert.equal(a.get('tab-bass').disabled,true);
  a.fire('header-ai-bass');assert.equal(a.get('ai-description').value,'');assert.equal(a.get('ai-bass-fields').hidden,false);
  a.fire('toggle-bass');a.fire('tab-bass');assert.equal(a.run('tabTrack'),'bass');assert.equal(a.get('riff-tabs-panel').hidden,true);assert.equal(a.get('bass-tabs-panel').hidden,false);
  a.run("commitBass([[{step:0,root:26,length:4,articulation:'single'}],[],[],[]])");
  const lines=a.get('bass-tabs').textContent.split('\n').slice(1);assert.equal(lines.length,4);assert.match(lines[3],/^D\|0--/);assert.match(lines[0],/^G\|/);
  a.fire('toggle-lead');a.fire('tab-melody');assert.equal(a.get('lead-tabs-panel').hidden,false);assert.equal(a.get('bass-tabs-panel').hidden,true);
  a.fire('toggle-lead');assert.equal(a.run('tabTrack'),'riff');assert.equal(a.get('tab-melody').disabled,true);
  a.choose('mode','melody');assert.equal(a.run('tabTrack'),'melody');assert.equal(a.get('tab-riff').disabled,true);assert.equal(a.get('lead-tabs-panel').hidden,false);
});

test('riff techniques are per tone; new tones stay normal and history restores techniques',()=>{
 const a=app();a.run(`commitRiff([[{step:0,root:38,length:2,articulation:'open',voicing:[[0,0],[1,17]]},{step:2,root:38,length:2,articulation:'open',voicing:[[0,0],[1,19]]},{step:4,root:38,length:4,articulation:'open',voicing:[[0,0],[1,17]]}],[],[],[]]);`);
 const cell=a.get('riff-grid').querySelector('button[data-pitch="64"][data-step="2"][data-bar="0"]');
 a.get('riff-grid').handlers.click({target:cell});assert.equal(a.run('riffSelection.pitch'),64);
 a.fire('riff-tech-hammer');assert.equal(a.run('selected.guitar[0][1].voiceTechniques[64].type'),'hammer');assert.equal(a.run('selected.guitar[0][1].voiceTechniques[38]'),undefined);
 a.run("riffSelection={bar:0,step:4,pitch:62,offset:0};renderRiffGrid()");a.fire('riff-tech-pull');assert.equal(a.run('selected.guitar[0][2].voiceTechniques[62].type'),'pull');
 a.fire('riff-tech-bend-half');assert.equal(a.run('selected.guitar[0][2].voiceTechniques[62].type'),'bend-half');
 assert.deepEqual(a.plain(a.run('leadPitchCurve(riffVoiceNote(riffAttacks(selected.guitar[0]).find(v=>v.step===4&&v.pitch===62)),15/90).map(p=>p[1])')),[0,100,0]);
 a.run("commitRiff(editRiffPitch(selected.guitar,0,8,43,'open'))");assert.equal(a.run('Object.keys(selected.guitar[0].find(n=>n.step===8).voiceTechniques??{}).length'),0);
 a.fire('riff-undo');a.fire('riff-undo');assert.equal(a.run('selected.guitar[0][2].voiceTechniques[62].type'),'pull');a.fire('riff-redo');
 a.run("riffSelection={bar:0,step:4,pitch:62,offset:0};renderRiffGrid()");a.fire('riff-tech-normal');assert.equal(a.run('selected.guitar[0][2].voiceTechniques[62]'),undefined);
 assert.equal(a.run('selected.guitar[0][1].voiceTechniques[64].type'),'hammer');
 a.run("riffSelection={bar:0,step:0,pitch:38,offset:0};renderRiffGrid()");a.fire('riff-tech-bend-whole');assert.equal(a.run('selected.guitar[0][0].voiceTechniques?.[38]'),undefined);
 assert.deepEqual(a.plain(a.run('readArrangement(createArrangement()).parts[0].pattern.guitar')),a.plain(a.run('selected.guitar')));
});

test('riff bend audio and MIDI affect only the chosen string and return to zero',()=>{
 const a=app();a.run(`commitRiff([[{step:0,root:38,length:4,articulation:'open',voicing:[[0,0],[1,19]],voiceTechniques:{64:{type:'bend-whole'}}}],[],[],[]]);globalThis.curves=[];sound=new LoopSound();sound.voice=()=>({detune:{setValueAtTime(v){curves.push(v)},linearRampToValueAtTime(v){curves.push(v)}}});sound.guitar(0,riffAttacks(selected.guitar[0]),15/90,.8);`);
 assert.deepEqual(a.plain(a.run('curves')),[0,200,0,0,200,0]);
 const events=midiTracks(a.run('encodeMidi(selected,"guitar")'))[0];
 const low=events.find(e=>(e.status&240)===144&&e.body[0]===38),high=events.find(e=>(e.status&240)===144&&e.body[0]===64);assert.notEqual(low.status&15,high.status&15);
 const bends=events.filter(e=>(e.status&240)===224);assert.ok(bends.length>3);assert.ok(bends.every(e=>(e.status&15)===(high.status&15)));assert.deepEqual(bends.at(-1).body,[0,64]);
});

test('ChatGPT and app generation support sparse per-tone techniques and validate input',()=>{
 const a=app();a.context.answer={notes:[{step:0,pitches:[38,62],duration:2,articulation:'open'},{step:2,pitches:[38,64],duration:4,articulation:'open',techniques:[{pitch:64,type:'hammer'}]},{step:6,pitches:[38,62],duration:4,articulation:'open',techniques:[{pitch:62,type:'bend-half'}]}]};
 const bars=a.run('readChatRiff(answer,chatTrackContext("riff"))');assert.equal(bars[0][1].voiceTechniques[64].type,'hammer');assert.equal(bars[0][2].voiceTechniques[62].type,'bend-half');
 a.context.answer.notes[2].techniques=[{pitch:38,type:'bend-whole'}];assert.throws(()=>a.run('readChatRiff(answer,chatTrackContext("riff"))'));
 for(const part of ['riff','arrangement','section'])assert.match(a.run(`chatTrackPrompt(chatTrackContext('${part}'),'')`),/techniques/);
 const count=a.run(`(()=>{let seed=41;const old=Math.random;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);let n=0;try{for(const style of ['stoner','hard','punk'])for(let i=0;i<15;i++){const c={...config,style,key:i%12,scale:['minor','phrygian','blues'][i%3]},bars=i%2?generateGuitar(c):generatePolyRiff(c);projectNotes(bars,4,false);n+=bars.flat().filter(note=>Object.keys(note.voiceTechniques??{}).length).length;}return n;}finally{Math.random=old;}})()`);assert.ok(count>0);
});
