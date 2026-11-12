'use strict';

const get = id => document.getElementById(id);
const playButton = get('play');
const timeline = get('timeline');
const grooveNames = ['Grundgroove', 'Offene Hi-Hat', 'Halftime'];
const presetNames = ['Palm Mute', 'Offene Akkorde'];
const config = {style: 'stoner', melodyStyle: 'desert', key: 4, scale: 'minor', tempo: 90, mode: 'riff'};
const opening = originalGuitar(0, config);
let selected = {...config, guitar: opening, drums: makeGroove(config, opening, 0), lead: null, bass: null};
let guitarName = presetNames[0];
let grooveName = grooveNames[0];
let preset = 0;
let polyphonicRiff = false;
let groove = 0;
let editedBar = -1;
let riffBar = -1;
let melodyBar = -1;
let bassBar = -1;
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
const mixerChannels = ['volume', 'guitar-volume', 'drum-volume', 'lead-volume', 'bass-volume'];
const mixerMutes = new Set();
const editorTracks = {bass: {name:'Bass',channel:'bass-volume',grid:'bass-grid'}, riff: {name: 'Riff', channel: 'guitar-volume', grid: 'riff-grid'}, drums: {name: 'Drums', channel: 'drum-volume', grid: 'drum-grid'}, melody: {name: 'Melodie', channel: 'lead-volume', grid: 'melody-grid'}};
const drumGuides = {riff: {snare: false, kick: false}, melody: {snare: false, kick: false}};
let aiPromptContext;
let chatPart = 'melody';
let chatComparison;
const chatPartLabels = {melody: 'Melodie', riff: 'Riff', drums: 'Drums', arrangement: 'Arrangement', section: 'Songteil', bass: 'Bass'};
let sectionSerial = 1;
let activeSection = 1;
let songParts = [{id: 1, name: 'Vorhandenes Riff', type: 'Riff', pattern: selected, meta: null}];
let restoringHistory = false;

function trackHistoryField(track) {
  return track === 'bass' ? 'bass' : track === 'drums' ? 'drums' : track === 'riff' || selected.mode === 'melody' ? 'guitar' : 'lead';
}

function sectionHistory(part) {
  return part.history ??= Object.fromEntries(['guitar', 'drums', 'lead', 'bass'].map(field => [field, {past: [], future: []}]));
}

function trackSnapshot(pattern, meta, field) {
  const details = field === 'bass' ? {bassName: meta.bassName ?? 'Bass', bassStyle: meta.bassStyle ?? 'riff'} : field === 'guitar'
    ? {guitarName: meta.guitarName, preset: meta.preset, polyphonicRiff: meta.polyphonicRiff, mode: pattern.mode,
      ...(pattern.mode === 'melody' ? {melodyEdited: meta.melodyEdited, leadTake: meta.leadTake} : {})}
    : field === 'drums' ? {grooveName: meta.grooveName, groove: meta.groove}
      : {melodyEdited: meta.melodyEdited, leadTake: meta.leadTake};
  return structuredClone({data: pattern[field], details});
}

function recordTrackChanges(part) {
  const history = sectionHistory(part);
  if (!part.meta || restoringHistory) return;
  for (const field of ['guitar', 'drums', 'lead', 'bass']) {
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
    else ({melodyEdited, leadTake} = details);
    refresh(patch, {guitar: field === 'guitar', drums: field === 'drums', lead: field === 'lead', bass: field === 'bass', keepLead: true});
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
    return card;
  }));
  if (updateName) get('section-name').value = songParts.find(part => part.id === activeSection)?.name ?? '';
}

function renderBarPickers() {
  const count = selected.guitar.length;
  editedBar = editedBar >= count ? 0 : editedBar;
  riffBar = riffBar >= count ? 0 : riffBar;
  melodyBar = melodyBar >= count ? 0 : melodyBar;
  bassBar = bassBar >= count ? 0 : bassBar;
  for (const picker of ['bar-picker', 'melody-bar-picker', 'riff-bar-picker', 'bass-bar-picker']) {
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
    ({guitarName, grooveName, preset, polyphonicRiff, melodyEdited, groove, leadTake} = meta);
    bassName = meta.bassName ?? 'Optional'; bassStyle = meta.bassStyle ?? 'riff';
    config.style = meta.style; config.melodyStyle = meta.melodyStyle;
    get('mute-lead').checked = meta.muteLead;
  }
  for (const field of ['key', 'scale', 'tempo', 'mode']) config[field] = part.pattern[field];
  for (const field of ['key', 'scale', 'tempo', 'mode', 'style']) get(field).value = config[field];
  get('melody-style').value = config.melodyStyle;
  selected = part.pattern;
  editedBar = riffBar = melodyBar = bassBar = -1;
  renderBarPickers();
  refresh({}, {guitar: true, drums: true, lead: true, bass: true, keepLead: true});
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
    const drums = element('div', 'beats');
    const attacks = pattern.mode === 'riff' ? riffAttacks(notes) : [];
    for (let step = 0; step < stepsPerBar; step++) {
      const voices = attacks.filter(voice => voice.step === step);
      const note = pattern.mode === 'riff' ? voices[0]?.note : notes.find(note => note.step === step);
      const editable = note && note.articulation !== 'single';
      const tick = element(editable ? 'button' : 'span', note ? `step note stroke-${note.articulation}` : 'step');
      if (note) tick.style.setProperty('--height', `${10 + (voices.length ? Math.max(...voices.map(voice => voice.length)) : note.length) * 2.8}px`);
      if (editable) {
        const muted = note.articulation === 'mute';
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
      drums.append(element('span', pattern.drums[bar][step].length ? 'beat hit' : 'beat'));
    }
    block.append(element('span', 'bar-number', `0${bar + 1}`), guitar);
    if (lead) block.append(lead);
    if (bass) block.append(bass);
    block.append(drums);
    return block;
  }));
}

