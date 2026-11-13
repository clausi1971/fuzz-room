'use strict';

const get = id => document.getElementById(id);
const playButton = get('play');
const timeline = get('timeline');
const grooveNames = ['Grundgroove', 'Offene Hi-Hat', 'Halftime'];

const config = {tuning:'dropd',style: 'stoner', stonerStyle:'classic', melodyStyle: 'desert', key: 4, scale: 'minor', tempo: 90, mode: 'riff'};
const opening = Array.from({length:4},()=>[]);
let selected = {...config, guitar: opening, drums: Array.from({length:4},()=>Array.from({length:16},()=>[])), lead: null, bass: null, vocal: null};
let guitarName = 'Noch leer';
let grooveName = 'Noch leer';
let preset = null;
let polyphonicRiff = false;
let groove = 0;
let editedBar = -1;
let riffBar = -1;
let riffSelection = null;
let melodyBar = -1;
let bassBar = -1;
let vocalBar = -1;
let vocalName = 'Optional';
let vocalRange = 'mid';
let tabTrack = 'riff';
let bassName = 'Optional';
let bassStyle = 'riff';
let melodyEdited = false;
let melodyTool = '';
let noteDrag;
let suppressGridClick = false;
let leadTake = 0;
let sound;
let playback;
const mixerChannels = ['volume', 'guitar-volume', 'drum-volume', 'lead-volume', 'bass-volume', 'vocal-volume'];
const mixerMutes = new Set();
const editorTracks = {vocal:{name:'Gesang',channel:'vocal-volume',grid:'vocal-grid'},bass: {name:'Bass',channel:'bass-volume',grid:'bass-grid'}, riff: {name: 'Riff', channel: 'guitar-volume', grid: 'riff-grid'}, drums: {name: 'Drums', channel: 'drum-volume', grid: 'drum-grid'}, melody: {name: 'Melodie', channel: 'lead-volume', grid: 'melody-grid'}};
const drumGuides = {riff: {snare: false, kick: false}, melody: {snare: false, kick: false}};
let aiPromptContext;
let chatPart = 'melody';
let chatComparison;
const chatPartLabels = {melody: 'Melodie', riff: 'Riff', drums: 'Drums', arrangement: 'Arrangement', section: 'Songteil', bass: 'Bass', vocal: 'Gesang'};
let sectionSerial = 1;
let activeSection = 1;
let songParts = [{id: 1, name: 'Mein erster Teil', type: 'Riff', pattern: selected, meta: null}];
let restoringHistory = false;

function trackHistoryField(track) {
  return track === 'vocal' ? 'vocal' : track === 'bass' ? 'bass' : track === 'drums' ? 'drums' : track === 'riff' || selected.mode === 'melody' ? 'guitar' : 'lead';
}

function sectionHistory(part) {
  return part.history ??= Object.fromEntries(['guitar', 'drums', 'lead', 'bass', 'vocal'].map(field => [field, {past: [], future: []}]));
}

function trackSnapshot(pattern, meta, field) {
  const details = field === 'vocal' ? {vocalName:meta.vocalName??'Gesang',vocalRange:meta.vocalRange??'mid'} : field === 'bass' ? {bassName: meta.bassName ?? 'Bass', bassStyle: meta.bassStyle ?? 'riff'} : field === 'guitar'
    ? {guitarName: meta.guitarName, preset: meta.preset, polyphonicRiff: meta.polyphonicRiff, mode: pattern.mode,
      ...(pattern.mode === 'melody' ? {melodyEdited: meta.melodyEdited, leadTake: meta.leadTake} : {})}
    : field === 'drums' ? {grooveName: meta.grooveName, groove: meta.groove}
      : {melodyEdited: meta.melodyEdited, leadTake: meta.leadTake};
  return structuredClone({data: pattern[field], details});
}

function recordTrackChanges(part) {
  const history = sectionHistory(part);
  if (!part.meta || restoringHistory) return;
  for (const field of ['guitar', 'drums', 'lead', 'bass', 'vocal']) {
    if (JSON.stringify(part.pattern[field]) === JSON.stringify(selected[field])
      && (field !== 'guitar' || part.pattern.mode === selected.mode)) continue;
    history[field].past.push(trackSnapshot(part.pattern, part.meta, field));
    if (history[field].past.length > 30) history[field].past.shift();
    history[field].future = [];
  }
}

function historyLocked(track) {
  return Boolean(chatComparison || playButton.disabled || (track === 'drums'
    ? get('lock-drums').checked : trackHistoryField(track) === 'guitar' && get('lock-guitar').checked));
}

function renderHistoryButtons() {
  const part = songParts.find(part => part.id === activeSection);
  if (!part) return;
  const history = sectionHistory(part);
  for (const track of Object.keys(editorTracks)) {
    const {past, future} = history[trackHistoryField(track)];
    get(`${track}-undo`).disabled = historyLocked(track) || !past.length;
    get(`${track}-redo`).disabled = historyLocked(track) || !future.length;
    get(`${track}-history`).textContent = past.length || future.length ? `${past.length} zurück · ${future.length} wiederholen` : '';
  }
}

function restoreTrackHistory(track, redo = false) {
  if (historyLocked(track)) return;
  const part = songParts.find(part => part.id === activeSection);
  const field = trackHistoryField(track);
  const history = sectionHistory(part)[field];
  const from = redo ? history.future : history.past;
  const to = redo ? history.past : history.future;
  if (!from.length) return;
  to.push(trackSnapshot(selected, {...comparisonMeta(), groove, leadTake}, field));
  if (to.length > 30) to.shift();
  const {data, details} = from.pop();
  restoringHistory = true;
  try {
    const patch = {[field]: structuredClone(data)};
    if (field === 'guitar') {
      ({guitarName, preset, polyphonicRiff} = details);
      config.mode = details.mode;
      get('mode').value = details.mode;
      patch.mode = details.mode;
      if (details.mode === 'melody') ({melodyEdited, leadTake} = details);
    } else if (field === 'drums') ({grooveName, groove} = details);
    else if (field === 'bass') ({bassName, bassStyle} = details);
    else if (field === 'vocal') ({vocalName, vocalRange} = details);
    else ({melodyEdited, leadTake} = details);
    refresh(patch, {guitar: field === 'guitar', drums: field === 'drums', lead: field === 'lead', bass: field === 'bass', vocal: field === 'vocal', keepLead: true});
  } finally {
    restoringHistory = false;
    renderHistoryButtons();
  }
}

function sectionSteps() { return selected.guitar.length * stepsPerBar; }

function fitBars(bars, count) {
  if (!bars || bars.length === count) return bars;
  return Array.from({length: count}, (_, bar) => structuredClone(bars[bar % bars.length]));
}

function saveSection() {
  if (chatComparison) return;
  const part = songParts.find(part => part.id === activeSection);
  if (part) {
    recordTrackChanges(part);
    part.pattern = selected;
    part.meta = {...comparisonMeta(), style: config.style, melodyStyle: config.melodyStyle, groove, leadTake};
  }
  renderHistoryButtons();
}

function renderSong(updateName = true) {
  get('song-parts').replaceChildren(...songParts.map((part, index) => {
    const card = element('div', 'song-part');
    card.classList.toggle('playing', playback?.song?.[playback.songIndex]?.id === part.id);
    const open = element('button', 'song-open', `${index + 1}. ${part.name} · ${part.pattern.guitar.length} Takte`);
    open.type = 'button';
    open.dataset.section = part.id;
    open.setAttribute('aria-pressed', part.id === activeSection);
    card.append(open);
    for (const [action, label, disabled] of [['up', '←', index === 0], ['down', '→', index === songParts.length - 1]]) {
      const move = element('button', '', label);
      move.type = 'button'; move.dataset.section = part.id; move.dataset.move = action;
      move.disabled = disabled;
      move.setAttribute('aria-label', `${part.name} ${action === 'up' ? 'nach vorne' : 'nach hinten'} verschieben`);
      card.append(move);
    }
    const play=element('button','song-part-play','▶ Play');
    play.type='button';play.dataset.section=part.id;play.dataset.play='true';
    card.append(play);
    return card;
  }));
  renderSongPlayback();
  if (updateName) get('section-name').value = songParts.find(part => part.id === activeSection)?.name ?? '';
}

function renderSongPlayback(){
  const playingId=playback ? (playback.song ? playback.song[playback.position?.songIndex??playback.songIndex]?.id : activeSection) : null;
  for(const card of get('song-parts').children){
    const button=card.querySelector('button[data-play]');if(!button)continue;
    const part=songParts.find(p=>p.id===Number(button.dataset.section));
    if(!part){button.disabled=true;continue;}
    const playing=part?.id===playingId;
    button.textContent=playing?'■ Stopp':'▶ Play';
    button.setAttribute('aria-label',playing?part.name+' stoppen':part.name+' ab Takt 1 als Loop abspielen');
    button.setAttribute('aria-pressed',playing);button.disabled=playButton.disabled;
  }
}

function renderBarPickers() {
  const count = selected.guitar.length;
  editedBar = editedBar >= count ? 0 : editedBar;
  riffBar = riffBar >= count ? 0 : riffBar;
  melodyBar = melodyBar >= count ? 0 : melodyBar;
  bassBar = bassBar >= count ? 0 : bassBar;
  vocalBar = vocalBar >= count ? 0 : vocalBar;
  for (const picker of ['bar-picker', 'melody-bar-picker', 'riff-bar-picker', 'bass-bar-picker', 'vocal-bar-picker']) {
    get(picker).replaceChildren(...Array.from({length: count + 1}, (_, index) => {
      const bar = index - 1;
      const button = element('button', '', bar === -1 ? `Alle ${count}` : `Takt ${bar + 1}`);
      button.type = 'button'; button.dataset.bar = bar;
      return button;
    }));
  }
}

