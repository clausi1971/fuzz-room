'use strict';

const stepsPerBar = 16;
const loopSteps = 64;
const keyNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'H'];
const scaleNames = {minor: 'Moll', major: 'Dur', phrygian: 'Phrygisch', blues: 'Blues'};
const scales = {minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10], blues: [0, 3, 5, 6, 7, 10]};
const guitarTunings={dropd:{name:'Drop D · 6 Saiten · D–A–D–G–H–E',notes:[38,45,50,55,59,64]},a7:{name:'A Standard · 7 Saiten · A–D–G–C–F–A–D',notes:[33,38,43,48,53,57,62]}};
let tunings=guitarTunings.dropd.notes;
const guitarTuning=note=>guitarTunings[note?.tuning??'dropd'].notes;
const drumVoices = [
  {id: 'kick', name: 'Kick', midi: 36, velocity: .85, delay: 0},
  {id: 'snare', name: 'Snare', midi: 38, velocity: .84, delay: .009},
  {id: 'hat', name: 'Hi-Hat', midi: 42, velocity: .39, delay: .005},
  {id: 'open', name: 'Hi-Hat offen', midi: 46, velocity: .39, delay: .005},
  {id: 'tom-high', name: 'Hohe Tom', midi: 50, velocity: .63, delay: .007},
  {id: 'tom-mid', name: 'Mittlere Tom', midi: 47, velocity: .66, delay: .007},
  {id: 'tom', name: 'Standtom', midi: 41, velocity: .70, delay: .007},
  {id: 'crash', name: 'Crash', midi: 49, velocity: .44, delay: .004},
];
const drumVoice = Object.fromEntries(drumVoices.map(voice => [voice.id, voice]));

const pick = options => options[Math.floor(Math.random() * options.length)];
const intervals = scale => scales[scale];
const tonic = key => 38 + (key + 10) % 12;
const slideSteps = note => Math.min(note.length * .55, .85);
const bendSymbol = note => note.bendShape === 'up-return' ? 'B↑↓' : note.bendShape === 'release' ? 'B↓' : 'B';
const bendDescription = note => note.bendShape === 'up-return' ? 'Ganzton hoch & zurück'
  : note.bendShape === 'release' ? 'Ganzton oben starten & absenken' : note.bendCents === 100 ? 'Halbton-Bending' : 'Ganzton-Bending';

function leadPitchCurve(note, stepDuration) {
  const points = [];
  const slideEnd = note.transition === 'slide' ? slideSteps(note) : 0;
  if (slideEnd) points.push([0, (note.from - note.root) * 100], [slideEnd, 0]);
  if (!note.expression || (note.expression === 'vibrato' && note.length < 2.5)) return points;

  const end = note.length - Math.min(.12, note.length * .1);
  if (note.expression === 'bend' && note.bendShape === 'up-return') return [[0, 0], [end / 2, note.bendCents ?? 200], [end, 0]];
  if (note.expression === 'bend' && note.bendShape === 'release') return [[0, 200], [end, 0]];
  const start = Math.max(slideEnd + Math.min(.18, note.length * .1), note.expression === 'bend' ? Math.min(.35, note.length * .22) : 1.1);
  points.push([start, 0]);
  if (note.expression === 'bend') {
    const rise = Math.min(.95, (end - start) * .48);
    points.push([start + rise, note.bendCents], [end - rise * .7, note.bendCents], [end, 0]);
  } else {
    const spacing = 1 / (4 * 4.7 * stepDuration);
    const cycle = [0, 32, 0, -22];
    for (let index = 1; start + spacing * index < end; index++) {
      points.push([start + spacing * index, cycle[index % 4] * Math.min(index / 4, 1)]);
    }
    points.push([end, 0]);
  }
  return points;
}

function melodyPitches(config, wide = false) {
  return Array.from({length: wide ? 49 : 18}, (_, index) => (wide ? 38 : 66) + index)
    .filter(pitch => intervals(config.scale).includes((pitch - config.key + 120) % 12));
}