function renderTabs(id, guitar, bass = false) {
  const names = bass ? ['D', 'A', 'D', 'G'] : ['D', 'A', 'D', 'G', 'H', 'E'];
  const frets = note => {
    if (!bass) return guitarFrets(note);
    const tuning = [26, 33, 38, 43];
    const string = tuning.findLastIndex(pitch => pitch <= note.root);
    return string < 0 ? [] : [[string, note.root - tuning[string]]];
  };
  const strings = names.map(name => [`${name}|`]);
  const markers = ['  '];
  const mark = {mute: 'PM ', open: 'O  ', single: '♪  '};
  const techniques = {slide: 'S', hammer: 'H', bend: 'B', vibrato: 'V'};
  guitar.forEach(notes => {
    const bar = names.map(() => Array(stepsPerBar).fill('---'));
    const technique = Array(stepsPerBar).fill('   ');
    const entries = notes.every(note => note.articulation === 'single') ? notes : riffAttacks(notes).map(({note, step, index}) => ({
      ...note, step, voicing: [guitarFrets(note)[index]],
    }));
    for (const note of entries) {
      const color = `stroke-${note.articulation}`;
      const playing = (techniques[note.transition] ?? '') + (note.expression === 'bend' ? bendSymbol(note) : techniques[note.expression] ?? '');
      technique[note.step] = element('span', color, playing ? playing.padEnd(3) : mark[note.articulation]);
      for (const [string, fret] of frets(note)) bar[string][note.step] = element('span', color, String(fret).padEnd(3, '-'));
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
  if (all) {
    const labels = element('div', 'grid-row grid-bar-labels');
    labels.append(element('span', '', 'Takte'));
    for (const {bar, step} of columns) if (step === 0) labels.append(element('span', 'grid-bar-title', `Takt ${bar + 1}`));
    grid.replaceChildren(labels, header);
  } else grid.replaceChildren(header);
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
  const firstPitch = tunings[0];
  const lastPitch = tunings.at(-1) + 22;
  renderScaleLegend('riff-key', ' · Drop D');
  get('riff-edit-status').textContent = '';
  get('riff-articulation').disabled = locked;
  for (const articulation of ['open', 'mute']) {
    get(`riff-articulation-${articulation}`).disabled = locked;
    get(`riff-articulation-${articulation}`).setAttribute('aria-pressed', get('riff-articulation').value === articulation);
  }
  startGrid(grid, 'Ton', riffBar, columns);
  for (let pitch = firstPitch; pitch <= lastPitch; pitch++) {
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
      const muted = voice?.note.articulation === 'mute';
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
        if (onset) cell.textContent = muted ? 'PM' : 'O';
        else cell.classList.add('riff-hold');
      }
      const articulation = voice ? (muted ? ', Palm Mute' : ', offen') + (onset ? '' : ', klingt weiter') : '';
      cell.setAttribute('aria-label', `${name}, Takt ${bar + 1}, Schritt ${step + 1}${articulation}`);
      cell.setAttribute('aria-pressed', onset);
      row.append(cell);
    }
    grid.append(row);
  }
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
      if (note?.expression === 'bend') techniques.push(bendDescription(note));
      if (note) {
        cell.dataset.noteBar = onset ? bar : sustain.bar;
        cell.dataset.noteStep = note.step;
      }
      if (onset && techniques.length) {
        cell.textContent = (onset.transition === 'hammer' ? 'H' : '') + (onset.expression === 'bend' ? bendSymbol(onset) : '');
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
  const guitarLocked = get('lock-guitar').checked;
  const drumsLocked = get('lock-drums').checked;
  for (const id of ['key', 'scale', 'mode', 'new-guitar', 'poly-riff', 'variation']) get(id).disabled = guitarLocked;
  for (const id of ['change-drums', 'new-drums']) get(id).disabled = drumsLocked;
  get('guitar-name').textContent = guitarName;
  get('groove').textContent = grooveName;
  get('new-guitar').textContent = config.mode === 'riff' ? 'Neues Riff' : 'Neue Melodie';
  get('export-guitar').textContent = config.mode === 'riff' ? 'Riff als MIDI' : 'Melodie als MIDI';
  get('export-guitar').dataset.track = config.mode;
  const solo = config.mode === 'melody';
  get('open-ai-melody').disabled = solo && guitarLocked;
  get('open-ai-riff').disabled = guitarLocked;
  get('open-ai-riff').hidden = solo;
  get('open-ai-drums').disabled = drumsLocked;
  get('open-ai-arrangement').disabled = guitarLocked || drumsLocked;
  get('open-ai-bass').disabled = false;
  get('bass-name').textContent = selected.bass ? bassName : 'Optional';
  get('bass-volume').disabled = !selected.bass;
  get('export-bass').disabled = !selected.bass;
  get('toggle-bass').textContent = selected.bass ? 'Bass entfernen' : 'Passenden Bass hinzufügen';
  get('toggle-bass').setAttribute('aria-pressed', Boolean(selected.bass));
  get('track-ai-guitar').textContent = `${solo ? 'Melodie' : 'Riff'} mit ChatGPT`;
  get('track-ai-guitar').disabled = guitarLocked;
  get('track-ai-drums').disabled = drumsLocked;
  get('track-ai-melody').disabled = solo && guitarLocked;
  get('poly-riff').hidden = solo;
  get('riff-editor').hidden = solo;
  const hasMelody = solo || Boolean(selected.lead);
  const muted = get('mute-lead').checked;
  get('lead-status').textContent = hasMelody ? (muted ? 'Stumm' : melodyEdited ? 'Bearbeitet' : solo ? 'Melodie ohne Riff' : 'Passend zum Riff') : 'Optional';
  timeline.classList.toggle('lead-muted', muted);
  get('toggle-lead').textContent = selected.lead ? 'Melodie entfernen' : 'Passende Melodie hinzufügen';
  get('toggle-lead').hidden = solo;
  get('toggle-lead').setAttribute('aria-pressed', Boolean(selected.lead));
  for (const id of ['new-lead']) get(id).hidden = !selected.lead;
  get('export-lead').disabled = !selected.lead;
  get('mute-lead-label').hidden = !hasMelody;
  get('lead-volume').disabled = !hasMelody;
  get('melody-style').disabled = solo && guitarLocked;
  get('lead-techniques').hidden = !hasMelody;
  get('guitar-volume').disabled = solo;
  for (const channel of mixerChannels) {
    const mute = get(`${channel}-mute`);
    const muted = isMixerMuted(channel);
    mute.disabled = Boolean(get(channel).disabled);
    mute.setAttribute('aria-pressed', muted);
    mute.textContent = muted ? 'Stumm' : 'Mute';
  }
  get('presets').hidden = config.style !== 'stoner' || config.mode !== 'riff';
  get('presets').querySelectorAll('button').forEach(button => {
    button.disabled = guitarLocked;
    button.setAttribute('aria-pressed', Number(button.dataset.preset) === preset);
  });
  renderTabView();
  renderTrackActions();
  renderEditorTransport();
}

function editorTrackAvailable(track) {
  return track === 'bass' ? Boolean(selected.bass) : track === 'riff' ? selected.mode === 'riff' : track === 'melody' ? Boolean(melodySource()) : true;
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
    get(grid).classList.toggle('solo-muted', silent);
    get(`${track}-solo-state`).textContent = !editorTrackAvailable(track) ? 'Keine Spur vorhanden' : solo ? 'Solo aktiv' : silent ? 'Durch Solo stumm' : playing ? 'Gemeinsame Wiedergabe' : '';
  }
  renderHistoryButtons();
}

function renderGridPosition(visible = playback?.position) {
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
    const bend = note.technique.startsWith('bend-');
    bars[Math.floor(note.step / stepsPerBar)].push({
      step: note.step % stepsPerBar, root: note.pitch, length: note.duration, articulation: 'single',
      transition: slide ? 'slide' : hammer ? 'hammer' : undefined, from: slide ? previous.pitch : undefined,
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
    songSignature: part === 'section' ? songParts.map(part => `${part.id}:${part.name}`).join('|') : null,
    key: selected.key, scale: selected.scale, tempo: selected.tempo, mode: selected.mode,
    style: part === 'melody' ? config.melodyStyle : config.style,
    melodyStyle: ['arrangement', 'section'].includes(part) ? config.melodyStyle : null,
    bassStyle: part === 'bass' ? get('ai-bass-style').value : null,
    bass: part !== 'bass' && part !== 'arrangement' ? selected.bass : null,
    riff: ['drums', 'melody', 'section', 'bass'].includes(part) && selected.mode === 'riff' ? selected.guitar : null,
    drums: ['riff', 'melody', 'section', 'bass'].includes(part) ? selected.drums : null,
    musicStyle: config.style,
    melody: ['riff', 'drums', 'section', 'bass'].includes(part) ? (selected.mode === 'melody' ? selected.guitar : selected.lead) : null};
}

function chatStyleName(context) {
  const field = context.part === 'melody' ? 'melody-style' : 'style';
  return get(field).selectedOptions?.[0]?.textContent ?? context.style;
}

function chatTrackPrompt(context, description) {
  if (context.part === 'bass') return chatBassPrompt(context, description);
  const count = context.bars;
  const steps = count * stepsPerBar;
  let prompt = buildChatTrackPrompt(context.part === 'section' ? {...context, part: 'arrangement'} : context, description)
    .replaceAll('viertaktigen', `${count}-taktigen`)
    .replaceAll('die vier Takte', `die ${count} Takte`)
    .replaceAll('Takt 4', `Takt ${count}`)
    .replaceAll('0 bis 63', `0 bis ${steps - 1}`)
    .replaceAll('1–64 Anschläge', `1–${steps} Anschläge`)
    .replaceAll('2–32', `2–${steps / 2}`)
    .replaceAll('Schritt 64', `Schritt ${steps}`);
  if (['arrangement', 'section'].includes(context.part) && context.hasBass) prompt += `\nKomponiere zusätzlich die Bassspur im selben JSON als "bass":{"notes":[{"step":0,"pitch":${bassPitches(context)[0]},"duration":4}]}. Erlaubte MIDI-Töne: ${bassPitches(context).join(', ')}. Einstimmig, 1 bis ${steps} Noten, ganzzahlige Einsätze 0 bis ${steps-1}, positive ganzzahlige Dauern, Ende spätestens bei Schritt ${steps}. Stimme den Bass auf Riff, Drums, Melodie und Musikstil ab.`;
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
    context.bass ? `Vorhandener Bass als [Einsatz, MIDI-Ton, Länge]: ${JSON.stringify(context.bass.flatMap((notes,bar)=>notes.map(note=>[bar*16+note.step,note.root,note.length])))}.` : '',
    'Komponiere die gewählte Spur neu zu den vorhandenen Begleitspuren. Diese bleiben unverändert. Grundton, Tonart, Tempo und die vier Takte sind verbindlich. Beachte ihre Tonhöhen, Notenlängen, Pausen und rhythmischen Akzente; die neue Spur soll musikalisch dazu passen.',
    {stoner: 'Stoner Rock: schwerer, lässiger Groove, markante wiederkehrende Motive, Raum für lange Töne und gezielte Synkopen. Kick und Riff stützen einander; die Melodie darf Riffanschläge überklingen.', punk: 'Punk Rock: direkter, treibender Groove, klare kurze Motive, Achtelpuls und prägnante Akzente. Halte die Begleitung rhythmisch zusammen.', hard: 'Hard Rock: druckvoller Backbeat, griffige Riffmotive und gezielte Synkopen. Melodie und Riff antworten einander; nutze Pausen für Platz.'}[context.musicStyle],
    'Behalte den Puls der Begleitung bei, ohne jeden Anschlag zu verdoppeln. Führe Takt 4 musikalisch zurück zu Takt 1. Antworte nur mit einem JSON-Codeblock. Ersetze die Beispielwerte durch deine Komposition.',
  ].filter(Boolean);
  if (context.part === 'arrangement') {
    const root = tonic(context.key);
    const pitches = melodyPitches(context);
    const melodyStyle = get('melody-style').selectedOptions?.[0]?.textContent ?? context.melodyStyle;
    return [
      'Komponiere ein vollständiges, originelles Arrangement aus Gitarrenriff, Lead-Melodie und Drums für denselben viertaktigen Loop in Fuzz Room.',
      `4/4-Takt, ${context.tempo} BPM, ${key}. Riff- und Drumstil: ${chatStyleName(context)}. Melodiestil: ${melodyStyle}.`,
      `Klangwunsch: ${description.trim() || 'Ein schwerer Groove mit wiedererkennbarem Riff und einer passenden Lead-Melodie.'}`,
      'Plane alle drei Spuren zusammen. Kick und Riff sollen sich rhythmisch ergänzen. Die Melodie soll ein Motiv entwickeln, über manche Riffanschläge hinweg ausklingen und am Ende zum Loop zurückführen.',
      'Antworte ausschließlich mit einem JSON-Codeblock. Ersetze alle Beispielwerte durch dein Arrangement:',
      JSON.stringify({
        riff: {notes: [{step: 0, pitches: [root, root + 7], duration: 3, articulation: 'mute'}]},
        melody: {notes: [{step: 0, pitch: pitches[0], duration: 8, technique: 'none'}, {step: 8, pitch: pitches[2], duration: 4, technique: 'vibrato'}]},
        drums: {hits: [{step: 0, kind: 'kick', velocity: .9}, {step: 4, kind: 'snare', velocity: .8}]},
      }),
      'Alle step-Werte sind ganzzahlige Sechzehntelpositionen von 0 bis 63. duration ist eine positive ganze Zahl in Sechzehnteln.',
      `Riff: 1–64 Anschläge, je ein Eintrag pro Einsatz, 1–6 MIDI-Töne gleichzeitig im Bereich 38–86 in ${key}. Drop-D-Leersaiten: 38, 45, 50, 55, 59, 64. Eine Note pro Saite, höchstens vier Bünde Spannweite. articulation: open oder mute. Jeder Anschlag endet vor dem nächsten Anschlag oder am Taktende.`,
      `Melodie: 2–32 einstimmige Noten ohne Überschneidung, erlaubte MIDI-Töne ${pitches.join(', ')}. technique: none, hammer, slide, bend-half, bend-whole, bend-up-return, bend-release oder vibrato.`,
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
      JSON.stringify({notes: [{step: 0, pitches: [root, root + 7], duration: 3, articulation: 'mute'}, {step: 4, pitches: [root], duration: 4, articulation: 'open'}]}),
      `Erlaubte MIDI-Tonhöhen: 38–86 in ${key}, tiefe Lagen bevorzugen. Drop-D-Leersaiten: MIDI 38, 45, 50, 55, 59, 64. Höchstens eine Note pro Saite und höchstens vier Bünde Spannweite zwischen gegriffenen Tönen.`,
      'step: ganzzahliger Einsatz von 0 bis 63 in Sechzehnteln. pitches: 1–6 gleichzeitig klingende MIDI-Töne. duration: Länge in Sechzehnteln, höchstens bis zum nächsten Anschlag oder Taktende. articulation: open oder mute. Nur ein Eintrag pro Einsatz.',
    ].join('\n');
  }
  const pitches = melodyPitches(context);
  return [
    'Komponiere eine originelle, einstimmige E-Gitarrenmelodie für einen viertaktigen Loop in Fuzz Room.',
    ...brief,
    `Erlaubte MIDI-Tonhöhen: ${pitches.join(', ')}.`,
    'Lass einzelne Töne ausklingen, entwickle das Motiv und führe es zu einem Schluss.',
    JSON.stringify({notes: [{step: 0, pitch: pitches[0], duration: 8, technique: 'none'}, {step: 8, pitch: pitches[2], duration: 4, technique: 'vibrato'}]}),
    'step: ganzzahliger Einsatz in Sechzehnteln von 0 bis 63. duration: ganzzahlige Dauer in Sechzehnteln, mindestens 1. 2–32 Noten, keine doppelten Einsätze oder Überschneidungen. Die letzte Note endet spätestens bei Schritt 64.',
    'technique: none, hammer, slide, bend-half, bend-whole, bend-up-return, bend-release oder vibrato. Hammer-on nur vom vorherigen tieferen Ton, Slide nur zwischen nahen Tönen.',
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
  const notes = value?.notes;
  const steps = (context.bars ?? selected.guitar.length) * stepsPerBar;
  if (!Array.isArray(notes) || notes.length < 2 || notes.length > steps / 2) throw new Error(`Die Antwort muss 2 bis ${steps / 2} Noten enthalten.`);
  const pitches = melodyPitches(context);
  const techniques = ['none', 'hammer', 'slide', 'bend-half', 'bend-whole', 'bend-up-return', 'bend-release', 'vibrato'];
  const sorted = notes.map(note => {
    if (!note || !Number.isInteger(note.step) || note.step < 0 || note.step >= steps
        || !pitches.includes(note.pitch) || !Number.isInteger(note.duration) || note.duration < 1 || note.duration > steps
        || !techniques.includes(note.technique ?? 'none')) {
      throw new Error('Einige Noten passen nicht zur Tonart oder zum Raster. Bitte ChatGPT, die Vorgaben in der Anfrage einzuhalten.');
    }
    return {...note, technique: note.technique ?? 'none'};
  }).sort((a, b) => a.step - b.step);
  return sorted.map((note, index) => {
    const available = (sorted[index + 1]?.step ?? steps) - note.step;
    if (available === 0) throw new Error('Zwei Noten beginnen im selben Schritt. Bitte ChatGPT um eine einstimmige Melodie.');
    return {...note, duration: Math.min(note.duration, available)};
  });
}

function readChatRiff(value, context) {
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
    if (positions.has(note.step)) throw new Error('Fasse gleichzeitig gespielte Rifftöne in einem pitches-Feld zusammen.');
    positions.add(note.step);
    const pitches = note.pitches.toSorted((a, b) => a - b);
    const voicing = findRiffVoicing(pitches, []);
    if (!voicing) throw new Error(`Der Griff in Takt ${Math.floor(note.step / stepsPerBar) + 1}, Schritt ${note.step % stepsPerBar + 1} ist in Drop D nicht spielbar.`);
    bars[Math.floor(note.step / stepsPerBar)].push({step: note.step % stepsPerBar, root: pitches[0], length: note.duration, articulation: note.articulation, voicing});
  }
  return bars.map(notes => notes.sort((a, b) => a.step - b.step).map((note, index) => ({
    ...note, length: Math.min(note.length, (notes[index + 1]?.step ?? stepsPerBar) - note.step),
  })));
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
      saveSection();
      const part = {id: ++sectionSerial, name: context.sectionType, type: context.sectionType,
        pattern: {...selected, mode: 'riff', guitar, drums, lead, bass},
        meta: {...beforeMeta, mode: 'riff', preset: null, polyphonicRiff: false, melodyEdited: true,
          guitarName: 'ChatGPT-Riff', grooveName: 'ChatGPT-Drums', bassName: bass ? 'ChatGPT-Bass' : 'Optional', style: config.style, melodyStyle: config.melodyStyle, groove, leadTake, muteLead: false}};
      songParts.splice(songParts.findIndex(part => part.id === context.sourceId) + 1, 0, part);
      get('ai-melody-dialog').close();
      get('ai-response').value = '';
      aiPromptContext = null;
      openSection(part.id);
      get('ai-status').textContent = `${part.name} mit ${context.bars} Takten hinzugefügt. Dein bisheriger Teil bleibt erhalten.`;
      return;
    }
    if (chatPart === 'bass') {
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
  return {guitarName, grooveName, preset, polyphonicRiff, melodyEdited, mode: config.mode, bassName, bassStyle, muteLead: get('mute-lead').checked};
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
  ({guitarName, grooveName, preset, polyphonicRiff, melodyEdited, bassName, bassStyle} = meta);
  config.mode = meta.mode;
  get('mode').value = meta.mode;
  get('mute-lead').checked = meta.muteLead;
  chatComparison.active = version;
  refresh(version === 'after' ? chatComparison.candidate : chatComparison.base,
    {guitar: true, drums: true, lead: true, bass: true, keepLead: true, comparisonChange: true});
  applyVolume();
  renderComparison();
}

function finishComparison(adopt) {
  if (!chatComparison) return;
  selectComparison(adopt ? 'after' : 'before');
  chatComparison = null;
  saveSection();
  renderSong();
  renderComparison();
  get('ai-status').textContent = adopt ? 'Neue Version übernommen.' : 'Neue Version verworfen. Bisherige Version wiederhergestellt.';
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
  if (playback.song) {
    const part = playback.song[playback.songIndex];
    setStatus(`Song · ${part.name}`);
    return;
  }
  setStatus(playback.active !== selected ? 'Wechsel vorgemerkt' : playback.soloTrack ? `Läuft · Nur ${editorTracks[playback.soloTrack].name}` : 'Läuft');
}

function refresh(pattern, {guitar = false, drums = false, lead = false, bass = false, keepLead = false, comparisonChange = false} = {}) {
  if (!comparisonChange) endComparison();
  const previous = selected;
  const count = comparisonChange ? pattern.guitar.length : selected.guitar.length;
  pattern = {...pattern};
  for (const track of ['guitar', 'drums', 'lead', 'bass']) if (pattern[track]) pattern[track] = fitBars(pattern[track], count);
  selected = {...selected, ...pattern};
  if (selected.bass && (selected.key !== previous.key || selected.scale !== previous.scale)) {
    const pitches = bassPitches(config);
    const shift = (selected.key - previous.key + 18) % 12 - 6;
    selected.bass = selected.bass.map(notes=>notes.map(note=>({...note,root:pitches.reduce((best,pitch)=>Math.abs(pitch-note.root-shift)<Math.abs(best-note.root-shift)?pitch:best)})));
    bass = true;
  }
  if (selected.guitar.length !== previous.guitar.length) renderBarPickers();
  if (guitar && selected.lead && !keepLead) {
    if (config.mode === 'melody') selected.lead = null;
    else if (!melodyEdited) selected.lead = makeLead(config, selected.guitar, leadTake);
    else if (selected.key !== previous.key || selected.scale !== previous.scale) {
      selected.lead = transposeEditedMelody(selected.lead, previous.key, config);
    }
  }
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
  if (drums) renderGrid();
  if (pattern.drums && !guitar && Object.values(drumGuides.riff).some(Boolean)) renderRiffGrid();
  if (pattern.drums && !(guitar || lead) && Object.values(drumGuides.melody).some(Boolean)) renderMelodyGrid();
  if (guitar || lead) renderMelodyGrid();
  if (guitar || pattern.drums || lead || bass) renderTimeline(selected);
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
        sound.string(pitch, note.articulation === 'mute', 0);
        sound.string(pitch, note.articulation === 'mute', 1);
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
    playback.step = 0;
    playback.visual.length = 0;
    applyVolume();
  }
  while (playback.nextTime < now + .12) {
    if (playback.step === 0) {
      playback.scheduled = playback.song ? playback.song[playback.songIndex].pattern : selected;
      playback.riffAttacks = playback.scheduled.mode === 'riff' ? playback.scheduled.guitar.map(riffAttacks) : null;
    }
    const pattern = playback.scheduled;
    const stepDuration = 15 / pattern.tempo;
    const bar = Math.floor(playback.step / stepsPerBar);
    const step = playback.step % stepsPerBar;
    const time = Math.max(playback.nextTime, now + .005);
    for (const hit of pattern.drums[bar][step]) {
      const voice = drumVoice[hit.kind];
      sound.drum(time + voice.delay + Math.random() * .005, hit.kind, hit.velocity * (.94 + Math.random() * .12));
    }
    const note = pattern.guitar[bar].find(note => note.step === step);
    const voices = playback.riffAttacks?.[bar].filter(voice => voice.step === step);
    if (voices?.length) sound.guitar(time, voices, stepDuration, step === 0 ? .91 : .77);
    if (note && pattern.mode === 'melody') sound.lead(time, note, stepDuration);
    const bass = pattern.bass?.[bar].find(note => note.step === step);
    if (bass) sound.bass(time, bass, stepDuration);
    const lead = pattern.lead?.[bar].find(note => note.step === step);
    if (lead) sound.lead(time + .01, lead, stepDuration);
    playback.visual.push({pattern, time, bar, step, songIndex: playback.songIndex});
    if (playback.visual.length > stepsPerBar) playback.visual.shift();
    playback.step = (playback.step + 1) % (pattern.guitar.length * stepsPerBar);
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
      block.querySelector('.beats').children[visible.step].classList.add('active');
    }
    get('counter').textContent = `${String(visible.bar + 1).padStart(2, '0')} / ${String(visible.pattern.guitar.length).padStart(2, '0')}`;
  }
  playback.frame = requestAnimationFrame(animate);
}