function openSection(id, {skipSave = false} = {}) {
  if (playButton.disabled) return;
  if (playback) stop();
  if (!skipSave) {
    endComparison();
    saveSection();
  }
  const part = songParts.find(part => part.id === id);
  if (!part) return;
  activeSection = id;
  aiPromptContext = null;
  const meta = part.meta;
  if (meta) {
    composeSettings=readComposeSettings(meta.composeSettings);
    ({guitarName, grooveName, preset, polyphonicRiff, melodyEdited, groove, leadTake} = meta);
    bassName = meta.bassName ?? 'Optional'; bassStyle = meta.bassStyle ?? 'riff';
    vocalName=meta.vocalName??'Optional';vocalRange=meta.vocalRange??'mid';
    config.style = meta.style; config.melodyStyle = meta.melodyStyle;
    config.stonerStyle=meta.stonerStyle??part.pattern.stonerStyle??'classic';
    get('mute-lead').checked = meta.muteLead;
  }
  config.tuning=part.pattern.tuning??'dropd';
  for (const field of ['key', 'scale', 'tempo', 'mode']) config[field] = part.pattern[field];
  for (const field of ['key', 'scale', 'tempo', 'mode', 'style']) get(field).value = config[field];
  get('melody-style').value = config.melodyStyle;
  selected = part.pattern;
  editedBar = riffBar = melodyBar = bassBar = vocalBar = -1;
  renderBarPickers();
  refresh({}, {guitar: true, drums: true, lead: true, bass: true, vocal: true, keepLead: true});
  get('counter').textContent = `01 / ${String(selected.guitar.length).padStart(2, '0')}`;
  get('song-status').textContent = `${part.name} geöffnet · ${selected.guitar.length} Takte. Der Loop-Player spielt diesen Teil.`;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pitchToneInfo(pitch) {
  const degree = (pitch - config.key + 120) % 12;
  if (degree === 0) return {className: 'tone-root', symbol: '★', short: 'Grundton · Ruhepunkt', description: 'Der Grundton ist der musikalische Anker. Hier fühlt sich eine Phrase häufig angekommen und abgeschlossen an.'};
  const special = config.scale === 'phrygian' ? {
    1: {className: 'tone-phrygian-two', symbol: '♭2', short: 'dunkle Spannung', description: 'Die kleine Sekunde liegt direkt über dem Grundton. Sie erzeugt eine enge, dunkle Reibung; die Rückkehr zum Grundton löst diese Spannung.'},
    8: {className: 'tone-phrygian-six', symbol: '♭6', short: 'schwer, melancholisch', description: 'Die kleine Sexte gibt der Phrase eine dunkle, oft melancholische Farbe. In langsamen Riffs kann sie besonders schwer wirken.'},
  } : config.scale === 'blues' ? {
    3: {className: 'tone-blues-three', symbol: '♭3', short: 'rau, klagend', description: 'Die kleine Terz trägt die Moll-Farbe. Betont oder mit Bendings gespielt wirkt sie oft rau, sehnsüchtig oder klagend.'},
    6: {className: 'tone-blues-five', symbol: '♭5', short: 'Blue Note · Reibung', description: 'Die verminderte Quinte ist die zusätzliche Blue Note der Moll-Blues-Tonleiter. Sie erzeugt eine scharfe Reibung und eignet sich als Durchgang zur Quarte oder Quinte.'},
    10: {className: 'tone-blues-seven', symbol: '♭7', short: 'erdig, offen', description: 'Die kleine Septime gibt vielen Blues- und Rockphrasen eine erdige, offene Farbe. Sie kann eine Antwort oder die Rückkehr zum Grundton vorbereiten.'},
  } : {};
  return special[degree] ?? {className: '', symbol: '', short: '', description: ''};
}

function pitchToneClass(pitch) { return pitchToneInfo(pitch).className; }

function pitchCaption(pitch, name) {
  const {symbol} = pitchToneInfo(pitch);
  return name + (symbol ? ` ${symbol}` : '');
}

function renderScaleLegend(id, suffix = '') {
  const label = get(id);
  label.replaceChildren(element('span', '', `${keyNames[config.key]}-${scaleNames[config.scale]}${suffix} · `));
  intervals(config.scale).forEach((degree, index) => {
    if (index) label.append(' · ');
    const pitch = (config.key + degree) % 12;
    const tone = element('span', pitchToneClass(pitch), pitchCaption(pitch, keyNames[pitch]));
    tone.title = pitchToneInfo(pitch).description || keyNames[pitch];
    label.append(tone);
  });
  const legend = element('span', 'scale-legend');
  for (const degree of intervals(config.scale)) {
    const pitch = (config.key + degree) % 12;
    const info = pitchToneInfo(pitch);
    if (!info.symbol) continue;
    if (legend.children.length) legend.append(' · ');
    const entry = element('span', info.className, `${keyNames[pitch]} ${info.symbol}: ${info.short}`);
    entry.title = info.description;
    legend.append(entry);
  }
  label.append(legend);
}

function renderTimeline(pattern) {
  timeline.replaceChildren(...pattern.guitar.map((notes, bar) => {
    const block = element('div', 'bar');
    const guitar = element('div', 'steps');
    const lead = pattern.lead && element('div', 'lead-steps');
    const bass = pattern.bass && element('div', 'bass-steps');
    const vocal = pattern.vocal && element('div','vocal-steps');
    const drums = element('div', 'beats');
    const attacks = pattern.mode === 'riff' ? riffAttacks(notes) : [];
    for (let step = 0; step < stepsPerBar; step++) {
      const voices = attacks.filter(voice => voice.step === step);
      const note = pattern.mode === 'riff' ? voices[0]?.note : notes.find(note => note.step === step);
      const editable = note && note.articulation !== 'single';
      const attackArticulation=voices[0]?.articulation ?? note?.articulation;
      const tick = element(editable ? 'button' : 'span', note ? `step note stroke-${attackArticulation}` : 'step');
      if (note) tick.style.setProperty('--height', `${10 + (voices.length ? Math.max(...voices.map(voice => voice.length)) : note.length) * 2.8}px`);
      if (editable) {
        const muted = attackArticulation === 'mute';
        tick.type = 'button';
        tick.classList.add('attack');
        tick.dataset.bar = bar;
        tick.dataset.step = note.step;
        tick.dataset.column = step;
        tick.disabled = get('lock-guitar').checked;
        tick.textContent = muted ? 'PM' : 'O';
        tick.title = muted ? 'Auf offenen Anschlag wechseln' : 'Auf Palm Mute wechseln';
        tick.setAttribute('aria-label', `Palm Mute, Takt ${bar + 1}, Schritt ${step + 1}`);
        tick.setAttribute('aria-pressed', muted);
      }
      guitar.append(tick);
      if (lead) lead.append(element('span', pattern.lead[bar].some(note => note.step === step) ? 'beat hit stroke-single' : 'beat'));
      if (bass) bass.append(element('span', pattern.bass[bar].some(note => note.step === step) ? 'beat hit' : 'beat'));
      if(vocal) vocal.append(element('span',pattern.vocal[bar].some(note=>note.step===step)?'beat hit':'beat'));
      drums.append(element('span', pattern.drums[bar][step].length ? 'beat hit' : 'beat'));
    }
    block.append(element('span', 'bar-number', `0${bar + 1}`), guitar);
    if (lead) block.append(lead);
    if (bass) block.append(bass);
    if(vocal) block.append(vocal);
    block.append(drums);
    return block;
  }));
}

function renderTabs(id, guitar, bass = false) {
  const tabTuning=guitarTunings[guitar.flat().some(n=>n.tuning==='a7')?'a7':'dropd'].notes;
  const bassStrings=bassTunings[guitar.flat().some(n=>n.bassTuning==='a5'||n.root<26)?'a5':'dropd'].notes;
  const names = bass ? bassStrings.map(p=>keyNames[p%12]) : tabTuning.map(p=>keyNames[p%12]);
  const frets = note => {
    if (!bass) return findRiffVoicing(guitarPitches(note).toSorted((a,b)=>a-b),[],null,tabTuning)??[];
    const tuning = bassStrings;
    const string = tuning.findLastIndex(pitch => pitch <= note.root);
    return string < 0 ? [] : [[string, note.root - tuning[string]]];
  };
  const strings = names.map(name => [`${name}|`]);
  const markers = ['  '];
  const mark = {mute: 'PM ', open: 'O  ', single: '♪  '};
  const techniques = {slide: 'S', hammer: 'H', pull:'P', bend: 'B', vibrato: 'V'};
  guitar.forEach(notes => {
    const bar = names.map(() => Array(stepsPerBar).fill('---'));
    const technique = Array(stepsPerBar).fill('   ');
    const entries = notes.every(note => note.articulation === 'single') ? notes : riffAttacks(notes).map(({note, step, index, pitch, articulation}) => ({
      ...note, step, articulation, riffTechnique: note.voiceTechniques?.[pitch]?.type, voicing: [guitarFrets(note)[index]],
    }));
    for (const note of entries) {
      const color = `stroke-${note.articulation}`;
      const playing = (riffTechniqueSymbols[note.riffTechnique] ?? '') + (techniques[note.transition] ?? '') + (note.expression === 'bend' ? bendSymbol(note) : techniques[note.expression] ?? '');
      if(playing || typeof technique[note.step]==='string') technique[note.step] = element('span', color, playing ? playing.padEnd(3) : mark[note.articulation]);
      for (const [string, fret] of frets(note)) {
        const suffix=({hammer:'H',pull:'P','bend-half':'b','bend-whole':'b'})[note.riffTechnique]??'';
        const field=element('span',color,(String(fret)+suffix).padEnd(3,'-'));
        if(note.riffTechnique) field.title=riffTechniqueNames[note.riffTechnique];
        bar[string][note.step]=field;
      }
    }
    markers.push(...technique, ' ');
    bar.forEach((steps, string) => strings[string].push(...steps, '|'));
  });
  const tab = get(id);
  tab.replaceChildren(...markers);
  for (const line of strings.reverse()) tab.append('\n', ...line);
}

function gridColumns(activeBar) {
  const bars = activeBar === -1 ? selected.guitar.map((_, index) => index) : [activeBar];
  return bars.flatMap(bar => Array.from({length: stepsPerBar}, (_, step) => ({bar, step})));
}

function startGrid(grid, label, activeBar, columns) {
  const all = activeBar === -1;
  grid.style.setProperty('--grid-steps', columns.length);
  grid.style.setProperty('--grid-width', `${Math.max(57, columns.length * .85 + 4)}rem`);
  grid.classList.toggle('all-bars', all);
  const header = element('div', 'grid-row grid-header');
  header.append(element('span', '', label));
  for (const {bar, step} of columns) {
    const tick = element('span', step % 4 === 0 ? 'downbeat' : '', step % 4 === 0 ? String(step / 4 + 1) : '·');
    tick.dataset.bar = bar;
    tick.dataset.step = step;
    const guideTrack = grid === get('riff-grid') ? 'riff' : grid === get('melody-grid') ? 'melody' : null;
    if (guideTrack) applyDrumGuide(tick, bar, step, guideTrack);
    if (bar > 0 && step === 0) tick.classList.add('bar-start');
    header.append(tick);
  }
  {
    const labels = element('div', 'grid-row grid-bar-labels');
    labels.append(element('span', '', 'Takte'));
    for (const {bar, step} of columns) if (step === 0) {
      const button=element('button','grid-bar-title',`Takt ${bar+1}`);
      button.type='button';button.dataset.loopBar=bar;
      button.title='Während der Wiedergabe: Takt loopen. Erneut klicken: ganzen Teil ab Takt 1 spielen.';
      button.setAttribute('aria-label',`Takt ${bar+1} als Loop ein- oder ausschalten`);
      button.setAttribute('aria-pressed',playback?.loopBar===bar);
      button.classList.toggle('selected-bar-loop',playback?.loopBar===bar);
      button.addEventListener('click',()=>toggleBarLoop(bar));
      labels.append(button);
    }
    grid.replaceChildren(labels, header);
  }
}

function applyDrumGuide(cell, bar, step, track) {
  for (const kind of ['snare', 'kick']) {
    const marked = drumGuides[track][kind] && selected.drums[bar][step].some(hit => hit.kind === kind);
    cell.classList.toggle(`guide-${kind}`, marked);
  }
}

function setGridCellPosition(cell, bar, step, guideTrack) {
  cell.dataset.bar = bar;
  cell.dataset.step = step;
  if (bar > 0 && step === 0) cell.classList.add('bar-start');
  if (guideTrack) applyDrumGuide(cell, bar, step, guideTrack);
}

function renderGrid() {
  const grid = get('drum-grid');
  const columns = gridColumns(editedBar);
  startGrid(grid, 'Instrument', editedBar, columns);
  for (const voice of drumVoices) {
    const row = element('div', 'grid-row');
    row.append(element('span', 'drum-label', voice.name));
    for (const {bar, step} of columns) {
      const hits = selected.drums[bar][step];
      const cell = element('button', step % 4 === 0 ? 'drum-cell downbeat' : 'drum-cell');
      cell.type = 'button';
      cell.disabled = get('lock-drums').checked;
      cell.dataset.voice = voice.id;
      setGridCellPosition(cell, bar, step);
      cell.setAttribute('aria-label', `${voice.name}, Takt ${bar + 1}, Schritt ${step + 1}`);
      cell.setAttribute('aria-pressed', hits.some(hit => hit.kind === voice.id));
      row.append(cell);
    }
    grid.append(row);
  }
  for (const button of get('bar-picker').children) {
    button.setAttribute('aria-pressed', Number(button.dataset.bar) === editedBar);
  }
}

function renderRiffGrid(bars = selected.guitar) {
  if (config.mode !== 'riff') return;
  const grid = get('riff-grid');
  const locked = get('lock-guitar').checked;
  const scale = intervals(config.scale);
  const columns = gridColumns(riffBar);
  const attacks = bars.map(riffAttacks);
  const visibleAttacks = riffBar === -1 ? attacks.flat() : attacks[riffBar];
  const voiced = new Set(visibleAttacks.map(voice => voice.pitch));
  const firstPitch = Math.min(tunings[0],...voiced);
  const lastPitch = Math.max(tunings.at(-1)+22,...voiced);
  renderScaleLegend('riff-key', ' · '+guitarTunings[config.tuning??'dropd'].name);
  get('riff-edit-status').textContent = '';
  get('riff-articulation').disabled = locked;
  for (const articulation of ['open', 'mute']) {
    get(`riff-articulation-${articulation}`).disabled = locked;
    get(`riff-articulation-${articulation}`).setAttribute('aria-pressed', get('riff-articulation').value === articulation);
  }
  startGrid(grid, 'Ton', riffBar, columns);
  for (let pitch = lastPitch; pitch >= firstPitch; pitch--) {
    if (!voiced.has(pitch) && !scale.includes((pitch - config.key + 120) % 12)) continue;
    const name = `${keyNames[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
    const row = element('div', 'grid-row');
    if (pitchToneClass(pitch)) row.classList.add(pitchToneClass(pitch));
    const pitchLabel = element('span', 'drum-label', pitchCaption(pitch, name));
    pitchLabel.title = pitchToneInfo(pitch).description || name;
    row.append(pitchLabel);
    for (const {bar, step} of columns) {
      const voice = attacks[bar].find(voice => voice.pitch === pitch && voice.step <= step && voice.step + voice.length > step);
      const onset = voice?.step === step;
      const muted = voice?.articulation === 'mute';
      const cell = element('button', step % 4 === 0 ? 'drum-cell riff-cell downbeat' : 'drum-cell riff-cell');
      cell.type = 'button';
      cell.disabled = locked;
      cell.dataset.pitch = pitch;
      setGridCellPosition(cell, bar, step, 'riff');
      if (voice) {
        cell.classList.add(muted ? 'stroke-mute' : 'stroke-open');
        cell.dataset.noteBar = bar;
        cell.dataset.noteStep = voice.note.step;
        cell.dataset.offset = voice.offset;
        if (onset) {
          const technique=voice.note.voiceTechniques?.[pitch]?.type;
          cell.textContent = riffTechniqueSymbols[technique] ?? (muted ? 'PM' : 'O');
          if(technique) {cell.classList.add('has-technique');cell.title=riffTechniqueNames[technique];}
        }
        else cell.classList.add('riff-hold');
      }
      const articulation = voice ? (muted ? ', Palm Mute' : ', offen') + (onset ? '' : ', klingt weiter') : '';
      if(riffSelection && voice && riffSelection.bar===bar && riffSelection.step===voice.note.step && riffSelection.pitch===pitch) cell.classList.add('selected-riff-tone');
      const technique=voice?.note.voiceTechniques?.[pitch]?.type;
      cell.setAttribute('aria-label', `${name}, Takt ${bar + 1}, Schritt ${step + 1}${articulation}${technique?', '+riffTechniqueNames[technique]:''}`);
      cell.setAttribute('aria-pressed', onset);
      row.append(cell);
    }
    grid.append(row);
  }
  renderRiffTools();
  for (const button of get('riff-bar-picker').children) {
    button.setAttribute('aria-pressed', Number(button.dataset.bar) === riffBar);
  }
}

function melodySource() {
  return config.mode === 'melody' ? selected.guitar : selected.lead;
}

function renderMelodyGrid(bars = melodySource()) {
  const solo = config.mode === 'melody';
  const locked = solo && get('lock-guitar').checked;
  const grid = get('melody-grid');
  const columns = gridColumns(melodyBar);
  const held = Array(sectionSteps()).fill(null);
  bars?.forEach((barNotes, barIndex) => {
    for (const note of barNotes) {
      const onset = barIndex * stepsPerBar + note.step;
      const end = Math.min(sectionSteps(), Math.ceil(onset + note.length));
      for (let step = onset + 1; step < end; step++) held[step] = {note, bar: barIndex};
    }
  });
  const pitches = [...new Set([...melodyPitches(config, true), ...(bars?.flat().map(note => note.root) ?? [])])].sort((a, b) => b - a);
  renderScaleLegend('melody-key');
  startGrid(grid, 'Ton', melodyBar, columns);
  for (const pitch of pitches) {
    const name = `${keyNames[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
    const row = element('div', 'grid-row');
    if (pitchToneClass(pitch)) row.classList.add(pitchToneClass(pitch));
    const pitchLabel = element('span', pitch % 12 === config.key ? 'drum-label tonic-label' : 'drum-label', pitchCaption(pitch, name));
    pitchLabel.title = pitchToneInfo(pitch).description || name;
    row.append(pitchLabel);
    for (const {bar, step} of columns) {
      const cell = element('button', step % 4 === 0 ? 'drum-cell melody-cell downbeat' : 'drum-cell melody-cell');
      const onset = bars?.[bar].find(note => note.step === step && note.root === pitch);
      const heldNote = held[bar * stepsPerBar + step];
      const sustain = heldNote?.note.root === pitch ? heldNote : null;
      const note = onset ?? sustain?.note;
      cell.type = 'button';
      cell.disabled = locked;
      cell.dataset.pitch = pitch;
      setGridCellPosition(cell, bar, step, 'melody');
      const description = onset ? `, Länge ${onset.length.toLocaleString('de-DE', {maximumFractionDigits: 1})} Sechzehntel` : sustain ? ', klingt weiter' : '';
      const techniques = [];
      if (note?.transition === 'hammer') techniques.push('Hammer-on');
      if(note?.transition==='pull')techniques.push('Pull-off');
      if (note?.expression === 'bend') techniques.push(bendDescription(note));
      if (note) {
        cell.dataset.noteBar = onset ? bar : sustain.bar;
        cell.dataset.noteStep = note.step;
      }
      if (onset && techniques.length) {
        cell.textContent = (onset.transition === 'hammer' ? 'H' : onset.transition==='pull'?'P':'') + (onset.expression === 'bend' ? bendSymbol(onset) : '');
        cell.classList.add('has-technique');
        cell.title = techniques.join(' · ');
      }
      cell.setAttribute('aria-label', `${name}, Takt ${bar + 1}, Schritt ${step + 1}${description}${techniques.length ? ', ' + techniques.join(', ') : ''}`);
      cell.setAttribute('aria-pressed', Boolean(onset));
      if (sustain && !onset) cell.classList.add('melody-hold');
      row.append(cell);
    }
    grid.append(row);
  }
  for (const button of get('melody-bar-picker').children) {
    button.setAttribute('aria-pressed', Number(button.dataset.bar) === melodyBar);
  }
}

function setMelodyTool(tool, message = '') {
  melodyTool = tool;
  let activeName = '';
  for (const button of get('melody-tools').children) {
    const active = button.dataset.tool === tool;
    button.setAttribute('aria-pressed', active);
    if (active) activeName = button.textContent;
  }
  get('melody-tool-status').textContent = message || (activeName ? `${activeName} ausgewählt. Klicke auf einen lila Ton.` : 'Wähle ein Werkzeug und dann einen lila Ton.');
}

function commitMelody(melody) {
  const solo = config.mode === 'melody';
  if (!solo && !selected.lead) {
    get('mute-lead').checked = false;
    applyVolume();
  }
  melodyEdited = true;
  if (solo) refresh({guitar: melody}, {guitar: true});
  else refresh({lead: melody}, {lead: true});
}

function focusGridPitch(grid, pitch, bar, step) {
  grid.querySelector(`[data-pitch="${pitch}"][data-bar="${bar}"][data-step="${step}"]`)?.focus({preventScroll: true});
}

function commitRiff(guitar, {fromChat = false} = {}) {
  if (!guitar) return;
  preset = null;
  if (fromChat) polyphonicRiff = false;
  guitarName = fromChat ? 'ChatGPT-Riff' : 'Bearbeitetes Riff';
  refresh({guitar}, {guitar: true, keepLead: fromChat});
}

function renderControls() {
  tunings=guitarTunings[config.tuning??'dropd'].notes;
  get('guitar-tuning').value=config.tuning??'dropd';
  renderComposeSettings();
  const guitarLocked=get('lock-guitar').checked,drumsLocked=get('lock-drums').checked;
  get('open-ai-riff').disabled=get('track-ai-guitar').disabled=guitarLocked;
  get('open-ai-drums').disabled=get('track-ai-drums').disabled=drumsLocked;
  get('open-ai-arrangement').disabled=guitarLocked||drumsLocked;
  get('riff-editor').hidden=selected.mode!=='riff';
  get('vocal-range').value=vocalRange;
  const tracks={riff:selected.guitar,drums:selected.drums,melody:melodySource(),bass:selected.bass,vocal:selected.vocal};
  const ids={riff:'guitar',drums:'drums',melody:'lead',bass:'bass',vocal:'vocal'};
  for(const [track,bars] of Object.entries(tracks)) {
    const filled=Boolean(bars?.flat(track==='drums'?2:1).length);
    get('export-'+ids[track]).disabled=!filled;
    get('clear-'+track).disabled=!filled||(track==='riff'&&guitarLocked)||(track==='drums'&&drumsLocked);
  }
  get('guitar-name').textContent=tracks.riff.flat().length?guitarName:'Noch leer';
  get('groove').textContent=tracks.drums.flat(2).length?grooveName:'Noch leer';
  get('lead-status').textContent=selected.lead?'Eigene Melodie':'Noch leer';
  get('bass-name').textContent=selected.bass?bassName:'Noch leer';
  get('vocal-name').textContent=selected.vocal?vocalName:'Noch leer';
  get('export-guitar').dataset.track=config.mode;
  get('lead-volume').disabled=!melodySource();get('bass-volume').disabled=!selected.bass;get('vocal-volume').disabled=!selected.vocal;
  get('mute-lead-label').hidden=!selected.lead;
  for(const channel of mixerChannels){const button=get(channel+'-mute');button.disabled=get(channel).disabled;button.setAttribute('aria-pressed',isMixerMuted(channel));button.textContent=isMixerMuted(channel)?'Stumm':'Mute';}
  timeline.classList.toggle('lead-muted',get('mute-lead').checked);
  get('export').disabled=!Object.values(tracks).some(bars=>bars?.flat(2).length);
  renderTabView();renderEditorTransport();
}

function editorTrackAvailable(track) {
  return track === 'vocal' ? Boolean(selected.vocal) : track === 'bass' ? Boolean(selected.bass) : track === 'riff' ? selected.mode === 'riff' : track === 'melody' ? Boolean(melodySource()) : true;
}

function renderEditorTransport() {
  if (playback?.soloTrack && !editorTrackAvailable(playback.soloTrack)) { stop(); return; }
  for (const [track, {name, grid}] of Object.entries(editorTracks)) {
    const playing = Boolean(playback);
    const solo = playback?.soloTrack === track;
    const silent = Boolean(playback?.soloTrack && !solo);
    const play = get(`${track}-play`);
    play.textContent = playing ? '■ Stopp' : '▶ Play';
    play.setAttribute('aria-label', playing ? `Wiedergabe stoppen am ${name}-Raster` : `Alle Spuren abspielen am ${name}-Raster`);
    play.disabled = playButton.disabled;
    const button = get(`${track}-solo`);
    button.disabled = playButton.disabled || !editorTrackAvailable(track);
    button.setAttribute('aria-pressed', solo);
    button.textContent = 'Solo';
    const headingSolo=get('heading-'+track+'-solo');
    headingSolo.disabled=button.disabled;headingSolo.setAttribute('aria-pressed',solo);
    headingSolo.title=solo?'Solo aufheben':name+' solo abspielen';
    get('heading-volume-'+track).classList.toggle('heading-solo-muted',silent);
    get(grid).classList.toggle('solo-muted', silent);
    get(`${track}-solo-state`).textContent = !editorTrackAvailable(track) ? 'Keine Spur vorhanden' : solo ? 'Solo aktiv' : silent ? 'Durch Solo stumm' : playing ? 'Gemeinsame Wiedergabe' : '';
  }
  renderHistoryButtons();
  renderMelodyOctaveButtons();
  renderSongPlayback();
}

function renderGridPosition(visible = playback?.position) {
  renderBarLoopSelection();
  const opened = songParts.find(part => part.id === activeSection);
  const playing = visible && playback?.song ? playback.song[visible.songIndex] : opened;
  const text = visible
    ? `${playing.name} · Takt ${visible.bar + 1}/${visible.pattern.guitar.length} · Zählzeit ${Math.floor(visible.step / 4) + 1} · Schritt ${visible.step + 1}/16`
    : `${opened.name} · ${selected.guitar.length} Takte · Bereit`;
  const showCursor = visible && (!playback?.song || playing.id === activeSection);
  for (const [track, {grid}] of Object.entries(editorTracks)) {
    const status = get(`${track}-position`);
    if (status.textContent !== text) status.textContent = text;
    get(grid).querySelectorAll('.playhead').forEach(cell => cell.classList.remove('playhead'));
    if (showCursor) get(grid).querySelectorAll(`[data-bar="${visible.bar}"][data-step="${visible.step}"]`).forEach(cell => cell.classList.add('playhead'));
  }
}

function renderBarLoopSelection(){
  for(const {grid} of Object.values(editorTracks))for(const button of get(grid).querySelectorAll('button[data-loop-bar]')){
    const chosen=playback?.loopBar===Number(button.dataset.loopBar);
    button.setAttribute('aria-pressed',chosen);button.classList.toggle('selected-bar-loop',chosen);
  }
}

function toggleBarLoop(bar){
  if(!playback||playButton.disabled||!Number.isInteger(bar)||bar<0||bar>=selected.guitar.length)return;
  const next=playback.loopBar===bar?null:bar;
  sound.stop();
  playback.loopBar=next;playback.song=null;playback.songIndex=0;delete playback.endTime;
  playback.scheduled=playback.active=selected;
  playback.riffAttacks=selected.mode==='riff'?selected.guitar.map(riffAttacks):null;
  playback.step=(next??0)*stepsPerBar;
  playback.nextTime=sound.context.currentTime+.05;
  playback.visual.length=0;delete playback.position;
  applyVolume();renderTimeline(selected);renderSong();renderEditorTransport();renderGridPosition();
  get('counter').textContent=`${String((next??0)+1).padStart(2,'0')} / ${String(selected.guitar.length).padStart(2,'0')}`;
  updateTransportStatus();schedule();
}

function toggleMixerMute(channel) {
  if (get(`${channel}-mute`).disabled) return;
  if (channel === 'lead-volume') get('mute-lead').checked = !isMixerMuted(channel);
  else if (isMixerMuted(channel)) mixerMutes.delete(channel);
  else mixerMutes.add(channel);
  renderControls();
  applyVolume();
}

async function toggleEditorSolo(track) {
  if (playButton.disabled || !editorTrackAvailable(track)) return;
  if (!playback) return togglePlayback(false, track);
  playback.soloTrack = playback.soloTrack === track ? null : track;
  applyVolume();
  renderEditorTransport();
  updateTransportStatus();
}

function aiMelodyBars(notes, count = selected.guitar.length) {
  const bars = Array.from({length: count}, () => []);
  for (const [index, note] of notes.entries()) {
    const previous = notes[index - 1];
    const interval = previous ? note.pitch - previous.pitch : 0;
    const slide = note.technique === 'slide' && interval !== 0 && Math.abs(interval) <= 7;
    const hammer = note.technique === 'hammer' && interval >= 1 && interval <= 4;
    const pull=note.technique==='pull'&&interval<=-1&&interval>=-4;
    const bend = note.technique.startsWith('bend-');
    bars[Math.floor(note.step / stepsPerBar)].push({
      step: note.step % stepsPerBar, root: note.pitch, length: note.duration, articulation: 'single',
      transition: slide ? 'slide' : hammer ? 'hammer' : pull?'pull':undefined, from: slide ? previous.pitch : undefined,
      expression: bend ? 'bend' : note.technique === 'vibrato' ? 'vibrato' : undefined,
      bendCents: bend ? (note.technique === 'bend-half' ? 100 : 200) : undefined,
      bendShape: note.technique === 'bend-up-return' ? 'up-return' : note.technique === 'bend-release' ? 'release' : undefined,
    });
  }
  return bars;
}

function chatTrackContext(part) {
  return {part, bars: part === 'section' ? Number(get('ai-section-bars').value) : selected.guitar.length,
    sectionType: part === 'section' ? get('ai-section-type').value : null,
    sourceId: activeSection, sourcePattern: part === 'section' ? selected : null,
    hasBass: Boolean(selected.bass),
    hasVocal:Boolean(selected.vocal),vocalRange:part==='vocal'?get('ai-vocal-range').value:vocalRange,
    vocal:part!=='vocal'&&part!=='arrangement'?selected.vocal:null,
    songSignature: part === 'section' ? songParts.map(part => `${part.id}:${part.name}`).join('|') : null,
    key: selected.key, scale: selected.scale, tempo: selected.tempo, mode: selected.mode,
    style: part === 'melody' ? config.melodyStyle : config.style,
    melodyStyle: ['arrangement', 'section'].includes(part) ? config.melodyStyle : null,
    bassStyle: part === 'bass' ? get('ai-bass-style').value : null, bassTuning:composeSettings.bass.bass.tuning,
    bass: part !== 'bass' && part !== 'arrangement' ? selected.bass : null,
    riff: ['drums', 'melody', 'section', 'bass', 'vocal'].includes(part) && selected.mode === 'riff' ? selected.guitar : null,
    drums: ['riff', 'melody', 'section', 'bass', 'vocal'].includes(part) ? selected.drums : null,
    tuning:config.tuning??'dropd',musicStyle: config.style,stonerStyle:config.stonerStyle, composeSignature:JSON.stringify(composeSettings),
    melody: ['riff', 'drums', 'section', 'bass', 'vocal'].includes(part) ? (selected.mode === 'melody' ? selected.guitar : selected.lead) : null};
}

function chatStyleName(context) {
  const field = 'style';
  return get(field).selectedOptions?.[0]?.textContent ?? context.style;
}

function chatTrackPrompt(context, description) {
  const tuning=guitarTunings[context.tuning??'dropd'];
  if (context.part === 'bass') return chatBassPrompt(context, description)+composePromptGuidance(context);
  if(context.part==='vocal') return chatVocalPrompt(context,description)+composePromptGuidance(context);
  const count = context.bars;
  const steps = count * stepsPerBar;
  let prompt = buildChatTrackPrompt(context.part === 'section' ? {...context, part: 'arrangement'} : context, description)
    .replaceAll('viertaktigen', `${count}-taktigen`)
    .replaceAll('die vier Takte', `die ${count} Takte`)
    .replaceAll('Takt 4', `Takt ${count}`)
    .replaceAll('0 bis 63', `0 bis ${steps - 1}`)
    .replaceAll('1–64 Anschläge', `1–${steps} Anschläge`)
    .replaceAll('2–64', `2–${steps}`)
    .replaceAll('Schritt 64', `Schritt ${steps}`);
  if (['arrangement', 'section'].includes(context.part) && context.hasBass) prompt += `\nKomponiere zusätzlich die Bassspur im selben JSON als "bass":{"notes":[{"step":0,"pitch":${bassPitches(context)[0]},"duration":4}]}. Erlaubte MIDI-Töne: ${bassPitches(context).join(', ')}. Einstimmig, 1 bis ${steps} Noten, ganzzahlige Einsätze 0 bis ${steps-1}, positive ganzzahlige Dauern, Ende spätestens bei Schritt ${steps}. Stimme den Bass auf Riff, Drums, Melodie und Musikstil ab.`;
  if(['riff','arrangement','section'].includes(context.part)) prompt+='\nNeue Rifftöne ohne automatische Hammer-ons, Pull-offs oder Bendings spielen. Genau ein Ton pro Anschlag, keine Akkorde. Palm Mute gemäß PM-Anteil; unterschiedliche ausklingende Töne dürfen sich überlagern. Vorhandene Begleitspuren unverändert lassen. Spieltechniken werden bei Bedarf danach manuell im Raster gesetzt.';
  if(['arrangement','section'].includes(context.part)&&context.hasVocal) prompt+='\nKomponiere zusätzlich eine Gesangsmelodie als vocal:{notes:[{step:0,pitch:'+vocalPitches(context,context.vocalRange)[0]+',duration:4}]}. '+vocalPromptRules(context);
  prompt+=composePromptGuidance(context);
  prompt=prompt.replaceAll('38–86',tuning.notes[0]+'–'+(tuning.notes.at(-1)+22)).replaceAll('Drop-D-Leersaiten: MIDI 38, 45, 50, 55, 59, 64','Leersaiten: MIDI '+tuning.notes.join(', ')).replaceAll('Drop-D-Leersaiten: 38, 45, 50, 55, 59, 64','Leersaiten: '+tuning.notes.join(', ')).replaceAll('Drop-D',tuning.name);
  if(['riff','arrangement','section'].includes(context.part))prompt+='\n'+newRiffStyleGuidance(context.musicStyle)+' Aktive Gitarrenstimmung: '+tuning.name+'. Leersaiten MIDI '+tuning.notes.join(', ')+'. Keine Akkorde, genau ein Ton pro Anschlag; gewählten PM-Anteil und die gewählte Tonleiter einhalten.';
  if(context.part==='drums')prompt=prompt.replace('Kick und Riff stützen einander;','Eigenständiger Drum-Groove;').replace('Halte die Begleitung rhythmisch zusammen.','Entwickle einen eigenständigen Groove zum Stil.');
  if (context.part !== 'section') return prompt;
  prompt = prompt.replace('und am Ende zum Loop zurückführen.', 'und am Ende zum folgenden Songteil überleiten. Beim Outro darf der Schluss ausklingen.');
  const source = {
    name: songParts.find(part => part.id === context.sourceId)?.name,
    bars: selected.guitar.length,
    riff: context.riff?.flatMap((notes, bar) => riffAttacks(notes).map(voice => [bar * stepsPerBar + voice.step, voice.pitch, voice.length])),
    melody: context.melody?.flatMap((notes, bar) => notes.map(note => [bar * stepsPerBar + note.step, note.root, note.length])),
    drums: context.drums?.flatMap((beats, bar) => beats.flatMap((hits, step) => hits.map(hit => [bar * stepsPerBar + step, hit.kind]))),
    bass: context.bass?.flatMap((notes, bar) => notes.map(note => [bar * stepsPerBar + note.step, note.root, note.length])),
  };
  const role = {
    Intro: 'Baue Spannung auf und führe das Hauptmotiv ein.',
    Strophe: 'Reduziere die Dichte und lasse Platz für Gesang.',
    'Pre-Chorus': 'Steigere die Spannung und leite zum Refrain über.',
    Refrain: 'Einprägsames Hauptmotiv, voller und offener als die Strophe.',
    Bridge: 'Deutlicher Kontrast in Motiv, Dynamik oder Rhythmus; bleibe harmonisch verbunden und leite zur Fortsetzung über.',
    Solo: 'Entwickle eine zusammenhängende Lead-Phrase über einer tragenden Begleitung.',
    Breakdown: 'Reduzierter, schwerer Groove mit gezielten Pausen und gemeinsamen Akzenten.',
    Outro: 'Greife das Motiv auf und führe zu einem musikalischen Abschluss.',
  }[context.sectionType];
  return [prompt,
    `AUFGABE: Ergänze einen NEUEN Songteil: ${context.sectionType}, genau ${count} Takte. ${role}`,
    `Vorhandene Reihenfolge: ${songParts.map(part => `${part.name} (${part.pattern.guitar.length} Takte)`).join(' → ')}. Einfügen nach: ${source.name}.`,
    `Vorhandener Teil als musikalische Vorlage: ${JSON.stringify(source)}. Riff/Melodie: [Einsatz, MIDI-Ton, Länge], Drums: [Einsatz, Instrument].`,
    'Der vorhandene Teil bleibt unverändert. Entwickle einen dazu passenden neuen Teil mit eigenem Motiv und einem stimmigen Übergang. Berücksichtige Grundton, Tonart, Tempo, Musikstil und Rhythmus der Vorlage.',
    `Entwickle alle ${count} Takte mit Motivwiederkehr und Variationen. Liefere keine bloße Wiederholung von vier Takten. Alle step-Werte im Ergebnis gehören zum neuen Teil: 0 bis ${steps - 1}.`,
  ].join('\n');
}

function buildChatTrackPrompt(context, description) {
  const riff = context.riff?.flatMap((notes, bar) => riffAttacks(notes).map(voice => [
    bar * stepsPerBar + voice.step, voice.pitch, Math.round(voice.length * 100) / 100,
  ])) ?? [];
  const key = `${keyNames[context.key]}-${scaleNames[context.scale]}`;
  const melody = context.melody?.flatMap((notes, bar) => notes.map(note => [bar * stepsPerBar + note.step, note.root, Math.round(note.length * 100) / 100])) ?? [];
  const drums = context.drums?.flatMap((beats, bar) => beats.flatMap((hits, step) => hits.map(hit => [bar * stepsPerBar + step, hit.kind]))) ?? [];
  const brief = [
    `4/4-Takt, ${context.tempo} BPM, ${key}, Stil: ${chatStyleName(context)}.`,
    `Klangwunsch: ${description.trim() || 'Ein wiedererkennbarer Groove passend zum Stil.'}`,
    riff.length ? `Riff als [Einsatz, MIDI-Tonhöhe, Länge in Sechzehnteln]: ${JSON.stringify(riff)}.` : '',
    melody.length ? `Melodie als [Einsatz, MIDI-Tonhöhe, Länge in Sechzehnteln]: ${JSON.stringify(melody)}.` : '',
    drums.length ? `Drums als [Einsatz, Instrument]: ${JSON.stringify(drums)}.` : '',
    context.vocal ? `Vorhandener Gesang [Einsatz,MIDI-Ton,Länge]: ${JSON.stringify(context.vocal.flatMap((notes,bar)=>notes.map(note=>[bar*16+note.step,note.root,note.length])))}. Lasse Raum für die Gesangsphrase.` : '',
    context.bass ? `Vorhandener Bass als [Einsatz, MIDI-Ton, Länge]: ${JSON.stringify(context.bass.flatMap((notes,bar)=>notes.map(note=>[bar*16+note.step,note.root,note.length])))}.` : '',
    'Komponiere die gewählte Spur neu zu den vorhandenen Begleitspuren. Diese bleiben unverändert. Grundton, Tonart, Tempo und die vier Takte sind verbindlich. Beachte ihre Tonhöhen, Notenlängen, Pausen und rhythmischen Akzente; die neue Spur soll musikalisch dazu passen.',
    {stoner: 'Stoner Rock: schwerer, lässiger Groove, markante wiederkehrende Motive, Raum für lange Töne und gezielte Synkopen. Kick und Riff stützen einander; die Melodie darf Riffanschläge überklingen.', punk: 'Punk Rock: direkter, treibender Groove, klare kurze Motive, Achtelpuls und prägnante Akzente. Halte die Begleitung rhythmisch zusammen.', hard: 'Hard Rock: druckvoller Backbeat, griffige Riffmotive und gezielte Synkopen. Melodie und Riff antworten einander; nutze Pausen für Platz.'}[context.musicStyle]??newRiffStyleGuidance(context.musicStyle),
    'Behalte den Puls der Begleitung bei, ohne jeden Anschlag zu verdoppeln. Führe Takt 4 musikalisch zurück zu Takt 1. Antworte nur mit einem JSON-Codeblock. Ersetze die Beispielwerte durch deine Komposition.',
  ].filter(Boolean);
  if (context.part === 'arrangement') {
    const root = tonic(context.key);
    const pitches = melodyPitches(context);
    const melodyStyle = get('style').selectedOptions?.[0]?.textContent ?? context.musicStyle;
    return [
      'Komponiere ein vollständiges, originelles Arrangement aus Gitarrenriff, Lead-Melodie und Drums für denselben viertaktigen Loop in Fuzz Room.',
      `4/4-Takt, ${context.tempo} BPM, ${key}. Riff- und Drumstil: ${chatStyleName(context)}. Melodiestil: ${melodyStyle}.`,
      `Klangwunsch: ${description.trim() || 'Ein schwerer Groove mit wiedererkennbarem Riff und einer passenden Lead-Melodie.'}`,
      'Plane alle drei Spuren zusammen. Kick und Riff sollen sich rhythmisch ergänzen. Die Melodie soll ein Motiv entwickeln, über manche Riffanschläge hinweg ausklingen und am Ende zum Loop zurückführen.',
      'Antworte ausschließlich mit einem JSON-Codeblock. Ersetze alle Beispielwerte durch dein Arrangement:',
      JSON.stringify({
        riff: {notes: [{step: 0, pitches: [root], duration: 3, articulation: 'open'}]},
        melody: {notes: [{step: 0, pitch: pitches[0], duration: 8, technique: 'none'}, {step: 8, pitch: pitches[2], duration: 4, technique: 'none'}]},
        drums: {hits: [{step: 0, kind: 'kick', velocity: .9}, {step: 4, kind: 'snare', velocity: .8}]},
      }),
      'Alle step-Werte sind ganzzahlige Sechzehntelpositionen von 0 bis 63. duration ist eine positive ganze Zahl in Sechzehnteln.',
      `Riff: 1–64 Anschläge, je ein Eintrag pro Einsatz, genau ein MIDI-Ton pro Anschlag im Bereich 38–86 in ${key}. Drop-D-Leersaiten: 38, 45, 50, 55, 59, 64. Eine Note pro Saite, höchstens vier Bünde Spannweite. articulation: open oder mute nach PM-Anteil. Ein Ton pro Anschlag; Notenlängen passend zum gewählten Rhythmus.`,
      `Melodie: 2–64 einstimmige Noten ohne Überschneidung, erlaubte MIDI-Töne ${pitches.join(', ')}. technique ausschließlich gemäß den MELODIE-BAUSTEINEN und den dort freigegebenen Techniken.`,
      'Drums: kick, snare, hat, open, tom-high (hohe Tom), tom-mid (mittlere Tom), tom (Standtom) oder crash. velocity: Zahl über 0 bis 1. Mehrere verschiedene Instrumente pro Schritt sind erlaubt.',
    ].join('\n');
  }
  if (context.part === 'drums') {
    return ['Komponiere einen Drumgroove für einen viertaktigen Loop in Fuzz Room.', ...brief,
      JSON.stringify({hits: [{step: 0, kind: 'kick', velocity: .9}, {step: 4, kind: 'snare', velocity: .8}]}),
      'step: ganzzahliger Einsatz in Sechzehnteln von 0 bis 63. Erlaubte Instrumente: kick, snare, hat (geschlossen), open (offene Hi-Hat), tom-high, tom-mid, tom (Standtom), crash. velocity: Zahl über 0 bis 1. Mehrere Instrumente dürfen im selben Schritt spielen. Jedes Instrument pro Schritt höchstens einmal.',
    ].join('\n');
  }
  if (context.part === 'riff') {
    const root = tonic(context.key);
    return ['Komponiere ein originelles, spielbares Drop-D-Gitarrenriff für einen viertaktigen Loop in Fuzz Room.', ...brief,
      JSON.stringify({notes: [{step: 0, pitches: [root], duration: 3, articulation: 'open'}, {step: 4, pitches: [root], duration: 4, articulation: 'open'}]}),
      `Erlaubte MIDI-Tonhöhen: 38–86 in ${key}, tiefe Lagen bevorzugen. Drop-D-Leersaiten: MIDI 38, 45, 50, 55, 59, 64. Höchstens eine Note pro Saite und höchstens vier Bünde Spannweite zwischen gegriffenen Tönen.`,
      'step: ganzzahliger Einsatz von 0 bis 63 in Sechzehnteln. pitches: genau ein MIDI-Ton pro Anschlag. duration: Länge in Sechzehnteln, höchstens bis zum Taktende. Ein Ton pro Anschlag; Notenlängen passend zum gewählten Rhythmus, Überlagerung unterschiedlicher Töne erlaubt. articulation: open oder mute nach PM-Anteil. Nur ein Eintrag pro Einsatz.',
    ].join('\n');
  }
  const pitches = melodyPitches(context);
  return [
    'Komponiere eine originelle, einstimmige E-Gitarrenmelodie für einen viertaktigen Loop in Fuzz Room.',
    ...brief,
    `Erlaubte MIDI-Tonhöhen: ${pitches.join(', ')}.`,
    'Lass einzelne Töne ausklingen, entwickle das Motiv und führe es zu einem Schluss.',
    JSON.stringify({notes: [{step: 0, pitch: pitches[0], duration: 8, technique: 'none'}, {step: 8, pitch: pitches[2], duration: 4, technique: 'none'}]}),
    'step: ganzzahliger Einsatz in Sechzehnteln von 0 bis 63. duration: ganzzahlige Dauer in Sechzehnteln, mindestens 1. 2–64 Noten, keine doppelten Einsätze oder Überschneidungen. Die letzte Note endet spätestens bei Schritt 64.',
    'technique ausschließlich gemäß den MELODIE-BAUSTEINEN und den dort freigegebenen Techniken. Normale Töne haben technique: none.',
  ].join('\n');
}

function readChatJson(text) {
  const source = text.trim();
  if (!source || source.length > 150000) throw new Error('Füge den JSON-Code aus ChatGPT ein.');
  const block = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  try { return JSON.parse(block?.[1] ?? source); } catch {
    throw new Error('Die Antwort ist kein gültiger JSON-Code. Kopiere den Codeblock aus ChatGPT.');
  }
}

function readChatMelody(value, context) {
  const allowed=context.composeSignature?readComposeSettings(JSON.parse(context.composeSignature)).melody.melody.techniques:null;
  const notes = value?.notes;
  const steps = (context.bars ?? selected.guitar.length) * stepsPerBar;
  if (!Array.isArray(notes) || notes.length < 2 || notes.length > steps) throw new Error(`Die Antwort muss 2 bis ${steps} Noten enthalten.`);
  const pitches = melodyPitches(context);
  const techniques = ['none', 'hammer', 'pull', 'slide', 'bend-half', 'bend-whole', 'bend-up-return', 'bend-release', 'vibrato'];
  const sorted = notes.map(note => {
    if (!note || !Number.isInteger(note.step) || note.step < 0 || note.step >= steps
        || !pitches.includes(note.pitch) || !Number.isInteger(note.duration) || note.duration < 1 || note.duration > steps
        || !techniques.includes(note.technique ?? 'none')) {
      throw new Error('Einige Noten passen nicht zur Tonart oder zum Raster. Bitte ChatGPT, die Vorgaben in der Anfrage einzuhalten.');
    }
    return {...note, technique: note.technique ?? 'none'};
  }).sort((a, b) => a.step - b.step);
  return sorted.map((note, index) => {
    if(allowed&&note.technique!=='none'){
      const type=note.technique.startsWith('bend-')?'bend':note.technique;
      if(!allowed[type])throw new Error('Die Melodie enthält eine nicht freigegebene Spieltechnik. Bitte ChatGPT um eine passende Korrektur.');
      if(['hammer','pull'].includes(type)){
        const previous=sorted[index-1],interval=previous?note.pitch-previous.pitch:0;
        if(!previous||previous.step+previous.duration<note.step||!melodyLegatoPossible(previous.pitch,note.pitch,context.tuning??'dropd')||(type==='hammer'?interval<=0:interval>=0))throw new Error('Hammer-on/Pull-off braucht direkt verbundene passende Töne auf derselben Saite.');
      }
      if(type==='bend'&&!pitches.includes(note.pitch+(note.technique==='bend-half'?1:2)))throw new Error('Der Zielton des Bendings liegt außerhalb der gewählten Tonleiter.');
    }
    const available = (sorted[index + 1]?.step ?? steps) - note.step;
    if (available === 0) throw new Error('Zwei Noten beginnen im selben Schritt. Bitte ChatGPT um eine einstimmige Melodie.');
    return {...note, duration: Math.min(note.duration, available)};
  });
}

function readChatRiff(value, context) {
  const tunings=guitarTunings[context.tuning??'dropd'].notes;
  const notes = value?.notes;
  const steps = (context.bars ?? selected.guitar.length) * stepsPerBar;
  if (!Array.isArray(notes) || !notes.length || notes.length > steps) throw new Error(`Das Riff muss 1 bis ${steps} Anschläge enthalten.`);
  const scale = intervals(context.scale);
  const bars = Array.from({length: steps / stepsPerBar}, () => []);
  const positions = new Set();
  for (const note of notes) {
    if (!note || !Number.isInteger(note.step) || note.step < 0 || note.step >= steps
        || !Number.isInteger(note.duration) || note.duration < 1 || note.duration > stepsPerBar
        || !['open', 'mute'].includes(note.articulation) || !Array.isArray(note.pitches) || !note.pitches.length || note.pitches.length > tunings.length
        || new Set(note.pitches).size !== note.pitches.length || !note.pitches.every(pitch => Number.isInteger(pitch)
          && pitch >= tunings[0] && pitch <= tunings.at(-1) + 22 && scale.includes((pitch - context.key + 120) % 12))) {
      throw new Error('Ein Riffanschlag passt nicht zur Tonart, Länge oder Spielweise. Bitte ChatGPT, die Vorgaben einzuhalten.');
    }
    if(note.durations!==undefined && (!Array.isArray(note.durations)||note.durations.length!==note.pitches.length||!note.durations.every(length=>Number.isInteger(length)&&length>=1&&length<=16-note.step%16))) throw new Error('durations muss für jeden Riffton eine gültige Länge bis zum Taktende enthalten.');
    if(note.articulations!==undefined && (!Array.isArray(note.articulations)||note.articulations.length!==note.pitches.length||!note.articulations.every(value=>['open','mute'].includes(value)))) throw new Error('articulations muss pro Riffton open oder mute enthalten.');
    if (positions.has(note.step)) throw new Error('Fasse gleichzeitig gespielte Rifftöne in einem pitches-Feld zusammen.');
    positions.add(note.step);
    const pitches = note.pitches.toSorted((a, b) => a - b);
    const voicing = findRiffVoicing(pitches, [],null,tunings);
    if (!voicing) throw new Error(`Der Griff in Takt ${Math.floor(note.step / stepsPerBar) + 1}, Schritt ${note.step % stepsPerBar + 1} ist in Drop D nicht spielbar.`);
    bars[Math.floor(note.step / stepsPerBar)].push({step: note.step % stepsPerBar, tuning:context.tuning??'dropd', root: pitches[0], length: note.duration, articulation: note.articulation, voicing, voiceTechniques: readRiffTechniques(note.techniques,pitches),...(note.durations?{voiceEdits:Object.fromEntries(note.pitches.map((pitch,i)=>[pitch,[[0,note.durations[i]]]]))}:{}),...(note.articulations?{voiceArticulations:Object.fromEntries(note.pitches.map((pitch,i)=>[pitch,note.articulations[i]]))}:{})});
  }
  const result=normalizeRiffVoices(bars.map(notes => notes.sort((a,b)=>a.step-b.step)));
  let decorated=result;
  for(const [bar,notes] of result.entries()) for(const note of notes) for(const [pitch,technique] of Object.entries(note.voiceTechniques??{})) {
    const next=setRiffTechnique(decorated,bar,note.step,Number(pitch),technique.type);
    if(!next) throw new Error('Eine Riff-Spieltechnik passt nicht zur Saite oder zum vorherigen Ton.');
    decorated=next;
  }
  return decorated;
}

function readChatDrums(value, count = selected.guitar.length) {
  const steps = count * stepsPerBar;
  const hits = value?.hits;
  if (!Array.isArray(hits) || !hits.length || hits.length > steps * drumVoices.length) throw new Error('Die Antwort muss eine Liste mit Drum-Schlägen enthalten.');
  const bars = Array.from({length: count}, () => Array.from({length: stepsPerBar}, () => []));
  for (const hit of hits) {
    if (!hit || !Number.isInteger(hit.step) || hit.step < 0 || hit.step >= steps || typeof hit.kind !== 'string' || !Object.hasOwn(drumVoice, hit.kind)
        || (hit.velocity !== undefined && (!Number.isFinite(hit.velocity) || hit.velocity <= 0 || hit.velocity > 1))) {
      throw new Error('Ein Drum-Schlag hat einen ungültigen Schritt, ein unbekanntes Instrument oder eine ungültige Lautstärke.');
    }
    const step = bars[Math.floor(hit.step / stepsPerBar)][hit.step % stepsPerBar];
    if (step.some(other => other.kind === hit.kind)) throw new Error('Ein Drum-Instrument kommt im selben Schritt doppelt vor.');
    step.push({kind: hit.kind, velocity: hit.velocity ?? drumVoice[hit.kind].velocity});
  }
  return bars;
}

async function copyChatTrackPrompt() {
  const context = chatTrackContext(chatPart);
  const prompt = get('ai-prompt');
  aiPromptContext = context;
  prompt.value = chatTrackPrompt(context, get('ai-description').value);
  const preview = get('ai-prompt-preview');
  preview.hidden = false;
  try {
    await navigator.clipboard.writeText(prompt.value);
    get('ai-dialog-status').textContent = 'Anfrage kopiert. Öffne ChatGPT und füge sie in einen Chat ein.';
  } catch {
    preview.open = true;
    prompt.focus();
    prompt.select();
    get('ai-dialog-status').textContent = 'Kopiere den markierten Text und füge ihn in deinen ChatGPT-Chat ein.';
  }
}

function importChatTrack(event) {
  event.preventDefault();
  if (get(`open-ai-${chatPart}`).disabled || get(`open-ai-${chatPart}`).hidden) return;
  const context = chatTrackContext(chatPart);
  try {
    if (aiPromptContext && Object.keys(context).some(key => aiPromptContext[key] !== context[key])) {
      throw new Error('Dein Loop oder Stil hat sich geändert. Kopiere eine neue Anfrage für die aktuellen Einstellungen.');
    }
    const value = readChatJson(get('ai-response').value);
    const base = {...selected};
    const beforeMeta = comparisonMeta();
    const candidate = {...base};
    const afterMeta = {...beforeMeta};
    if (chatPart === 'section') {
      const guitar = readChatRiff(value?.riff, context);
      const drums = readChatDrums(value?.drums, context.bars);
      const lead = aiMelodyBars(readChatMelody(value?.melody, context), context.bars);
      const bass = context.hasBass || value?.bass ? readChatBass(value?.bass, context) : null;
      const vocal=context.hasVocal||value?.vocal?readChatVocal(value?.vocal,context):null;
      saveSection();
      const part = {id: ++sectionSerial, name: context.sectionType, type: context.sectionType,
        pattern: {...selected, mode: 'riff', guitar, drums, lead, bass, vocal},
        meta: {...beforeMeta, mode: 'riff', preset: null, polyphonicRiff: false, melodyEdited: true,
          guitarName: 'ChatGPT-Riff', grooveName: 'ChatGPT-Drums', vocalName:vocal?'ChatGPT-Gesang':'Optional',vocalRange:context.vocalRange, bassName: bass ? 'ChatGPT-Bass' : 'Optional', style: config.style, melodyStyle: config.melodyStyle, groove, leadTake, muteLead: false}};
      songParts.splice(songParts.findIndex(part => part.id === context.sourceId) + 1, 0, part);
      get('ai-melody-dialog').close();
      get('ai-response').value = '';
      aiPromptContext = null;
      openSection(part.id);
      get('ai-status').textContent = `${part.name} mit ${context.bars} Takten hinzugefügt. Dein bisheriger Teil bleibt erhalten.`;
      return restartGeneratedPlayback();
    }
    if(chatPart==='vocal') {
      candidate.vocal=readChatVocal(value,context);afterMeta.vocalName='ChatGPT-Gesang';afterMeta.vocalRange=context.vocalRange;
    } else if (chatPart === 'bass') {
      candidate.bass = readChatBass(value, context);
      afterMeta.bassName = 'ChatGPT-Bass';
      afterMeta.bassStyle = context.bassStyle;
    } else if (chatPart === 'arrangement') {
      const guitar = readChatRiff(value?.riff, context);
      const drums = readChatDrums(value?.drums);
      const lead = aiMelodyBars(readChatMelody(value?.melody, context));
      Object.assign(candidate, {mode: 'riff', guitar, drums, lead});
      candidate.bass = context.hasBass || value?.bass ? readChatBass(value?.bass, context) : null;
      if (candidate.bass) afterMeta.bassName = 'ChatGPT-Bass';
      candidate.vocal=context.hasVocal||value?.vocal?readChatVocal(value?.vocal,context):null;
      if(candidate.vocal){afterMeta.vocalName='ChatGPT-Gesang';afterMeta.vocalRange=context.vocalRange;}
      Object.assign(afterMeta, {mode: 'riff', preset: null, polyphonicRiff: false, melodyEdited: true, guitarName: 'ChatGPT-Riff', grooveName: 'ChatGPT-Drums'});
      if (!base.lead) afterMeta.muteLead = false;
    } else if (chatPart === 'riff') {
      candidate.guitar = readChatRiff(value, context);
      Object.assign(afterMeta, {preset: null, polyphonicRiff: false, guitarName: 'ChatGPT-Riff'});
    }
    else if (chatPart === 'drums') {
      candidate.drums = readChatDrums(value);
      afterMeta.grooveName = 'ChatGPT-Drums';
    } else {
      const notes = readChatMelody(value, context);
      if (context.mode === 'melody') {
        candidate.guitar = aiMelodyBars(notes);
        afterMeta.guitarName = 'ChatGPT-Melodie';
      } else candidate.lead = aiMelodyBars(notes);
      afterMeta.melodyEdited = true;
      if (!base.lead && context.mode !== 'melody') afterMeta.muteLead = false;
    }
    chatComparison = {base, candidate, beforeMeta, afterMeta, part: chatPart, active: 'before'};
    renderComparison();
    get('ai-melody-dialog').close();
    get('ai-response').value = '';
    get('ai-status').textContent = `ChatGPT-${chatPartLabels[chatPart]} bereit zum Vergleichen.`;
    get('ai-after').focus();
    aiPromptContext = null;
  } catch (error) {
    get('ai-dialog-status').textContent = error.message;
  }
}

function comparisonMeta() {
  return {tuning:config.tuning??'dropd',composeSettings:structuredClone(composeSettings),guitarName, grooveName, preset, polyphonicRiff, melodyEdited, mode: config.mode,stonerStyle:config.stonerStyle, bassName, bassStyle, vocalName,vocalRange, muteLead: get('mute-lead').checked};
}

function renderComparison() {
  get('ai-comparison').hidden = !chatComparison;
  renderHistoryButtons();
  if (!chatComparison) return;
  const {active, part} = chatComparison;
  get('ai-comparison-title').textContent = `${chatPartLabels[part]} vergleichen`;
  get('ai-comparison-status').textContent = active === 'before'
    ? 'Bisherige Version ausgewählt. Die neue Version ist noch nicht übernommen.'
    : 'Neue Version zur Vorschau ausgewählt. Übernehmen oder verwerfen.';
  get('ai-before').setAttribute('aria-pressed', active === 'before');
  get('ai-after').setAttribute('aria-pressed', active === 'after');
}

function selectComparison(version) {
  if (!chatComparison) return;
  const meta = version === 'after' ? chatComparison.afterMeta : chatComparison.beforeMeta;
  ({guitarName, grooveName, preset, polyphonicRiff, melodyEdited, bassName, bassStyle,vocalName,vocalRange} = meta);
  config.mode = meta.mode;
  get('mode').value = meta.mode;
  get('mute-lead').checked = meta.muteLead;
  chatComparison.active = version;
  refresh(version === 'after' ? chatComparison.candidate : chatComparison.base,
    {guitar: true, drums: true, lead: true, bass: true, vocal:true, keepLead: true, comparisonChange: true});
  applyVolume();
  renderComparison();
}

function finishComparison(adopt) {
  if (!chatComparison) return;
  const adoptedPart=chatComparison.part;
  selectComparison(adopt ? 'after' : 'before');
  chatComparison = null;
  saveSection();
  renderSong();
  renderComparison();
  get('ai-status').textContent = adopt ? 'Neue Version übernommen.' : 'Neue Version verworfen. Bisherige Version wiederhergestellt.';
  if(adopt){if(adoptedPart==='bass'&&bassStyle!==composeSettings.bass.bass.mode){composeSettings={...composeSettings,bass:{...composeSettings.bass,bass:{...composeSettings.bass.bass,mode:bassStyle}}};saveSection();renderBassBlocks();}return restartGeneratedPlayback();}
}

function endComparison() {
  if (!chatComparison) return;
  chatComparison = null;
  saveSection();
  renderComparison();
  get('ai-status').textContent = 'Vergleich beendet. Die ausgewählte Version bleibt erhalten.';
}

function setStatus(text) {
  if (get('status').textContent !== text) get('status').textContent = text;
}

function updateTransportStatus() {
  if(playback.loopBar!=null){setStatus(`Läuft · Takt ${playback.loopBar+1} als Loop${playback.soloTrack?' · Nur '+editorTracks[playback.soloTrack].name:''}`);return;}
  if (playback.song) {
    const part = playback.song[playback.songIndex];
    setStatus(`Song · ${part.name}`);
    return;
  }
  setStatus(playback.active !== selected ? 'Wechsel vorgemerkt' : playback.soloTrack ? `Läuft · Nur ${editorTracks[playback.soloTrack].name}` : 'Läuft');
}

function refresh(pattern, {guitar = false, drums = false, lead = false, bass = false, vocal = false, keepLead = false, comparisonChange = false} = {}) {
  if (!comparisonChange) endComparison();
  const previous = selected;
  const count = comparisonChange ? pattern.guitar.length : selected.guitar.length;
  pattern = {...pattern};
  for (const track of ['guitar', 'drums', 'lead', 'bass', 'vocal']) if (pattern[track]) pattern[track] = fitBars(pattern[track], count);
  if(pattern.guitar && (pattern.mode??selected.mode)==='riff') pattern.guitar=sanitizeRiffTechniques(normalizeRiffVoices(pattern.guitar));
  selected = {...selected, ...pattern};
  if (selected.guitar.length !== previous.guitar.length) renderBarPickers();
  renderControls();
  if (guitar) {
    renderTabs('tabs', selected.guitar);
    renderRiffGrid();
    if (playback) prepareMainTrack(selected);
  }
  if ((lead || guitar) && selected.lead) {
    renderTabs('lead-tabs', selected.lead);
    if (playback) prepareLead(selected.lead);
  }
  if (bass) renderBassGrid();
  if(vocal) renderVocalGrid();
  if (drums) renderGrid();
  if (pattern.drums && !guitar && Object.values(drumGuides.riff).some(Boolean)) renderRiffGrid();
  if (pattern.drums && !(guitar || lead) && Object.values(drumGuides.melody).some(Boolean)) renderMelodyGrid();
  if (guitar || lead) renderMelodyGrid();
  if (guitar || pattern.drums || lead || bass || vocal) renderTimeline(selected);
  saveSection();
  renderSong();
  renderGridPosition();
  if (playback) updateTransportStatus();
}

function prepareMainTrack(pattern) {
  if (pattern.mode === 'melody') {
    prepareLead(pattern.guitar);
    return;
  }
  for (const notes of pattern.guitar) {
    for (const note of notes) {
      for (const pitch of guitarPitches(note)) {
        sound.string(pitch, riffVoiceArticulation(note,pitch) === 'mute', 0);
        sound.string(pitch, riffVoiceArticulation(note,pitch) === 'mute', 1);
      }
    }
  }
}

function prepareLead(bars) {
  for (const notes of bars) for (const note of notes) sound.string(note.root, false, 0);
}

function schedule() {
  const now = sound.context.currentTime;
  if (playback.endTime !== undefined) {
    if (now >= playback.endTime) {
      stop();
      get('song-status').textContent = 'Song vollständig abgespielt.';
    }
    return;
  }
  if (playback.nextTime < now - .18) {
    sound.stop();
    playback.nextTime = now + .08;
    playback.step = (playback.loopBar??0)*stepsPerBar;
    playback.visual.length = 0;
    applyVolume();
  }
  while (playback.nextTime < now + .12) {
    if (playback.step === (playback.loopBar??0)*stepsPerBar) {
      playback.scheduled = playback.song ? playback.song[playback.songIndex].pattern : selected;
      playback.riffAttacks = playback.scheduled.mode === 'riff' ? playback.scheduled.guitar.map(riffAttacks) : null;
      sound.setLeadTone(currentLeadTone());sound.setVocalTone(currentVocalTone());
    }
    const pattern = playback.scheduled;
    const stepDuration = 15 / pattern.tempo;
    const bar = Math.floor(playback.step / stepsPerBar);
    const step = playback.step % stepsPerBar;
    const time = Math.max(playback.nextTime, now + .005);
    const loopNote=bars=>{
      let note=bars?.[bar].find(note=>note.step===step);
      if(!note&&step===0&&playback.loopBar!=null){
        const start=bar*16;
        for(let b=0;b<bar;b++)for(const held of bars?.[b]??[])if(b*16+held.step+held.length>start)note={...held,length:b*16+held.step+held.length-start};
      }
      return note&&playback.loopBar!=null?{...note,length:Math.min(note.length,16-step)}:note;
    };
    for (const hit of pattern.drums[bar][step]) {
      const voice = drumVoice[hit.kind];
      sound.drum(time + voice.delay + Math.random() * .005, hit.kind, hit.velocity * (.94 + Math.random() * .12));
    }
    const note = pattern.mode==='melody'?loopNote(pattern.guitar):pattern.guitar[bar].find(note => note.step === step);
    const voices = playback.riffAttacks?.[bar].filter(voice => voice.step === step);
    if (voices?.length) sound.guitar(time, voices, stepDuration, step === 0 ? .91 : .77);
    if (note && pattern.mode === 'melody') sound.lead(time, note, stepDuration);
    const bass = loopNote(pattern.bass);
    if (bass) sound.bass(time, bass, stepDuration);
    const vocal=loopNote(pattern.vocal);
    if(vocal) sound.vocal(time,vocal,stepDuration);
    const lead = loopNote(pattern.lead);
    if (lead) sound.lead(time + .01, lead, stepDuration);
    playback.visual.push({pattern, time, bar, step, songIndex: playback.songIndex});
    if (playback.visual.length > stepsPerBar) playback.visual.shift();
    playback.step = playback.loopBar!=null ? playback.loopBar*16+(step+1)%16 : (playback.step + 1) % (pattern.guitar.length * stepsPerBar);
    playback.nextTime += stepDuration;
    if (playback.song && playback.step === 0) {
      if (playback.songIndex === playback.song.length - 1) {
        playback.endTime = playback.nextTime;
        break;
      }
      playback.songIndex++;
    }
  }
}

function animate() {
  if (!playback) return;
  let visible;
  while (playback.visual[0]?.time <= sound.context.currentTime) visible = playback.visual.shift();
  if (visible) {
    playback.position = visible;
    renderGridPosition(visible);
    if (playback.song) {
      const part = playback.song[visible.songIndex];
      setStatus(`Song · ${part.name}`);
      get('song-status').textContent = `Spielt ${visible.songIndex + 1}/${playback.song.length}: ${part.name} · Takt ${visible.bar + 1}/${visible.pattern.guitar.length}`;
      renderSongPlayback();
      for (const card of get('song-parts').children) card.classList.toggle('playing', Number(card.children[0].dataset.section) === part.id);
    }
    if (visible.pattern !== playback.active) {
      playback.active = visible.pattern;
      if (!playback.song) updateTransportStatus();
    }
    timeline.querySelectorAll('.active').forEach(node => node.classList.remove('active'));
    const block = timeline.children[visible.bar];
    if ((!playback.song || playback.song[visible.songIndex].id === activeSection) && block) {
      block.classList.add('active');
      block.querySelector('.steps').children[visible.step].classList.add('active');
      block.querySelector('.lead-steps')?.children[visible.step].classList.add('active');
      block.querySelector('.bass-steps')?.children[visible.step].classList.add('active');
      block.querySelector('.vocal-steps')?.children[visible.step].classList.add('active');
      block.querySelector('.beats').children[visible.step].classList.add('active');
    }
    get('counter').textContent = `${String(visible.bar + 1).padStart(2, '0')} / ${String(visible.pattern.guitar.length).padStart(2, '0')}`;
  }
  playback.frame = requestAnimationFrame(animate);
}

function isMixerMuted(channel) {
  return channel === 'lead-volume' ? Boolean(get('mute-lead').checked) : mixerMutes.has(channel);
}

function currentLeadTone(){
  const part=playback?.song?.[playback.songIndex];
  return part&&part.id!==activeSection ? part.meta?.composeSettings?.melody?.sound??'riff' : composeSettings.melody.sound??'riff';
}

function applyVolume() {
  if (!sound || !playback) return;
  sound.setLeadTone(currentLeadTone());sound.setVocalTone(currentVocalTone());
  const level = id => {
    const muted = id !== 'volume' && playback.soloTrack
      ? editorTracks[playback.soloTrack].channel !== id : isMixerMuted(id);
    return muted ? 0 : (Number(get(id).value) / 100) ** 1.4;
  };
  sound.setVolume(level('volume'));
  sound.setTrackLevels(level('guitar-volume'), level('drum-volume'), level('lead-volume'), level('bass-volume'),level('vocal-volume'));
}

function stop() {
  clearInterval(playback.timer);
  cancelAnimationFrame(playback.frame);
  playback = null;
  sound.stop();
  get('play-label').textContent = 'Teil als Loop abspielen';
  get('play-icon').textContent = '▶';
  get('play-song').textContent = 'Ganzen Song abspielen';
  get('counter').textContent = `01 / ${String(selected.guitar.length).padStart(2, '0')}`;
  setStatus('Bereit');
  renderTimeline(selected);
  renderSong();
  renderEditorTransport();
  renderGridPosition();
}

// New compositions audition the opened section from bar one, with Solo cleared.
// A second generation during audio initialization requests another fresh start.
let generatedRestartPending=false;
async function restartGeneratedPlayback(){
  if(playButton.disabled){generatedRestartPending=true;return;}
  if(playback)stop();
  await togglePlayback();
}

async function togglePlayback(wholeSong = false, soloTrack = null) {
  if (playback) {
    stop();
    return;
  }
  playButton.disabled = true;
  get('play-song').disabled = true;
  renderEditorTransport();
  setStatus('Audio wird vorbereitet');
  try {
    sound ??= new LoopSound();
    await sound.context.resume();
    prepareMainTrack(selected);
    if (selected.bass) prepareBass(selected.bass);
    if (selected.lead) prepareLead(selected.lead);
    saveSection();
    const song = wholeSong ? songParts.map(part => ({...part, pattern: part.pattern})) : null;
    if (song) for (const part of song) {
      prepareMainTrack(part.pattern);
      if (part.pattern.bass) prepareBass(part.pattern.bass);
      if (part.pattern.lead) prepareLead(part.pattern.lead);
    }
    for (const voice of drumVoices) {
      for (let take = 0; take < 3; take++) sound.drumSample(voice.id, take);
    }
    playback = {nextTime: sound.context.currentTime + .09, step: 0, active: selected, scheduled: selected, visual: [], song, songIndex: 0, soloTrack};
    applyVolume();
    renderTimeline(selected);
    schedule();
    playback.timer = setInterval(schedule, 25);
    animate();
    get('play-label').textContent = 'Stopp';
    get('play-icon').textContent = '■';
    get('play-song').textContent = 'Stopp';
    updateTransportStatus();
  } catch (error) {
    if (playback) stop();
    console.error(error);
    setStatus('Audio konnte nicht gestartet werden');
  } finally {
    playButton.disabled = false;
    get('play-song').disabled = false;
    renderEditorTransport();
    if(generatedRestartPending){generatedRestartPending=false;return restartGeneratedPlayback();}
  }
}

playButton.addEventListener('click', () => togglePlayback());
get('play-song').addEventListener('click', () => togglePlayback(true));
for (const channel of mixerChannels) {
  get(channel).addEventListener('input', applyVolume);
  get(`${channel}-mute`).addEventListener('click', () => {
    toggleMixerMute(channel);
  });
}
for (const track of Object.keys(editorTracks)) {
  get(`${track}-undo`).addEventListener('click', () => restoreTrackHistory(track));
  get(`${track}-redo`).addEventListener('click', () => restoreTrackHistory(track, true));
  get(`${track}-play`).addEventListener('click', () => { if (!playButton.disabled) return togglePlayback(); });
  get(`${track}-solo`).addEventListener('click', () => toggleEditorSolo(track));
  get(`heading-${track}-solo`).addEventListener('click', () => toggleEditorSolo(track));
}
get('mute-lead').addEventListener('change', () => {
  renderControls();
  applyVolume();
});
get('lock-guitar').addEventListener('change', () => { endComparison(); renderControls(); renderTimeline(selected); renderRiffGrid(); renderMelodyGrid(); });
get('lock-drums').addEventListener('change', () => { endComparison(); renderControls(); renderGrid(); });
timeline.addEventListener('click', event => {
  const button = event.target.closest('button.attack');
  if (!button || get('lock-guitar').checked) return;
  const bar = Number(button.dataset.bar);
  const step = Number(button.dataset.step);
  const guitar = selected.guitar.slice();
  guitar[bar] = guitar[bar].map(note => note.step === step
    ? {...note, articulation: note.articulation === 'mute' ? 'open' : 'mute', voiceArticulations: Object.fromEntries(guitarPitches(note).map(pitch=>[pitch,note.articulation==='mute'?'open':'mute']))}
    : note);
  preset = null;
  guitarName = 'Bearbeitetes Riff';
  refresh({guitar}, {guitar: true});
  timeline.children[bar].querySelector('.steps').children[Number(button.dataset.column ?? step)].focus({preventScroll: true});
});
function changeSongSetting(id,value) {
  endComparison();saveSection();
  config[id]=value;
  // Song settings affect every section, never invoke a composer or replace notes.
  for(const part of songParts){part.pattern={...part.pattern,[id]:value};if(part.meta&&id==='style')part.meta.style=value;}
  refresh({[id]:value},{guitar:true,drums:true,lead:true,bass:true,vocal:true,keepLead:true});
}
for(const id of ['style','key','scale'])get(id).addEventListener('change',event=>changeSongSetting(id,id==='key'?Number(event.target.value):event.target.value));
get('tempo').addEventListener('change',event=>{
 const tempo=Number(event.target.value);
 if(Number.isFinite(tempo)&&tempo>=55&&tempo<=210)changeSongSetting('tempo',Math.round(tempo));
 event.target.value=config.tempo;
});
get('export').addEventListener('click', () => downloadMidi(selected));
for (const part of ['guitar', 'drums', 'lead', 'bass', 'vocal']) {
  get(`export-${part}`).addEventListener('click', () => downloadMidi(selected, part));
}

get('bar-picker').addEventListener('click', event => {
  const button = event.target.closest('button[data-bar]');
  if (!button) return;
  editedBar = Number(button.dataset.bar);
  renderGrid();
});
get('riff-bar-picker').addEventListener('click', event => {
  const button = event.target.closest('button[data-bar]');
  if (!button) return;
  riffBar = Number(button.dataset.bar);
  renderRiffGrid();
});
get('riff-grid').addEventListener('click', event => {
  if (suppressGridClick) return;
  const cell = event.target.closest('button[data-pitch]');
  if (!cell || cell.disabled || config.mode !== 'riff') return;
  const pitch = Number(cell.dataset.pitch);
  const step = Number(cell.dataset.step);
  const bar = Number(cell.dataset.bar);
  if (cell.dataset.noteStep !== undefined) {
    riffSelection={bar,step:Number(cell.dataset.noteStep),pitch,offset:Number(cell.dataset.offset??0)};
    renderRiffGrid();
    return;
  }
  const guitar = cell.dataset.noteStep === undefined
    ? editRiffPitch(selected.guitar, bar, step, pitch, 'open')
    : editRiffSpan(selected.guitar, bar, Number(cell.dataset.noteStep), pitch, Number(cell.dataset.offset), {remove: true});
  if (!guitar) {
    get('riff-edit-status').textContent = 'Diese Töne ergeben zusammen keinen spielbaren Drop-D-Griff. Entferne zuerst einen Ton.';
    return;
  }
  if(guitar) riffSelection={bar,step,pitch,offset:0};
  commitRiff(guitar);
  focusGridPitch(get('riff-grid'), pitch, bar, step);
});
get('melody-bar-picker').addEventListener('click', event => {
  const button = event.target.closest('button[data-bar]');
  if (!button) return;
  melodyBar = Number(button.dataset.bar);
  renderMelodyGrid();
});
get('melody-tools').addEventListener('click', event => {
  const button = event.target.closest('button[data-tool]');
  if (!button) return;
  setMelodyTool(melodyTool === button.dataset.tool ? '' : button.dataset.tool);
});
get('melody-grid').addEventListener('click', event => {
  if (suppressGridClick) return;
  const cell = event.target.closest('button[data-pitch]');
  if (!cell || cell.disabled) return;
  const pitch = Number(cell.dataset.pitch);
  const step = Number(cell.dataset.step);
  const bar = Number(cell.dataset.bar);
  const source = melodySource() ?? selected.guitar.map(() => []);
  const occupied = cell.dataset.noteBar !== undefined;
  const noteBar = occupied ? Number(cell.dataset.noteBar) : bar;
  const noteStep = occupied ? Number(cell.dataset.noteStep) : step;
  const length = Number(get('melody-length').value) || 0;
  if (melodyTool && !occupied) {
    setMelodyTool(melodyTool, 'Klicke auf einen lila Ton, um das Werkzeug anzuwenden.');
    return;
  }
  const melody = melodyTool && melodyTool !== 'length'
    ? setMelodyTechnique(source, noteBar, noteStep, melodyTool)
    : editMelodyNote(source, noteBar, noteStep, pitch, {length, resize: melodyTool === 'length'});
  if (!melody) {
    setMelodyTool(melodyTool, melodyTool==='pull'?'Für einen Pull-off braucht der Ton einen vorherigen Ton, der ein bis vier Halbtöne höher liegt.':'Für einen Hammer-on braucht der Ton einen vorherigen Ton, der ein bis vier Halbtöne tiefer liegt.');
    return;
  }
  if (melodyTool) setMelodyTool('', 'Änderung auf diesen Ton angewendet.');
  commitMelody(melody);
  focusGridPitch(get('melody-grid'), pitch, bar, step);
});
function bindNoteGrid({id, source, render, resize, cut, commit, canDrag}) {
  const grid = get(id);
  const getNoteCell = event => {
    const cell = event.target.closest('button[data-note-bar]');
    return cell && !cell.disabled && cell.dataset.noteBar !== undefined ? cell : null;
  };
  const cellData = cell => ({
    pitch: Number(cell.dataset.pitch), origin: Number(cell.dataset.step), viewBar: Number(cell.dataset.bar),
    bar: Number(cell.dataset.noteBar), step: Number(cell.dataset.noteStep), offset: Number(cell.dataset.offset ?? 0),
  });
  const refocus = ({pitch, origin, viewBar}) => focusGridPitch(grid, pitch, viewBar, origin);
  grid.addEventListener('contextmenu', event => {
    const cell = getNoteCell(event);
    if (!cell) return;
    event.preventDefault();
    const note = cellData(cell);
    commit(cut(source(), note, note.viewBar));
    refocus(note);
  });
  grid.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.pointerType === 'touch' || (canDrag && !canDrag())) return;
    const cell = getNoteCell(event);
    if (!cell) return;
    const row = cell.parentElement;
    const firstCell = row.children[1];
    const columns = row.children.length - 1;
    const first = firstCell.getBoundingClientRect();
    const last = row.children[columns].getBoundingClientRect();
    noteDrag = {
      grid, id: event.pointerId, startX: event.clientX, left: first.left, width: (last.right - first.left) / columns,
      columns, firstBar: Number(firstCell.dataset.bar),
      source: source(), note: cellData(cell), preview: null, column: null,
    };
  });
  grid.addEventListener('pointermove', event => {
    const drag = noteDrag;
    if (!drag || drag.grid !== grid || drag.id !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      noteDrag = null;
      if (drag.preview) render();
      return;
    }
    if (!drag.preview && Math.abs(event.clientX - drag.startX) < 4) return;
    if (!drag.preview) grid.setPointerCapture(event.pointerId);
    const column = Math.max(0, Math.min(drag.columns - 1, Math.floor((event.clientX - drag.left) / drag.width)));
    if (column === drag.column) return;
    drag.column = column;
    const bar = drag.firstBar + Math.floor(column / stepsPerBar);
    drag.preview = resize(drag.source, drag.note, bar, column % stepsPerBar + 1);
    render(drag.preview);
  });
  grid.addEventListener('pointerup', event => {
    const drag = noteDrag;
    if (!drag || drag.grid !== grid || drag.id !== event.pointerId) return;
    noteDrag = null;
    if (!drag.preview) return;
    suppressGridClick = true;
    setTimeout(() => { suppressGridClick = false; }, 0);
    commit(drag.preview);
    refocus(drag.note);
  });
  grid.addEventListener('pointercancel', () => {
    if (noteDrag?.grid !== grid) return;
    if (noteDrag.preview) render();
    noteDrag = null;
  });
}