function editMelodyNote(bars, bar, step, root, {length = 0, resize = false} = {}) {
  const position = bar * stepsPerBar + step;
  const existing = bars[bar].find(note => note.step === step);
  const notes = bars.flatMap((barNotes, index) => barNotes.map(note => ({...note, bar: index, position: index * stepsPerBar + note.step})));
  const index = notes.findIndex(note => note.position >= position);
  const at = index === -1 ? notes.length : index;
  const available = (notes[at + (existing ? 1 : 0)]?.position ?? bars.length * stepsPerBar) - position;
  const duration = length ? Math.min(length, available) : Math.min(3.8, available - .16);
  if (resize) {
    if (existing?.root !== root) return bars;
    return bars.map((barNotes, barIndex) => barIndex === bar
      ? barNotes.map(note => note.step === step ? {...note, length: duration} : note)
      : barNotes);
  }
  if (existing?.root === root) {
    notes.splice(at, 1);
  } else if (existing) {
    notes[at] = {...notes[at], root, transition: undefined, from: undefined};
  } else {
    const previous = notes[at - 1];
    if (previous && previous.position + previous.length > position) previous.length = position - previous.position;
    notes.splice(at, 0, {bar, step, root, position, length: duration, articulation: 'single'});
  }
  const next = notes[existing?.root === root ? at : at + 1];
  if (next) {
    next.transition = undefined;
    next.from = undefined;
  }
  const edited = bars.map(() => []);
  for (const {bar: indexOfBar, position: _, ...note} of notes) edited[indexOfBar].push(note);
  return edited;
}

function cutNoteStep(start, length, cut) {
  const end = start + length;
  const tail = Math.max(start, cut + 1);
  return [[start, Math.min(cut, end) - start], [tail, end - tail]].filter(([, size]) => size > 0);
}

function cutMelodyStep(bars, bar, step, cut) {
  const note = bars[bar].find(note => note.step === step);
  const start = bar * stepsPerBar + step;
  const pieces = cutNoteStep(start, note.length, cut);
  if (!pieces.length) return editMelodyNote(bars, bar, step, note.root);
  const result = bars.map((notes, index) => index === bar ? notes.filter(other => other !== note) : notes.slice());
  for (const [position, length] of pieces) {
    const destination = result[Math.floor(position / stepsPerBar)];
    const technique = position === start ? note : {root: note.root, articulation: 'single'};
    destination.push({...technique, step: position % stepsPerBar, length});
    destination.sort((a, b) => a.step - b.step);
  }
  return result;
}

function transposeEditedMelody(bars, fromKey, config) {
  const pitches = melodyPitches(config, true);
  const shift = (config.key - fromKey + 18) % 12 - 6;
  return bars.map(notes => notes.map(note => {
    const target = note.root + shift;
    const root = pitches.reduce((closest, pitch) => Math.abs(pitch - target) < Math.abs(closest - target) ? pitch : closest);
    return {...note, root, transition: undefined, from: undefined};
  }));
}

function setMelodyTechnique(bars, bar, step, tool) {
  const note = bars[bar].find(note => note.step === step);
  if (!note) return null;
  let edit;
  if (tool === 'hammer' || tool === 'pull') {
    const previous = bars[bar].findLast(other => other.step < step) ?? bars.slice(0, bar).flat().at(-1);
    const interval = previous && note.root - previous.root;
    if (!interval || Math.abs(interval)>4 || (tool==='hammer'?interval<1:interval>-1)) return null;
    edit = {transition: tool, from: undefined};
  } else if (tool === 'clear') {
    edit = {transition: undefined, from: undefined, expression: undefined, bendCents: undefined, bendShape: undefined};
  } else if (tool === 'bend-up-return' || tool === 'bend-release') {
    edit = {transition: undefined, from: undefined, expression: 'bend', bendCents: 200,
      bendShape: tool === 'bend-up-return' ? 'up-return' : 'release'};
  } else {
    edit = {expression: 'bend', bendCents: tool === 'bend-half' ? 100 : 200, bendShape: undefined};
  }
  return bars.map((notes, index) => index === bar ? notes.map(other => other === note ? {...note, ...edit} : other) : notes);
}