function isMixerMuted(channel) {
  return channel === 'lead-volume' ? Boolean(get('mute-lead').checked) : mixerMutes.has(channel);
}

function applyVolume() {
  if (!sound || !playback) return;
  const level = id => {
    const muted = id !== 'volume' && playback.soloTrack
      ? editorTracks[playback.soloTrack].channel !== id : isMixerMuted(id);
    return muted ? 0 : (Number(get(id).value) / 100) ** 1.4;
  };
  sound.setVolume(level('volume'));
  sound.setTrackLevels(level('guitar-volume'), level('drum-volume'), level('lead-volume'), level('bass-volume'));
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
  }
}

function setNewGuitar() {
  preset = null;
  guitarName = config.mode === 'riff' ? 'Eigenes Riff' : 'Melodie';
  if (config.mode === 'melody') melodyEdited = false;
  if (polyphonicRiff && config.mode === 'riff') {
    guitarName = 'Mehrstimmiges Riff';
    return generatePolyRiff(config);
  }
  return generateGuitar(config, leadTake);
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
}
get('mute-lead').addEventListener('change', () => {
  renderControls();
  applyVolume();
});
get('toggle-lead').addEventListener('click', () => {
  melodyEdited = false;
  const lead = selected.lead ? null : makeLead(config, selected.guitar, leadTake);
  if (lead) get('mute-lead').checked = false;
  refresh({lead}, {lead: true});
  applyVolume();
});
get('new-lead').addEventListener('click', () => {
  melodyEdited = false;
  leadTake = (leadTake + 1) % 3;
  refresh({lead: makeLead(config, selected.guitar, leadTake)}, {lead: true});
});
get('melody-style').addEventListener('change', event => {
  config.melodyStyle = event.target.value;
  melodyEdited = false;
  if (config.mode === 'melody') refresh({guitar: setNewGuitar()}, {guitar: true});
  else if (selected.lead) refresh({lead: makeLead(config, selected.guitar, leadTake)}, {lead: true});
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
    ? {...note, articulation: note.articulation === 'mute' ? 'open' : 'mute'}
    : note);
  preset = null;
  guitarName = 'Bearbeitetes Riff';
  refresh({guitar}, {guitar: true});
  timeline.children[bar].querySelector('.steps').children[Number(button.dataset.column ?? step)].focus({preventScroll: true});
});
get('new-guitar').addEventListener('click', () => {
  polyphonicRiff = false;
  if (config.mode === 'melody') leadTake = (leadTake + 1) % 3;
  refresh({guitar: setNewGuitar()}, {guitar: true});
});
get('poly-riff').addEventListener('click', () => {
  polyphonicRiff = true;
  refresh({guitar: setNewGuitar()}, {guitar: true});
});
get('variation').addEventListener('click', () => {
  const guitar = selected.guitar.slice();
  const next = (polyphonicRiff ? generatePolyRiff(config) : generateGuitar(config, (leadTake + 1) % 3))[3];
  if (JSON.stringify(next) === JSON.stringify(guitar[3])) next[0].length *= .65;
  guitar[3] = next;
  preset = null;
  guitarName = 'Variation in Takt 4';
  refresh({guitar}, {guitar: true});
});
get('presets').addEventListener('click', event => {
  const button = event.target.closest('button[data-preset]');
  if (!button) return;
  preset = Number(button.dataset.preset);
  polyphonicRiff = false;
  guitarName = presetNames[preset];
  refresh({guitar: originalGuitar(preset, config)}, {guitar: true});
});
get('change-drums').addEventListener('click', () => {
  groove = (groove + 1) % grooveNames.length;
  grooveName = grooveNames[groove];
  refresh({drums: makeGroove(config, selected.guitar, groove)}, {drums: true});
});
get('new-drums').addEventListener('click', () => {
  grooveName = 'Eigener Groove';
  refresh({drums: makeGroove(config, selected.guitar, groove, true)}, {drums: true});
});
get('style').addEventListener('change', event => {
  config.style = event.target.value;
  const changeGuitar = !get('lock-guitar').checked && !(config.mode === 'melody' && melodyEdited);
  const changeDrums = !get('lock-drums').checked;
  const guitar = changeGuitar ? setNewGuitar() : selected.guitar;
  if (changeDrums) {
    groove = 0;
    grooveName = grooveNames[groove];
  }
  const drums = changeDrums ? makeGroove(config, guitar, groove, true) : selected.drums;
  refresh({style: config.style, guitar, drums}, {guitar: changeGuitar, drums: changeDrums});
});
for (const id of ['key', 'scale', 'mode']) {
  get(id).addEventListener('change', event => {
    if (id === 'mode') {
      melodyEdited = false;
      polyphonicRiff = false;
    }
    config[id] = id === 'key' ? Number(event.target.value) : event.target.value;
    const guitar = config.mode === 'melody' && melodyEdited
      ? transposeEditedMelody(selected.guitar, selected.key, config)
      : id !== 'mode' && preset !== null ? originalGuitar(preset, config) : setNewGuitar();
    refresh({[id]: config[id], guitar}, {guitar: true});
  });
}
get('tempo').addEventListener('change', event => {
  const input = event.target;
  const entered = input.valueAsNumber;
  if (Number.isFinite(entered)) config.tempo = Math.max(55, Math.min(210, Math.round(entered)));
  input.value = config.tempo;
  if (config.tempo !== selected.tempo) refresh({tempo: config.tempo});
});
get('export').addEventListener('click', () => downloadMidi(selected));
for (const part of ['guitar', 'drums', 'lead', 'bass']) {
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
  const guitar = cell.dataset.noteStep === undefined
    ? editRiffPitch(selected.guitar, bar, step, pitch, get('riff-articulation').value || 'open')
    : editRiffSpan(selected.guitar, bar, Number(cell.dataset.noteStep), pitch, Number(cell.dataset.offset), {remove: true});
  if (!guitar) {
    get('riff-edit-status').textContent = 'Diese Töne ergeben zusammen keinen spielbaren Drop-D-Griff. Entferne zuerst einen Ton.';
    return;
  }
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
    setMelodyTool(melodyTool, 'Für einen Hammer-on braucht der Ton einen vorherigen Ton, der ein bis vier Halbtöne tiefer liegt.');
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

get('song-parts').addEventListener('click', event => {
  const button = event.target.closest('button[data-section]');
  if (!button || playButton.disabled) return;
  const id = Number(button.dataset.section);
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
  get("riff-articulation").value = articulation;
  renderRiffGrid();
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
  refresh({bass: bars}, {bass: true});
}

function renderBassGrid(bars = selected.bass) {
  const grid = get('bass-grid');
  const columns = gridColumns(bassBar);
  renderScaleLegend('bass-key', ' · D1–G3');
  startGrid(grid, 'Ton', bassBar, columns);
  const held = Array(sectionSteps()).fill(null);
  bars?.forEach((notes,bar)=>notes.forEach(note=>{
    const start = bar * stepsPerBar + note.step;
    for(let at=start;at<Math.min(sectionSteps(),start+note.length);at++) held[at]={note,bar};
  }));
  const pitches = [...new Set([...bassPitches(config), ...(bars?.flat().map(note=>note.root) ?? [])])].sort((a,b)=>b-a);
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
    if(!note||!Number.isInteger(note.step)||note.step<0||note.step>=limit||!pitches.includes(note.pitch)||!Number.isInteger(note.duration)||note.duration<1||note.duration>limit)throw new Error('Eine Bassnote passt nicht zur Tonart, zum Tonumfang D1–G3 oder zum Raster. Bitte ChatGPT, die Vorgaben einzuhalten.');
    return {...note};
  }).sort((a,b)=>a.step-b.step);
  const bars=Array.from({length:count},()=>[]);
  sorted.forEach((note,index)=>{
    const next=sorted[index+1]?.step??limit;
    if(next===note.step)throw new Error('Der Bass muss einstimmig sein; zwei Noten beginnen gleichzeitig.');
    bars[Math.floor(note.step/16)].push({step:note.step%16,root:note.pitch,length:Math.min(note.duration,next-note.step),articulation:'single'});
  });
  return bars;
}