bindNoteGrid({
  id: 'melody-grid', source: melodySource, render: renderMelodyGrid, commit: commitMelody,
  canDrag: () => !melodyTool,
  resize: (bars, {bar, step, pitch}, current, end) => editMelodyNote(bars, bar, step, pitch, {
    length: Math.max(1, (current - bar) * stepsPerBar + end - step), resize: true,
  }),
  cut: (bars, {bar, step, origin}, current) => cutMelodyStep(bars, bar, step, current * stepsPerBar + origin),
});
bindNoteGrid({
  id: 'riff-grid', source: () => selected.guitar, render: renderRiffGrid, commit: commitRiff,
  resize: (bars, {bar, step, pitch, offset}, current, end) => editRiffSpan(bars, bar, step, pitch, offset, {
    end: current > bar ? stepsPerBar : current < bar ? 1 : end,
  }),
  cut: (bars, {bar, step, pitch, offset, origin}) => editRiffSpan(bars, bar, step, pitch, offset, {cut: origin}),
});
get('drum-grid').addEventListener('click', event => {
  const cell = event.target.closest('button[data-voice]');
  if (!cell) return;
  const step = Number(cell.dataset.step);
  const barIndex = Number(cell.dataset.bar);
  const kind = cell.dataset.voice;
  const drums = selected.drums.slice();
  const bar = drums[barIndex].slice();
  const hits = bar[step];
  const present = hits.some(hit => hit.kind === kind);
  bar[step] = present ? hits.filter(hit => hit.kind !== kind) : [...hits, {kind, velocity: drumVoice[kind].velocity}];
  drums[barIndex] = bar;
  cell.setAttribute('aria-pressed', !present);
  grooveName = 'Bearbeitet';
  refresh({drums});
});