function bluesFifth(offset) {
  return [7, 6, 5, 8, 4, 3].find(interval => scales.blues.includes((offset + interval + 12) % 12));
}

function guitarPitches(note) {
  const tunings=guitarTuning(note);
  if (note.voicing) return note.voicing.map(([string, fret]) => tunings[string] + fret);
  if (note.articulation === 'single') return [note.root];
  const fifth = note.root + (note.fifth ?? 7);
  return note.articulation === 'mute' ? [note.root, fifth] : [note.root, fifth, note.root + 12];
}

function riffVoiceSpans(note, pitch) {
  return note.voiceEdits?.[pitch] ?? [[0, note.length]];
}

function riffAttacks(notes) {
  return notes.flatMap(note => guitarPitches(note).flatMap((pitch, index) => riffVoiceSpans(note, pitch).map(([offset, length]) => ({
    note, pitch, index, offset, step: note.step + offset, length, articulation: riffVoiceArticulation(note,pitch),
  }))));
}

function editRiffSpan(bars, bar, step, pitch, offset, {end, cut, remove = false}) {
  const note = bars[bar].find(note => note.step === step);
  const spans = riffVoiceSpans(note, pitch);
  const index = spans.findIndex(([start]) => start === offset);
  const [start, length] = spans[index];
  const boundary = riffAttacks(bars[bar]).filter(voice => voice.pitch===pitch && voice.step>step+start).reduce((end,voice)=>Math.min(end,voice.step),stepsPerBar);
  const limit = Math.min(boundary - step, spans[index + 1]?.[0] ?? stepsPerBar-step);
  const pieces = remove ? [] : cut === undefined
    ? [[start, Math.min(limit - start, Math.max(1, end - step - start))]]
    : cutNoteStep(start, length, cut - step);
  const updated = [...spans.slice(0, index), ...pieces, ...spans.slice(index + 1)];
  if (!updated.length) return editRiffPitch(bars, bar, step, pitch, note.articulation);
  const result = bars.slice();
  result[bar] = bars[bar].map(other => other === note ? {...note, voicing: guitarFrets(note), voiceEdits: {...note.voiceEdits, [pitch]: updated}} : other);
  return normalizeRiffVoices(result);
}

function findRiffVoicing(pitches, previous, constraint = null, tuning = tunings) {
  const tunings=tuning;
  let best;
  let bestCost = Infinity;
  const search = (index, firstString, voicing, stopped, cost) => {
    if (index === pitches.length) {
      if (cost < bestCost) {
        best = voicing;
        bestCost = cost;
      }
      return;
    }
    const pitch = pitches[index];
    for (let string = firstString; string <= tunings.length - (pitches.length - index); string++) {
      const fret = pitch - tunings[string];
      if (fret < 0 || fret > 22) continue;
      if (constraint?.pitch === pitch && ((constraint.string !== undefined && constraint.string !== string) || (constraint.fretted && fret === 0))) continue;
      const fingers = fret ? [...stopped, fret] : stopped;
      if (fingers.length && Math.max(...fingers) - Math.min(...fingers) > 4) continue;
      const original = previous.some(([s, f]) => s === string && f === fret);
      search(index + 1, string + 1, [...voicing, [string, fret]], fingers, cost + fret + (original ? 0 : 8));
    }
  };
  search(0, 0, [], [], 0);
  return best;
}