function chatBassPrompt(context, description) {
  const compact=(bars, riff=false)=>bars?.flatMap((notes,bar)=>(riff?riffAttacks(notes):notes).map(note=>[bar*16+note.step, riff?note.pitch:note.root,note.length]))??[];
  const drums=context.drums.flatMap((beats,bar)=>beats.flatMap((hits,step)=>hits.map(hit=>[bar*16+step,hit.kind])));
  const behavior={riff:'Folge den Grundtönen und wichtigen Anschlägen des Riffs. Spiele eine Oktave tiefer, ohne unnötige Verdopplungen in hoher Lage.',root:'Einfacher tragender Grundton-Groove, wenige Noten, bewusste Pausen und enger Bezug zur Kick.',independent:'Eigenständiges wiedererkennbares Bassmotiv mit Gegenbewegungen und kurzen Übergängen. Lasse Platz für Riff und Melodie.'}[context.bassStyle];
  const style={stoner:'Warmer, leicht angezerrter Stoner-Bass: tief, schwer und lässig, mit Raum für ausklingende Töne.',punk:'Treibender Punk-Bass mit klarer Achtelbewegung und direktem Anschlag.',hard:'Druckvoller Hard-Rock-Bass, eng an Kick und Riff, mit gezielten Übergängen.'}[context.musicStyle];
  return [`Komponiere eine neue Bassspur zu den vorhandenen Begleitspuren. Diese bleiben unverändert.`,`${context.bars} Takte, 4/4, ${context.tempo} BPM, Grundton ${keyNames[context.key]}, Tonart ${scaleNames[context.scale]}, Stil ${chatStyleName(context)}.`,style,behavior,`Klangwunsch: ${description.trim()||'Passend zum vorhandenen Arrangement.'}`,`Riff [Einsatz,MIDI-Ton,Länge]: ${JSON.stringify(compact(context.riff,true))}`,`Melodie [Einsatz,MIDI-Ton,Länge]: ${JSON.stringify(compact(context.melody))}`,`Drums [Einsatz,Instrument]: ${JSON.stringify(drums)}`,`Erlaubte MIDI-Tonhöhen: ${bassPitches(context).join(', ')}. step sind ganzzahlige Sechzehntelpositionen 0 bis ${context.bars*16-1}; duration ist eine positive ganze Zahl in Sechzehnteln. Einstimmig, keine doppelten Einsätze, Noten enden spätestens bei Schritt ${context.bars*16}. Antworte nur mit einem JSON-Codeblock.`,JSON.stringify({notes:[{step:0,pitch:bassPitches(context)[0],duration:4},{step:8,pitch:bassPitches(context)[2],duration:4}]})].join('\n');
}