keyNames.forEach((name, index) => {
  const option = element('option', '', name);
  option.value = index;
  get('key').append(option);
});
get('key').value = config.key;
renderBarPickers();
saveSection();
renderSong();
renderControls();
renderTimeline(selected);
renderTabs('tabs', selected.guitar);
renderBassGrid();
renderGrid();
renderRiffGrid();
renderMelodyGrid();
for (const [part, label] of Object.entries(chatPartLabels)) {
  get(`open-ai-${part}`).addEventListener('click', () => {
    if (chatPart !== part) {
      aiPromptContext = null;
      get('ai-description').value = '';
      get('ai-response').value = '';
      get('ai-prompt-preview').hidden = true;
      get('ai-prompt-preview').open = false;
    }
    endComparison();
    chatPart = part;
    get('ai-dialog-title').textContent = `${label} mit ChatGPT`;
    get('ai-section-fields').hidden = part !== 'section';
    get('ai-bass-fields').hidden = part !== 'bass';
    get('ai-vocal-fields').hidden=part!=='vocal';
    if(part==='vocal') get('ai-vocal-range').value=vocalRange;
    if (part === 'bass') get('ai-bass-style').value = bassStyle;
    get('ai-import').textContent = part === 'section' ? 'Songteil hinzufügen' : `${label} vergleichen`;
    get('ai-dialog-status').textContent = '';
    get('ai-dialog-help').textContent = part === 'section'
      ? 'Wähle Songteil und Länge. Kopiere die Anfrage in deinen ChatGPT-Chat und füge die Antwort hier ein. Der neue Teil wird hinter dem geöffneten Teil ergänzt.'
      : part === 'arrangement'
      ? 'Kopiere die Anfrage in deinen ChatGPT-Chat. Danach kannst du bisheriges und neues Arrangement anhören und vergleichen.'
      : 'Kopiere die Anfrage mit deinen Einstellungen und den passenden Begleitspuren. Füge sie in deinen eigenen ChatGPT-Chat ein.';
    get('ai-description').placeholder = {
      melody: 'Zum Beispiel: düsterer Aufbau, lange Töne und ein kräftiges Bending am Schluss.',
      riff: 'Zum Beispiel: schweres Stoner-Riff mit Palm Mutes und offenen Akkorden am Taktende.',
      drums: 'Zum Beispiel: schwerer Halftime-Groove mit offenen Hi-Hats und einem Tom-Fill.',
      arrangement: 'Zum Beispiel: schweres Stoner-Riff, langsame Lead-Melodie und ein Halftime-Groove mit Tom-Fill.',
      section: 'Zum Beispiel: ruhigere Bridge mit langen Tönen, dann ein druckvoller Übergang.',
      vocal: 'Zum Beispiel: tiefe, ruhige Stoner-Gesangslinie mit einem wiederkehrenden Motiv und Atempausen.',
      bass: 'Zum Beispiel: tiefer Stoner-Bass, leicht angezerrt, mit der Kick verzahnt und einem kleinen Lauf am Ende.',
    }[part];
    const context = chatTrackContext(part);
    get('ai-context').textContent = `${keyNames[context.key]}-${scaleNames[context.scale]} · ${context.tempo} BPM · ${chatStyleName(context)}`;
    get('ai-melody-dialog').showModal();
    get('ai-description').focus();
  });
}
get('ai-cancel').addEventListener('click', () => get('ai-melody-dialog').close());
get('ai-copy').addEventListener('click', copyChatTrackPrompt);
get('ai-melody-form').addEventListener('submit', importChatTrack);

