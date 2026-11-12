'use strict';

const stepsPerBar = 16;
const loopSteps = 64;
const keyNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'H'];
const scaleNames = {minor: 'Moll', major: 'Dur', phrygian: 'Phrygisch', blues: 'Blues'};
const scales = {minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10], blues: [0, 3, 5, 6, 7, 10]};
const tunings = [38, 45, 50, 55, 59, 64];
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

const styles = {
  stoner: {rhythms: [[0, 3, 6, 10, 14], [0, 6, 8, 13], [0, 4, 7, 10, 14]], degrees: [0, 0, 2, 3, 4, 6], chords: [0, 3, 2, 6], kicks: [0, 6, 8], hats: [0, 2, 4, 6, 8, 10, 12, 14], muted: .74},
  punk: {rhythms: [[0, 2, 4, 6, 8, 10, 12, 14], [0, 2, 4, 6, 8, 10, 11, 12, 14]], degrees: [0, 0, 3, 4, 5, 6], chords: [0, 3, 4, 5], kicks: [0, 2, 8, 10], hats: [0, 2, 4, 6, 8, 10, 12, 14], muted: .26},
  hard: {rhythms: [[0, 2, 7, 8, 12], [0, 3, 6, 8, 11, 14], [0, 4, 6, 10, 12]], degrees: [0, 0, 1, 2, 3, 4, 6], chords: [0, 5, 3, 4], kicks: [0, 7, 8, 11], hats: [0, 2, 4, 6, 8, 10, 12, 14], muted: .49},
};