function editRiffPitch(bars, bar, step, pitch, articulation) {
  const hit = bars[bar].find(note => note.step === step);
  const pitches = hit ? guitarPitches(hit) : [];
  const updated = (pitches.includes(pitch) ? pitches.filter(value => value !== pitch) : [...pitches, pitch]).sort((a, b) => a - b);
  const tuning=hit?.tuning??(tunings===guitarTunings.a7.notes?'a7':'dropd');
  const voicing = findRiffVoicing(updated, hit ? guitarFrets(hit) : [],null,guitarTunings[tuning].notes);
  if (!voicing) return null;
  const result = bars.slice();
  const notes = bars[bar].filter(note => note.step !== step);
  if (updated.length) {
    const next = notes.find(note => note.step > step);
    const length = hit?.length ?? Math.min((next?.step ?? stepsPerBar) - step, articulation === 'mute' ? 1.6 : 4);
    const voiceEdits = Object.fromEntries(Object.entries(hit?.voiceEdits ?? {}).filter(([key]) => Number(key) !== pitch));
    notes.push({...hit, tuning, step, root: updated[0], length, articulation: hit?.articulation ?? articulation, voicing, voiceEdits, voiceArticulations: {...Object.fromEntries(Object.entries(hit?.voiceArticulations??{}).filter(([key])=>updated.includes(Number(key)))),...(pitches.includes(pitch)?{}:{[pitch]:articulation})}, voiceTechniques: Object.fromEntries(Object.entries(hit?.voiceTechniques ?? {}).filter(([key]) => Number(key) !== pitch && updated.includes(Number(key))))});
  }
  result[bar] = notes.sort((a, b) => a.step - b.step);
  return normalizeRiffVoices(result);
}

function guitarFrets(note) {
  const tunings=guitarTuning(note);
  if (note.voicing) return note.voicing;
  if (note.articulation === 'single') {
    const string = tunings.findLastIndex(open => open <= note.root);
    return [[string, note.root - tunings[string]]];
  }
  const rootString = note.root >= 45 ? 1 : 0;
  return guitarPitches(note).map((pitch, index) => [rootString + index, pitch - tunings[rootString + index]]);
}
function bassPitches(config) {
  const low=bassTunings[config.bassTuning??'dropd'].notes[0];
  return Array.from({length:56-low},(_,index)=>low+index).filter(pitch=>intervals(config.scale).includes((pitch-config.key+120)%12));
}