for (const [id, version] of [['ai-before', 'before'], ['ai-after', 'after']]) {
  get(id).addEventListener('click', () => {
    selectComparison(version);
    if (!playback && !playButton.disabled) togglePlayback();
  });
}
get('ai-adopt').addEventListener('click', () => finishComparison(true));
get('ai-discard').addEventListener('click', () => finishComparison(false));

get('song-parts').addEventListener('click', async event => {
  const button = event.target.closest('button[data-section]');
  if (!button || playButton.disabled) return;
  const id = Number(button.dataset.section);
  if(button.dataset.play){
    if(playback&&!playback.song&&activeSection===id){stop();return;}
    openSection(id);
    return togglePlayback();
  }
  if (!button.dataset.move) return openSection(id);
  if (playback) stop();
  endComparison(); saveSection();
  const from = songParts.findIndex(part => part.id === id);
  const to = from + (button.dataset.move === 'up' ? -1 : 1);
  if (from < 0 || to < 0 || to >= songParts.length) return;
  const [part] = songParts.splice(from, 1); songParts.splice(to, 0, part);
  renderSong();
  get('song-status').textContent = `${part.name} ist jetzt Teil ${to + 1}.`;
});
get('section-name').addEventListener('input', event => {
  const part = songParts.find(part => part.id === activeSection);
  part.name = event.target.value.trim().slice(0, 60) || part.type;
  renderSong(false);
  renderGridPosition();
});
for (const id of ['ai-section-type', 'ai-section-bars']) get(id).addEventListener('change', () => {
  get('ai-response').value = '';
  get('ai-prompt-preview').hidden = true;
  get('ai-dialog-status').textContent = 'Auswahl geändert. Kopiere eine neue Anfrage.';
});
renderGridPosition();
for (const track of ['riff', 'melody']) for (const kind of ['snare', 'kick']) {
  get(`${track}-guide-${kind}`).addEventListener('click', () => {
    drumGuides[track][kind] = !drumGuides[track][kind];
    renderDrumGuideButtons();
    if (track === 'riff') renderRiffGrid(); else renderMelodyGrid();
    renderGridPosition();
  });
}

