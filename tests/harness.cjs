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


module.exports={app,midiTracks};