const riffTechniqueNames = {normal:'Normal / ohne Technik',hammer:'Hammer-on',pull:'Pull-off','bend-half':'Halbton hoch & zurück','bend-whole':'Ganzton hoch & zurück'};
const riffTechniqueSymbols = {hammer:'H',pull:'P','bend-half':'½↑↓','bend-whole':'1↑↓'};
function riffPreviousVoice(bars, bar, step, pitch) {
  const note = bars[bar]?.find(note => note.step === step);
  const string = note && guitarFrets(note).find(([s,f]) => guitarTuning(note)[s]+f === pitch)?.[0];
  if (string === undefined) return null;
  return bars.flatMap((notes,b) => riffAttacks(notes).map(voice => ({...voice,position:b*16+voice.step})))
    .filter(voice => voice.position < bar*16+step && guitarFrets(voice.note)[voice.index]?.[0] === string)
    .sort((a,b) => b.position-a.position)[0] ?? null;
}
function setRiffTechnique(bars, bar, step, pitch, type) {
  const note = bars[bar]?.find(note => note.step === step);
  if (!note || !guitarPitches(note).includes(pitch) || !Object.hasOwn(riffTechniqueNames,type)) return null;
  let technique = {type};
  let voicing=guitarFrets(note);
  if (type === 'hammer' || type === 'pull') {
    const voices=bars.flatMap((notes,b)=>riffAttacks(notes).map(v=>({...v,position:b*16+v.step}))).filter(v=>v.position<bar*16+step).sort((a,b)=>b.position-a.position);
    let previous;
    const checked=new Set();
    for(const voice of voices) {
      const string=guitarFrets(voice.note)[voice.index][0];
      if(checked.has(string)) continue;checked.add(string);
      const interval=pitch-voice.pitch;
      if(Math.abs(interval)>4 || (type==='hammer'?interval<=0:interval>=0)) continue;
      const candidate=findRiffVoicing(guitarPitches(note).toSorted((a,b)=>a-b),voicing,{pitch,string},guitarTuning(note));
      if(candidate) {previous=voice;voicing=candidate;break;}
    }
    if(!previous) return null;
    technique.from = previous.pitch;
  }
  if (type.startsWith('bend-') && voicing.find(([s,f]) => guitarTuning(note)[s]+f===pitch)?.[1] === 0) {
    voicing=findRiffVoicing(guitarPitches(note).toSorted((a,b)=>a-b),voicing,{pitch,fretted:true},guitarTuning(note));
    if(!voicing) return null;
  }
  const techniques = {...note.voiceTechniques};
  if (type === 'normal') delete techniques[pitch]; else techniques[pitch] = technique;
  return bars.map((notes,b) => b===bar ? notes.map(other => other===note ? {...note,voicing,voiceTechniques:techniques} : other) : notes);
}
function riffVoiceNote(voice) {
  const technique=voice.note.voiceTechniques?.[voice.pitch];
  return {root:voice.pitch,length:voice.length,
    transition:['hammer','pull'].includes(technique?.type)?technique.type:undefined,
    from:technique?.from,expression:technique?.type.startsWith('bend-')?'bend':undefined,
    bendShape:'up-return',bendCents:technique?.type==='bend-half'?100:200};
}
function sanitizeRiffTechniques(bars) {
  let result=bars;
  for(const [bar,notes] of bars.entries()) for(const note of notes) for(const [pitch,technique] of Object.entries(note.voiceTechniques??{})) {
    if(!guitarPitches(note).includes(Number(pitch))) continue;
    result=setRiffTechnique(result,bar,note.step,Number(pitch),technique.type) ?? setRiffTechnique(result,bar,note.step,Number(pitch),'normal');
  }
  return result;
}
function riffVoiceArticulation(note,pitch) {
  return note.voiceArticulations?.[pitch] ?? note.articulation;
}
function setRiffVoiceArticulation(bars,bar,step,pitch,articulation) {
  const note=bars[bar]?.find(note=>note.step===step);
  if(!note||!guitarPitches(note).includes(pitch)||!['open','mute'].includes(articulation)) return null;
  return bars.map((notes,b)=>b===bar?notes.map(other=>other===note?{...note,voiceArticulations:{...note.voiceArticulations,[pitch]:articulation}}:other):notes);
}
function normalizeRiffVoices(bars) {
  const result=bars.map(notes=>{
    const voices=riffAttacks(notes);
    const updated=notes.map(note=>{
      let changed=false;
      const voiceEdits={...note.voiceEdits};
      for(const pitch of guitarPitches(note)) {
        const before=riffVoiceSpans(note,pitch);
        const after=before.map(([offset,length])=>{
          const start=note.step+offset;
          const next=voices.filter(voice=>voice.pitch===pitch&&voice.step>start).reduce((end,voice)=>Math.min(end,voice.step),stepsPerBar);
          return [offset,Math.min(length,next-start)];
        }).filter(([,length])=>length>0);
        if(JSON.stringify(before)!==JSON.stringify(after)) {changed=true;voiceEdits[pitch]=after;}
      }
      const length=Math.min(note.length,stepsPerBar-note.step);
      return changed||length!==note.length?{...note,length,...(changed?{voiceEdits}:{} )}:note;
    });
    return updated.some((note,i)=>note!==notes[i])?updated:notes;
  });
  return result.some((notes,i)=>notes!==bars[i])?result:bars;
}
const vocalRanges={low:{name:'Tief · A2–E4',min:45,max:64},mid:{name:'Mittel · C3–A4',min:48,max:69},high:{name:'Hoch · G3–F5',min:55,max:77}};
function vocalPitches(config,range='mid') {
  const {min,max}=vocalRanges[range]??vocalRanges.mid;
  return Array.from({length:max-min+1},(_,i)=>min+i).filter(pitch=>intervals(config.scale).includes((pitch-config.key+120)%12));
}