function renderDrumGuideButtons() {
  for (const track of ['riff', 'melody']) for (const kind of ['snare', 'kick']) {
    get(`${track}-guide-${kind}`).setAttribute('aria-pressed', drumGuides[track][kind]);
  }
}

for (const articulation of ["open", "mute"]) get(`riff-articulation-${articulation}`).addEventListener("click", () => {
  if (get("lock-guitar").checked) return;
  applyRiffArticulation(articulation);
});
for (const track of ["guitar", "drums", "melody"]) get(`track-ai-${track}`).addEventListener("click", () => {
  const part = track === "guitar" ? config.mode === "riff" ? "riff" : "melody" : track;
  get(`open-ai-${part}`).click();
});
function prepareBass(bars) {
  for (const notes of bars) for (const note of notes) sound.string(note.root, false, 0);
}

function commitBass(bars, name = 'Bearbeiteter Bass') {
  bassName = name;
  if(bars&&composeSettings.bass.bass.tuning==='a5'){const old=selected.bass?.flat()??[];bars=bars.map(notes=>notes.map(n=>n.bassTuning||old.some(o=>o.step===n.step&&o.root===n.root&&o.length===n.length)?n:{...n,bassTuning:'a5'}));}
  refresh({bass: bars}, {bass: true});
}