const originals = [
  [
    [[0, 40, 1.7], [3, 40, .8], [6, 40, 1.35], [10, 43, 1.5], [14, 45, 1.5]],
    [[0, 40, 1.7], [3, 40, .8], [6, 43, 1.6], [9, 45, 2], [13, 43, 1.5]],
    [[0, 40, 1.7], [3, 40, .8], [6, 40, 1.35], [10, 43, 1.5], [14, 45, 1.5]],
    [[0, 40, 2.5], [4, 46, 1.5], [7, 45, 1.5], [10, 43, 1.7], [14, 38, 1.45]],
  ],
  [
    [[0, 40, 6.75], [8, 40, 2.8], [12, 43, 3.65]],
    [[0, 45, 6], [8, 43, 3], [12, 38, 3.65]],
    [[0, 40, 6.75], [8, 40, 2.8], [12, 43, 3.65]],
    [[0, 45, 3.5], [4, 43, 3], [8, 38, 6.9]],
  ],
];

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
  if (tool === 'hammer') {
    const previous = bars[bar].findLast(other => other.step < step) ?? bars.slice(0, bar).flat().at(-1);
    const interval = previous && note.root - previous.root;
    if (!interval || interval < 1 || interval > 4) return null;
    edit = {transition: 'hammer', from: undefined};
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

function originalGuitar(index, config) {
  const offset = tonic(config.key) - 40;
  return originals[index].map((bar, barIndex) => bar.map(([step, root, length]) => {
    let pitch = root + offset;
    if (config.scale === 'major' && [38, 43].includes(root)) pitch++;
    if (config.scale === 'phrygian' && root === 46) pitch -= 5;
    const articulation = index === 0 && !(barIndex === 3 && step === 0) ? 'mute' : 'open';
    const fifth = config.scale === 'blues' ? bluesFifth(pitch - tonic(config.key)) : 7;
    return {step, root: pitch < 38 ? pitch + 12 : pitch, length, articulation, fifth};
  }));
}

function guitarPitches(note) {
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

function findRiffVoicing(pitches, previous, constraint = null) {
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
  const voicing = findRiffVoicing(updated, hit ? guitarFrets(hit) : []);
  if (!voicing) return null;
  const result = bars.slice();
  const notes = bars[bar].filter(note => note.step !== step);
  if (updated.length) {
    const next = notes.find(note => note.step > step);
    const length = hit?.length ?? Math.min((next?.step ?? stepsPerBar) - step, articulation === 'mute' ? 1.6 : 4);
    const voiceEdits = Object.fromEntries(Object.entries(hit?.voiceEdits ?? {}).filter(([key]) => Number(key) !== pitch));
    notes.push({...hit, step, root: updated[0], length, articulation: hit?.articulation ?? articulation, voicing, voiceEdits, voiceArticulations: {...Object.fromEntries(Object.entries(hit?.voiceArticulations??{}).filter(([key])=>updated.includes(Number(key)))),...(pitches.includes(pitch)?{}:{[pitch]:articulation})}, voiceTechniques: Object.fromEntries(Object.entries(hit?.voiceTechniques ?? {}).filter(([key]) => Number(key) !== pitch && updated.includes(Number(key))))});
  }
  result[bar] = notes.sort((a, b) => a.step - b.step);
  return normalizeRiffVoices(result);
}

function generatePolyRiff(config) {
  const riff = generateGuitar({...config, mode: 'riff'}, 0, false);
  const scale = intervals(config.scale);
  let lastTop;
  return decorateRiff(riff.map((notes, bar) => notes.map((note, index) => {
    const rootString = note.root >= 45 ? 1 : 0;
    const rootFret = note.root - tunings[rootString];
    const frets = [...new Set([0, ...Array.from({length: 7}, (_, delta) => rootFret + delta - 3)])]
      .filter(fret => fret >= 0 && fret <= 22);
    const tones = tunings.flatMap((open, string) => string <= rootString ? [] : frets.map(fret => ({string, fret, pitch: open + fret})))
      .filter(({pitch}) => pitch > note.root && scale.includes((pitch - config.key + 120) % 12));
    const upper = tones.filter(({string, pitch}) => string >= rootString + 2 && pitch >= note.root + 8);
    const target = (lastTop ?? note.root + 15) + [0, 3, -2, 2, -3][(index + bar) % 5];
    const top = upper.reduce((best, voice) => Math.abs(voice.pitch - target) < Math.abs(best.pitch - target) ? voice : best);
    lastTop = top.pitch;
    const middle = tones.filter(voice => voice.string < top.string && voice.pitch < top.pitch && voice.pitch % 12 !== top.pitch % 12)
      .filter(voice => {
        const stopped = [rootFret, voice.fret, top.fret].filter(fret => fret > 0);
        return stopped.length < 2 || Math.max(...stopped) - Math.min(...stopped) <= 4;
      })
      .sort((a, b) => Math.abs(a.pitch - note.root - 7) - Math.abs(b.pitch - note.root - 7))[0];
    const voicing = [[rootString, rootFret], ...(middle ? [[middle.string, middle.fret]] : []), [top.string, top.fret]];
    const space = (notes[index + 1]?.step ?? stepsPerBar) - note.step;
    const options=riffGenerationOptions(config);
    const articulation = !options.open ? 'mute' : !options.pm ? 'open' : index % 3 === 1 ? note.articulation : 'open';
    return {...note, articulation, voicing, length: articulation === 'open' ? Math.min(space - .18, 5.6) : note.length};
  })), config);
}

function generateGuitar(config, take = 0, decorate = true) {
  if (config.mode === 'melody') return makeLead(config, null, take);
  if(config.style==='stoner') return makeStonerRiff(config,decorate);
  const style = styles[config.style];
  const scale = intervals(config.scale);
  const root = tonic(config.key);
  const firstRhythm = pick(style.rhythms);
  const motif = firstRhythm.map((_, index) => index === 0 ? 0 : pick(style.degrees));
  if (config.scale === 'phrygian' || config.scale === 'blues') motif[1] = config.scale === 'blues' ? 3 : 1;
  const progression = [0, pick(style.chords.slice(1)), 0, pick(style.chords.slice(1))];
  const bars = progression.map((degree, bar) => {
    const rhythm = bar % 2 === 0 ? firstRhythm : pick(style.rhythms);
    return rhythm.map((step, index) => {
      const last = index === rhythm.length - 1;
      const tone = (degree + (index === 0 ? 0 : motif[index % motif.length])) % scale.length;
      const options=riffGenerationOptions(config);
      const articulation = !options.open ? 'mute' : !options.pm ? 'open' : (bar === 3 && last) || Math.random() > style.muted ? 'open' : 'mute';
      const space = (rhythm[index + 1] ?? stepsPerBar) - step;
      const length = articulation === 'mute' ? Math.min(space - .18, 1.6) : Math.min(space - .18, 4.4);
      const fifthDegree = tone + 4;
      const fifth = config.scale === 'blues' ? bluesFifth(scale[tone]) : scale[fifthDegree % 7] + (fifthDegree >= 7 ? 12 : 0) - scale[tone];
      return {step, root: root + scale[tone], length, articulation, fifth};
    });
  });
  return decorate ? decorateRiff(bars, config) : bars;
}

const melodyPhrases = {
  desert: {
    target: [69, 72, 67], bendCents: 200,
    motif: [[1, 0], [3, -1, 'slide'], [5, 0, 'hammer'], [8, 1, null, 'bend'], [13, 0]],
    answer: [[0, -1], [3, 0, 'hammer'], [6, 1, null, 'bend'], [11, 0, 'slide']],
    ending: [[1, 1, null, 'bend'], [5, 0, 'slide'], [8, -1], [11, null, 'slide']],
  },
  psych: {
    target: [75, 78, 72], bendCents: 100,
    motif: [[0, 0, null, 'vibrato'], [7, 1, 'hammer'], [9, 2, 'slide', 'vibrato']],
    answer: [[3, 1, null, 'bend'], [9, 0, 'slide', 'vibrato'], [14, -1, 'slide']],
    ending: [[1, 2, null, 'vibrato'], [6, 1, 'slide'], [9, null, 'slide', 'vibrato']],
  },
  blues: {
    motif: [[2, 0], [4, 1, 'hammer'], [6, 2, 'slide'], [10, 1]],
    answer: [[1, 1], [5, 0, 'slide'], [8, -1], [13, 0, 'hammer']],
    ending: [[1, 1], [4, 0, 'slide'], [7, -1], [10, null, 'slide']],
  },
  stoner: {
    motif: [[0, 0], [5, -1, 'slide'], [7, 0, 'hammer'], [12, 1]],
    answer: [[3, 1], [7, 0, 'slide'], [11, -1]],
    ending: [[0, 1], [4, 0, 'slide'], [9, null, 'slide']],
  },
};

function makeLead(config, riff, take = 0) {
  if(config.style==='stoner') return makeStonerLead(config,riff,take);
  const home = tonic(config.key);
  const scale = intervals(config.scale);
  const style = config.melodyStyle ?? 'stoner';
  const templates = melodyPhrases[style];
  const bluesNotes = config.scale === 'major' ? [0, 2, 4, 7, 9] : [0, 1, 3, 5, 6, 7, 10];
  const offsets = style === 'blues' || style === 'desert' ? scale.filter(tone => bluesNotes.includes(tone)) : scale;
  const degree = pitch => (pitch - home + 120) % 12;
  const pitches = Array.from({length: 18}, (_, index) => 66 + index).filter(pitch => offsets.includes(degree(pitch)));
  const nearest = (options, target) => options.reduce((best, pitch) => Math.abs(pitch - target) < Math.abs(best - target) ? pitch : best);
  const usable = pitches.slice(1, -2);
  const target = (templates.target ?? [72, 76, 69])[take];
  const pickup = take === 1 ? 1 : 0;

  const anchor = (bar, step, preferred) => {
    const chord = riff?.[bar].findLast(note => note.step <= step);
    const chordPitches = chord ? guitarPitches(chord).map(degree) : [0, 7];
    const matching = usable.filter(pitch => chordPitches.includes(degree(pitch)));
    return pitches.indexOf(nearest(matching.length ? matching : usable, preferred));
  };

  const motifAnchor = anchor(0, templates.motif[0][0] + pickup, target);
  const sections = Array.from({length: riff?.length ?? config.bars ?? 4}, (_, bar) => bar === (riff?.length ?? config.bars ?? 4) - 1 ? templates.ending : bar % 2 === 0 ? templates.motif : templates.answer);
  const phrase = sections.flatMap((section, bar) => {
    const center = bar % 2 === 0 ? motifAnchor : anchor(bar, section[0][0], pitches[motifAnchor]);
    return section.map(([step, offset, transition, expression]) => ({
      bar,
      step: step + (bar % 2 === 0 ? pickup : 0) + (bar === 3 && offset === null && take === 2 ? 2 : 0),
      root: offset === null ? nearest(pitches.filter(pitch => degree(pitch) === 0), pitches[center]) : pitches[center + offset],
      transition,
      expression,
    }));
  });
  const bars = Array.from({length: sections.length}, () => []);
  phrase.forEach(({bar, step, root, transition, expression}, index) => {
    const previous = phrase[index - 1];
    const next = phrase[index + 1];
    const interval = previous ? root - previous.root : 0;
    const slide = transition === 'slide' && interval !== 0 && Math.abs(interval) <= 7;
    const hammer = transition === 'hammer' && interval > 0 && interval <= 4;
    const distance = (next ? next.bar * stepsPerBar + next.step : bars.length * stepsPerBar) - bar * stepsPerBar - step;
    bars[bar].push({
      step, root, articulation: 'single',
      length: Math.min(distance - (next?.transition ? .035 : .16), 9.4),
      transition: slide ? 'slide' : hammer ? 'hammer' : undefined,
      from: slide ? previous.root : undefined,
      expression,
      bendCents: expression === 'bend' ? templates.bendCents : undefined,
    });
  });
  return bars;
}

function makeGroove(config, guitar, variation, fresh = false) {
  if(config.style==='stoner') return makeStonerDrums(config,guitar,variation);
  const style = styles[config.style];
  const classicKicks = [
    [[0, 6, 8, 14], [0, 6, 9, 14], [0, 6, 8, 14], [0, 7, 10]],
    [[0, 3, 8, 11], [0, 6, 8, 13], [0, 3, 8, 11], [0, 5, 8, 14]],
    [[0, 6, 11], [0, 4, 7, 13], [0, 6, 11], [0, 4, 10]],
  ];
  const fills = [[13, 15], [10, 11, 14, 15], [12, 14, 15]];
  const classic = config.style === 'stoner' && !fresh;
  return guitar.map((barNotes, bar) => {
    const beats = Array.from({length: stepsPerBar}, () => []);
    const add = (step, kind, velocity = drumVoice[kind].velocity) => {
      if (!beats[step].some(hit => hit.kind === kind)) beats[step].push({kind, velocity});
    };
    const accents = barNotes.map(note => note.step).filter(step => step > 0);
    const suggested = variation === 2 ? [0, 6, 11] : style.kicks;
    const syncopations = accents.length ? [pick(accents)] : [14];
    if (fresh) syncopations.push(pick([3, 5, 7, 9, 11, 13, 14]));
    const kicks = classic ? classicKicks[variation][bar % 4] : [...suggested, ...syncopations];
    const hats = variation === 2 ? [0, 4, 8, 12] : style.hats;
    kicks.forEach(step => add(step, 'kick', step % 4 === 0 ? .94 : .77));
    (variation === 2 ? [8] : [4, 12]).forEach(step => add(step, 'snare'));
    if (bar === 0) add(0, 'crash');
    for (const step of hats) {
      if ((bar === 0 && step === 0) || (bar === 3 && step >= 12)) continue;
      add(step, variation === 1 && step % 4 === 2 ? 'open' : 'hat', step % 4 === 0 ? .44 : .27);
    }
    if (bar % 4 === 3) (fresh ? [...fills[variation], pick([10, 11, 12, 13, 14])] : fills[variation]).sort((a, b) => a - b).forEach((step, index, hits) => add(step, index === hits.length - 1 ? 'tom' : index % 2 ? 'tom-mid' : 'tom-high'));
    return beats;
  });
}

function guitarFrets(note) {
  if (note.voicing) return note.voicing;
  if (note.articulation === 'single') {
    const string = tunings.findLastIndex(open => open <= note.root);
    return [[string, note.root - tunings[string]]];
  }
  const rootString = note.root >= 45 ? 1 : 0;
  return guitarPitches(note).map((pitch, index) => [rootString + index, pitch - tunings[rootString + index]]);
}
function bassPitches(config) {
  return Array.from({length:30},(_,index)=>26+index).filter(pitch=>intervals(config.scale).includes((pitch-config.key+120)%12));
}

function makeBass(config, guitar, drums, behavior = 'riff') {
  if(config.style==='stoner') return makeStonerBass(config,guitar,drums,behavior);
  const pitches = bassPitches(config);
  const nearest = target => pitches.reduce((best,pitch)=>Math.abs(pitch-target)<Math.abs(best-target)?pitch:best);
  const home = 26 + (config.key + 10) % 12;
  return guitar.map((notes,bar)=>{
    const rhythm = behavior === 'root' ? [0,8] : behavior === 'independent'
      ? [...new Set([0,6,10,...drums[bar].flatMap((hits,step)=>hits.some(hit=>hit.kind==='kick')?[step]:[])])].sort((a,b)=>a-b)
      : [...new Set(notes.map(note=>note.step))];
    return rhythm.map((step,index)=>{
      const chord = notes.findLast(note=>note.step<=step) ?? notes[0];
      let target = behavior === 'root' ? home : chord ? chord.root-12 : home;
      while(target>55)target-=12;while(target<26)target+=12;
      const root = nearest(target + (behavior==='independent' && index%3===2 ? 7 : 0));
      const gap = (rhythm[index+1] ?? stepsPerBar)-step;
      return {step,root,length:Math.min(gap-.15,config.style==='punk'?1.8:behavior==='root'?7.8:3.8),articulation:'single'};
    });
  });
}

const riffTechniqueNames = {normal:'Normal / ohne Technik',hammer:'Hammer-on',pull:'Pull-off','bend-half':'Halbton hoch & zurück','bend-whole':'Ganzton hoch & zurück'};
const riffTechniqueSymbols = {hammer:'H',pull:'P','bend-half':'½↑↓','bend-whole':'1↑↓'};
function riffPreviousVoice(bars, bar, step, pitch) {
  const note = bars[bar]?.find(note => note.step === step);
  const string = note && guitarFrets(note).find(([s,f]) => tunings[s]+f === pitch)?.[0];
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
      const candidate=findRiffVoicing(guitarPitches(note).toSorted((a,b)=>a-b),voicing,{pitch,string});
      if(candidate) {previous=voice;voicing=candidate;break;}
    }
    if(!previous) return null;
    technique.from = previous.pitch;
  }
  if (type.startsWith('bend-') && voicing.find(([s,f]) => tunings[s]+f===pitch)?.[1] === 0) {
    voicing=findRiffVoicing(guitarPitches(note).toSorted((a,b)=>a-b),voicing,{pitch,fretted:true});
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
function decorateRiff(bars,config) {
  let result=bars;
  const options=riffGenerationOptions(config);
  const chance={stoner:.22,hard:.14,punk:.045}[config.style]??.14;
  const weights={stoner:{hammer:2,pull:1,'bend-half':3,'bend-whole':3},hard:{hammer:3,pull:3,'bend-half':2,'bend-whole':2},punk:{hammer:3,pull:2,'bend-half':1,'bend-whole':1}}[config.style];
  for(const [bar,notes] of bars.entries()) for(const note of notes) {
    if(Math.random()>chance) continue;
    const pitch=guitarPitches(note).at(-1);
    const choices=['hammer','pull','bend-half','bend-whole'].filter(type=>options[type.startsWith('bend-')?'bend':type])
      .map(type=>({type,bars:setRiffTechnique(result,bar,note.step,pitch,type),weight:weights?.[type]??1})).filter(choice=>choice.bars);
    if(!choices.length) continue;
    let target=Math.random()*choices.reduce((sum,choice)=>sum+choice.weight,0);
    const choice=choices.find(choice=>(target-=choice.weight)<0)??choices.at(-1);
    result=choice.bars;
  }
  return sustainRiff(result,config);
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
function sustainRiff(bars,config) {
  if(!riffGenerationOptions(config).sustain) return sanitizeRiffTechniques(normalizeRiffVoices(bars));
  let result=structuredClone(bars);
  const chance={stoner:.45,hard:.2,punk:.04}[config.style]??.2;
  for(const [bar,notes] of result.entries()) for(let i=0;i<notes.length-1;i++) {
    if(Math.random()>=chance) continue;
    const note=notes[i],next=notes[i+1];
    const pitch=guitarPitches(note).findLast(pitch=>!guitarPitches(next).includes(pitch));
    if(pitch===undefined) continue;
    note.voiceEdits={...note.voiceEdits,[pitch]:[[0,Math.min(stepsPerBar-note.step,next.step-note.step+(config.style==='stoner'?5:config.style==='hard'?3:1))]]};
    note.voiceArticulations={...note.voiceArticulations,[pitch]:'open'};
    const answer=guitarFrets(next).find(([string,fret])=>tunings[string]+fret!==pitch);
    if(answer) {
      const root=tunings[answer[0]]+answer[1];next.voicing=[answer];next.root=root;
      for(const key of ['voiceEdits','voiceTechniques','voiceArticulations']) if(next[key])next[key]=Object.fromEntries(Object.entries(next[key]).filter(([pitch])=>Number(pitch)===root));
    }
  }
  return sanitizeRiffTechniques(normalizeRiffVoices(result));
}

const riffGenerationLabels={open:'Offen',pm:'Palm Mute',sustain:'Ausklingende Begleittöne',hammer:'Hammer-on',pull:'Pull-off',bend:'Bendings'};
function defaultRiffTechniqueProfiles() {
  return Object.fromEntries(['stoner','hard','punk'].map(style=>[style,{open:true,pm:true,sustain:true,hammer:true,pull:true,bend:true}]));
}
let riffTechniqueProfiles=defaultRiffTechniqueProfiles();
function riffGenerationOptions(config) {
  const profile=config.riffTechniques??riffTechniqueProfiles[config.musicStyle??config.style]??defaultRiffTechniqueProfiles().stoner;
  return {...profile,sustain:Boolean(profile.sustain&&profile.open)};
}

const vocalRanges={low:{name:'Tief · A2–E4',min:45,max:64},mid:{name:'Mittel · C3–A4',min:48,max:69},high:{name:'Hoch · G3–F5',min:55,max:77}};
function vocalPitches(config,range='mid') {
  const {min,max}=vocalRanges[range]??vocalRanges.mid;
  return Array.from({length:max-min+1},(_,i)=>min+i).filter(pitch=>intervals(config.scale).includes((pitch-config.key+120)%12));
}
function makeVocal(config,riff,drums,range='mid',previous=null) {
  return makeFreshVocal(config,riff,drums,range,previous);
}