get('toggle-bass').addEventListener('click',()=>commitBass(selected.bass?null:makeBass(config,selected.guitar,selected.drums,bassStyle),'Passend zum Riff'));
get('new-bass').addEventListener('click',()=>commitBass(makeBass(config,selected.guitar,selected.drums,bassStyle),'Eigener Bass'));
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

// Both action bars use the existing handlers and the same availability rules.
function trackActionIds() {
  return ['new-guitar','poly-riff','variation','track-ai-guitar','export-guitar','toggle-lead','new-lead','track-ai-melody','export-lead','toggle-bass','new-bass','open-ai-bass','export-bass','change-drums','new-drums','track-ai-drums','export-drums'];
}
function renderTrackActions() {
  for (const id of trackActionIds()) {
    const source = get(id), button = get('editor-action-' + id);
    button.textContent = source.textContent;
    button.disabled = source.disabled;
    button.hidden = source.hidden;
    if (source.hasAttribute?.('aria-pressed')) button.setAttribute('aria-pressed', source.getAttribute('aria-pressed'));
  }
}
for (const id of trackActionIds()) get('editor-action-' + id).addEventListener('click', () => get(id).click());
renderTrackActions();

function renderTabView() {
  const tracks = {riff: selected.mode === 'riff' ? selected.guitar : null, melody: melodySource(), bass: selected.bass};
  const labels = {riff:'Riff', melody:'Melodie', bass:'Bass'};
  if (!tracks[tabTrack]) tabTrack = tracks.riff ? 'riff' : tracks.melody ? 'melody' : 'bass';
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
  get('tab-tuning').textContent = tabTrack === 'bass' ? 'Bass · Drop D · D–A–D–G' : 'Drop D · D–A–D–G–H–E';
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
get('header-ai-bass').addEventListener('click', () => get('open-ai-bass').click());