function renderBassGrid(bars = selected.bass) {
  const grid = get('bass-grid');
  const columns = gridColumns(bassBar);
  renderScaleLegend('bass-key', ' · '+bassTunings[composeSettings.bass.bass.tuning].name);
  startGrid(grid, 'Ton', bassBar, columns);
  const held = Array(sectionSteps()).fill(null);
  bars?.forEach((notes,bar)=>notes.forEach(note=>{
    const start = bar * stepsPerBar + note.step;
    for(let at=start;at<Math.min(sectionSteps(),start+note.length);at++) held[at]={note,bar};
  }));
  const pitches = [...new Set([...bassPitches({...config,bassTuning:composeSettings.bass.bass.tuning}), ...(bars?.flat().map(note=>note.root) ?? [])])].sort((a,b)=>b-a);
  for (const pitch of pitches) {
    const name = `${keyNames[pitch%12]}${Math.floor(pitch/12)-1}`;
    const row = element('div','grid-row');
    if(pitchToneClass(pitch))row.classList.add(pitchToneClass(pitch));
    const label = element('span','drum-label',pitchCaption(pitch,name));label.title=pitchToneInfo(pitch).description || name;row.append(label);
    for (const {bar,step} of columns) {
      const playing = held[bar*stepsPerBar+step];
      const note = playing?.note.root===pitch ? playing.note : null;
      const onset = note && playing.bar===bar && note.step===step;
      const cell = element('button',`drum-cell bass-cell${step%4===0?' downbeat':''}${note&&!onset?' bass-hold':''}`);
      cell.type='button';cell.dataset.pitch=pitch;setGridCellPosition(cell,bar,step);
      if(note){cell.dataset.noteBar=playing.bar;cell.dataset.noteStep=note.step;}
      cell.setAttribute('aria-pressed',Boolean(onset));
      cell.setAttribute('aria-label',`${name}, Bass, Takt ${bar+1}, Schritt ${step+1}${note?', '+(onset?`Länge ${note.length} Sechzehntel`:'klingt weiter'):''}`);
      row.append(cell);
    }
    grid.append(row);
  }
  for(const button of get('bass-bar-picker').children)button.setAttribute('aria-pressed',Number(button.dataset.bar)===bassBar);
}

function readChatBass(value, context) {
  const notes = value?.notes;
  const count = context.bars;
  const limit = count*stepsPerBar;
  const pitches = bassPitches(context);
  if(!Array.isArray(notes)||!notes.length||notes.length>limit)throw new Error(`Der Bass muss 1 bis ${limit} Noten enthalten.`);
  const sorted=notes.map(note=>{
    if(!note||!Number.isInteger(note.step)||note.step<0||note.step>=limit||!pitches.includes(note.pitch)||!Number.isInteger(note.duration)||note.duration<1||note.duration>limit)throw new Error('Eine Bassnote passt nicht zur Tonart, zur gewählten Basslage oder zum Raster. Bitte ChatGPT, die Vorgaben einzuhalten.');
    return {...note};
  }).sort((a,b)=>a.step-b.step);
  const bars=Array.from({length:count},()=>[]);
  sorted.forEach((note,index)=>{
    const next=sorted[index+1]?.step??limit;
    if(next===note.step)throw new Error('Der Bass muss einstimmig sein; zwei Noten beginnen gleichzeitig.');
    bars[Math.floor(note.step/16)].push({step:note.step%16,root:note.pitch,length:Math.min(note.duration,next-note.step),articulation:'single',bassTuning:context.bassTuning??'dropd'});
  });
  return bars;
}

function chatBassPrompt(context, description) {
  const compact=(bars, riff=false)=>bars?.flatMap((notes,bar)=>(riff?riffAttacks(notes):notes).map(note=>[bar*16+note.step, riff?note.pitch:note.root,note.length]))??[];
  const drums=context.drums.flatMap((beats,bar)=>beats.flatMap((hits,step)=>hits.map(hit=>[bar*16+step,hit.kind])));
  const behavior={riff:'Folge den Grundtönen und wichtigen Anschlägen des Riffs. Spiele eine Oktave tiefer, ohne unnötige Verdopplungen in hoher Lage.',root:'Einfacher tragender Grundton-Groove, wenige Noten, bewusste Pausen und enger Bezug zur Kick.',independent:'Eigenständiges wiedererkennbares Bassmotiv mit Gegenbewegungen und kurzen Übergängen. Lasse Platz für Riff und Melodie.'}[effectiveBassMode(context.bassStyle,context.riff)];
  const style=(bassStyleProfiles[context.musicStyle]??bassStyleProfiles.stoner).description;
  return [`Komponiere eine neue Bassspur zu den vorhandenen Begleitspuren. Diese bleiben unverändert.`,`${context.bars} Takte, 4/4, ${context.tempo} BPM, Grundton ${keyNames[context.key]}, Tonart ${scaleNames[context.scale]}, Stil ${chatStyleName(context)}.`,style,behavior,`Klangwunsch: ${description.trim()||'Passend zum vorhandenen Arrangement.'}`,`Riff [Einsatz,MIDI-Ton,Länge]: ${JSON.stringify(compact(context.riff,true))}`,`Melodie [Einsatz,MIDI-Ton,Länge]: ${JSON.stringify(compact(context.melody))}`,`Drums [Einsatz,Instrument]: ${JSON.stringify(drums)}`,`Erlaubte MIDI-Tonhöhen: ${bassPitches(context).join(', ')}. step sind ganzzahlige Sechzehntelpositionen 0 bis ${context.bars*16-1}; duration ist eine positive ganze Zahl in Sechzehnteln. Einstimmig, keine doppelten Einsätze, Noten enden spätestens bei Schritt ${context.bars*16}. Antworte nur mit einem JSON-Codeblock.`,JSON.stringify({notes:[{step:0,pitch:bassPitches(context)[0],duration:4},{step:8,pitch:bassPitches(context)[2],duration:4}]})].join('\n');
}

get('bass-bar-picker').addEventListener('click',event=>{const button=event.target.closest('button[data-bar]');if(button){bassBar=Number(button.dataset.bar);renderBassGrid();renderGridPosition();}});
get('bass-grid').addEventListener('click',event=>{
  if(suppressGridClick)return;
  const cell=event.target.closest('button[data-pitch]');if(!cell)return;
  const bars=selected.bass??selected.guitar.map(()=>[]);
  const bar=Number(cell.dataset.noteBar??cell.dataset.bar),step=Number(cell.dataset.noteStep??cell.dataset.step),pitch=Number(cell.dataset.pitch);
  commitBass(editMelodyNote(bars,bar,step,pitch,{length:Number(get('bass-length').value)||4}));
});
bindNoteGrid({id:'bass-grid',source:()=>selected.bass,render:renderBassGrid,commit:commitBass,
  resize:(bars,{bar,step,pitch},current,end)=>editMelodyNote(bars,bar,step,pitch,{length:Math.max(1,(current-bar)*16+end-step),resize:true}),
  cut:(bars,{bar,step,origin},current)=>cutMelodyStep(bars,bar,step,current*16+origin)});
get('ai-bass-style').addEventListener('change',()=>{get('ai-response').value='';get('ai-prompt-preview').hidden=true;get('ai-dialog-status').textContent='Bass-Verhalten geändert. Kopiere eine neue Anfrage.';});

function renderTrackActions() {}

function renderTabView() {
  const tracks = {riff: selected.mode === 'riff' && selected.guitar.flat().length ? selected.guitar : null, melody: melodySource()?.flat().length ? melodySource() : null, bass: selected.bass?.flat().length ? selected.bass : null};
  const labels = {riff:'Riff', melody:'Melodie', bass:'Bass'};
  if (!tracks[tabTrack]) tabTrack = tracks.riff ? 'riff' : tracks.melody ? 'melody' : tracks.bass ? 'bass' : 'riff';
  for (const [track, bars] of Object.entries(tracks)) {
    const button = get('tab-' + track);
    button.disabled = !bars;
    button.textContent = labels[track] + (bars ? '' : ' · Noch keine Spur');
    button.setAttribute('aria-pressed', track === tabTrack);
  }
  get('riff-tabs-panel').hidden = tabTrack !== 'riff';
  get('lead-tabs-panel').hidden = tabTrack !== 'melody';
  get('bass-tabs-panel').hidden = tabTrack !== 'bass';
  get('tab-title').textContent = labels[tabTrack] + '-Tabs';
  get('tab-tuning').textContent = tabTrack === 'bass' ? 'Bass · '+bassTunings[selected.bass?.flat().some(n=>n.bassTuning==='a5'||n.root<26)?'a5':'dropd'].name : guitarTunings[selected.guitar.flat().some(n=>n.tuning==='a7')?'a7':'dropd'].name;
  get('lead-techniques').hidden = tabTrack !== 'melody';
  if (tracks.riff) renderTabs('tabs', tracks.riff);
  if (tracks.melody) renderTabs('lead-tabs', tracks.melody);
  if (tracks.bass) renderTabs('bass-tabs', tracks.bass, true);
}
for (const track of ['riff','melody','bass']) get('tab-' + track).addEventListener('click', () => {
  if (get('tab-' + track).disabled) return;
  tabTrack = track;
  renderTabView();
});

function readRiffTechniques(value,pitches) {
  if(value===undefined) return {};
  if(!Array.isArray(value)||value.length>pitches.length) throw new Error('Riff-Techniken müssen als Liste pro Ton angegeben sein.');
  const result={};
  for(const technique of value) {
    if(!technique||!pitches.includes(technique.pitch)||!['hammer','pull','bend-half','bend-whole'].includes(technique.type)||result[technique.pitch]) throw new Error('Ungültige oder doppelte Riff-Spieltechnik.');
    result[technique.pitch]={type:technique.type};
  }
  return result;
}
function renderRiffTools() {
  const note=riffSelection && selected.guitar[riffSelection.bar]?.find(note=>note.step===riffSelection.step);
  if(!note || !guitarPitches(note).includes(riffSelection.pitch)) riffSelection=null;
  const type=riffSelection ? note.voiceTechniques?.[riffSelection.pitch]?.type ?? 'normal' : '';
  for(const technique of Object.keys(riffTechniqueNames)) {
    const button=get('riff-tech-'+technique);
    button.disabled=!riffSelection||get('lock-guitar').checked;
    button.setAttribute('aria-pressed',type===technique);
  }
  for(const articulation of ['open','mute']) for(const id of ['riff-articulation-','riff-tone-']) {
    const button=get(id+articulation);
    button.disabled=!riffSelection||get('lock-guitar').checked;
    button.setAttribute('aria-pressed',Boolean(riffSelection && riffVoiceArticulation(note,riffSelection.pitch)===articulation));
  }
  get('riff-note-delete').disabled=!riffSelection||get('lock-guitar').checked;
  get('riff-tech-status').textContent=riffSelection ? keyNames[riffSelection.pitch%12]+(Math.floor(riffSelection.pitch/12)-1)+' · Takt '+(riffSelection.bar+1)+', Schritt '+(riffSelection.step+1)+' · '+(riffVoiceArticulation(note,riffSelection.pitch)==='mute'?'PM':'Offen')+' · '+riffTechniqueNames[type] : 'Wähle einen vorhandenen Riffton. Neue Töne starten ohne Technik.';
}
for(const type of Object.keys(riffTechniqueNames)) get('riff-tech-'+type).addEventListener('click',()=>{
  if(!riffSelection||get('lock-guitar').checked) return;
  const {bar,step,pitch}=riffSelection;
  const bars=setRiffTechnique(selected.guitar,bar,step,pitch,type);
  if(!bars) {get('riff-tech-status').textContent=type.startsWith('bend')?'Bending benötigt einen gegriffenen Ton, keine Leersaite.':'Hammer-on/Pull-off benötigt den passenden vorherigen Ton auf derselben Saite (1–4 Halbtöne, Hammer aufwärts, Pull abwärts).';return;}
  commitRiff(bars);
});
get('riff-note-delete').addEventListener('click',()=>{
  if(!riffSelection||get('lock-guitar').checked) return;
  const {bar,step,pitch,offset}=riffSelection;
  const bars=editRiffSpan(selected.guitar,bar,step,pitch,offset,{remove:true});
  riffSelection=null;commitRiff(bars);
});

function applyRiffArticulation(articulation) {
  if(!riffSelection||get('lock-guitar').checked) return;
  const {bar,step,pitch}=riffSelection;
  commitRiff(setRiffVoiceArticulation(selected.guitar,bar,step,pitch,articulation));
}
for(const articulation of ['open','mute']) get('riff-tone-'+articulation).addEventListener('click',()=>applyRiffArticulation(articulation));

function renderVocalGrid(bars = selected.vocal) {
  const grid = get('vocal-grid');
  const columns = gridColumns(vocalBar);
  renderScaleLegend('vocal-key', ' · '+vocalRanges[vocalRange].name);
  startGrid(grid, 'Ton', vocalBar, columns);
  const held = Array(sectionSteps()).fill(null);
  bars?.forEach((notes,bar)=>notes.forEach(note=>{
    const start = bar * stepsPerBar + note.step;
    for(let at=start;at<Math.min(sectionSteps(),start+note.length);at++) held[at]={note,bar};
  }));
  const pitches = [...new Set([...vocalPitches(config,vocalRange), ...(bars?.flat().map(note=>note.root) ?? [])])].sort((a,b)=>b-a);
  for (const pitch of pitches) {
    const name = `${keyNames[pitch%12]}${Math.floor(pitch/12)-1}`;
    const row = element('div','grid-row');
    if(pitchToneClass(pitch))row.classList.add(pitchToneClass(pitch));
    const label = element('span','drum-label',pitchCaption(pitch,name));label.title=pitchToneInfo(pitch).description || name;row.append(label);
    for (const {bar,step} of columns) {
      const playing = held[bar*stepsPerBar+step];
      const note = playing?.note.root===pitch ? playing.note : null;
      const onset = note && playing.bar===bar && note.step===step;
      const cell = element('button',`drum-cell vocal-cell${step%4===0?' downbeat':''}${note&&!onset?' vocal-hold':''}`);
      cell.type='button';cell.dataset.pitch=pitch;setGridCellPosition(cell,bar,step);
      if(note){cell.dataset.noteBar=playing.bar;cell.dataset.noteStep=note.step;}
      cell.setAttribute('aria-pressed',Boolean(onset));
      cell.setAttribute('aria-label',`${name}, Gesang, Takt ${bar+1}, Schritt ${step+1}${note?', '+(onset?`Länge ${note.length} Sechzehntel`:'klingt weiter'):''}`);
      row.append(cell);
    }
    grid.append(row);
  }
  for(const button of get('vocal-bar-picker').children)button.setAttribute('aria-pressed',Number(button.dataset.bar)===vocalBar);
}

function commitVocal(bars,name='Bearbeiteter Gesang') {vocalName=name;refresh({vocal:bars},{vocal:true});}
function vocalPromptRules(context) {
  return 'Stimmlage '+vocalRanges[context.vocalRange??'mid'].name+'. Erlaubte MIDI-Töne: '+vocalPitches(context,context.vocalRange).join(', ')+'. Einstimmig und ohne überlappende Noten. step ganzzahlig von 0 bis '+(context.bars*16-1)+', duration positive ganze Sechzehntellänge, Ende spätestens bei Schritt '+context.bars*16+'. Zusammenhängende singbare Phrasen, kleine Tonschritte, wiedererkennbare Motive und bewusste Atempausen. Kein Liedtext und keine Gitarren-Spieltechniken.';
}
function chatVocalPrompt(context,description) {
  const compact=bars=>bars?.flatMap((notes,bar)=>notes.map(note=>[bar*16+note.step,note.root,note.length]))??[];
  return ['Komponiere eine singbare Gesangsmelodie passend zum geöffneten Arrangement. Alle Begleitspuren bleiben unverändert.',context.bars+' Takte, 4/4, '+context.tempo+' BPM, '+keyNames[context.key]+'-'+scaleNames[context.scale]+', Stil '+chatStyleName(context)+'.','Klangwunsch: '+(description.trim()||'Passend zum Groove, mit Luft zwischen den Phrasen.'),vocalPromptRules(context),'Riff [Einsatz,Ton,Länge]: '+JSON.stringify(context.riff?.flatMap((notes,bar)=>riffAttacks(notes).map(v=>[bar*16+v.step,v.pitch,v.length]))??[]),'Drums [Einsatz,Instrument]: '+JSON.stringify(context.drums?.flatMap((beats,bar)=>beats.flatMap((hits,step)=>hits.map(hit=>[bar*16+step,hit.kind])))??[]),'Bass: '+JSON.stringify(compact(context.bass)),'Instrumentale Melodie: '+JSON.stringify(compact(context.melody)),'Lasse Raum für die Instrumental-Melodie. Stimme Phrasenanfänge und Akzente auf Riff und Drums ab. Antworte nur mit einem JSON-Codeblock: '+JSON.stringify({notes:[{step:0,pitch:vocalPitches(context,context.vocalRange)[0],duration:4},{step:8,pitch:vocalPitches(context,context.vocalRange)[2],duration:4}]})].join('\n');
}
function readChatVocal(value,context) {
  const notes=value?.notes,limit=context.bars*16,pitches=vocalPitches(context,context.vocalRange);
  if(!Array.isArray(notes)||!notes.length||notes.length>limit) throw new Error('Die Gesangsspur braucht eine gültige Notenliste.');
  const sorted=notes.map(note=>{
    if(!note||!Number.isInteger(note.step)||note.step<0||note.step>=limit||!pitches.includes(note.pitch)||!Number.isInteger(note.duration)||note.duration<1||note.step+note.duration>limit) throw new Error('Eine Gesangsnote passt nicht zur Tonart, Stimmlage oder Länge.');
    return note;
  }).sort((a,b)=>a.step-b.step);
  if(sorted.some((note,i)=>i&&sorted[i-1].step+sorted[i-1].duration>note.step)) throw new Error('Die Gesangsmelodie muss einstimmig sein, ohne überlappende Noten.');
  const bars=Array.from({length:context.bars},()=>[]);
  for(const note of sorted)bars[Math.floor(note.step/16)].push({step:note.step%16,root:note.pitch,length:note.duration,articulation:'single'});
  return bars;
}
get('vocal-bar-picker').addEventListener('click',event=>{const button=event.target.closest('button[data-bar]');if(button){vocalBar=Number(button.dataset.bar);renderVocalGrid();renderGridPosition();}});
get('vocal-grid').addEventListener('click',event=>{
  if(suppressGridClick)return;const cell=event.target.closest('button[data-pitch]');if(!cell)return;
  const bars=selected.vocal??selected.guitar.map(()=>[]),bar=Number(cell.dataset.noteBar??cell.dataset.bar),step=Number(cell.dataset.noteStep??cell.dataset.step),pitch=Number(cell.dataset.pitch);
  commitVocal(editMelodyNote(bars,bar,step,pitch,{length:Number(get('vocal-length').value)||4}));
});
bindNoteGrid({id:'vocal-grid',source:()=>selected.vocal,render:renderVocalGrid,commit:commitVocal,
  resize:(bars,{bar,step,pitch},current,end)=>editMelodyNote(bars,bar,step,pitch,{length:Math.max(1,(current-bar)*16+end-step),resize:true}),
  cut:(bars,{bar,step,origin},current)=>cutMelodyStep(bars,bar,step,current*16+origin)});
get('vocal-range').addEventListener('change',()=>{vocalRange=get('vocal-range').value;saveSection();renderVocalGrid();});
get('ai-vocal-range').addEventListener('change',()=>{get('ai-response').value='';get('ai-prompt-preview').hidden=true;aiPromptContext=null;get('ai-dialog-status').textContent='Stimmlage geändert. Kopiere eine neue Anfrage.';});
renderVocalGrid();


bindComposeSettings();

get('guitar-tuning').addEventListener('change',event=>{endComparison();config.tuning=event.target.value;refresh({tuning:config.tuning},{guitar:true,keepLead:true});});
