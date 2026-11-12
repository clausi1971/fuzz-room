'use strict';

const arrangementFileLimit = 50 * 1024 * 1024;
let pendingArrangement;
let pendingArrangementDownload;
let lastArrangementName = 'fuzz-room-arrangement';

function projectCheck(condition, message = 'Die Arrangement-Datei enthält ungültige Daten.') {
  if (!condition) throw new Error(message);
}

function projectNumber(value, min, max, integer = false) {
  projectCheck(Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)));
  return value;
}

function projectChoice(value, choices) {
  projectCheck(choices.includes(value));
  return value;
}

function projectText(value, max = 100) {
  projectCheck(typeof value === 'string' && value.trim().length > 0 && value.length <= max);
  return value;
}

function projectNotes(value, count, single, nullable = false, minPitch = 38, maxPitch = 86) {
  if (nullable && value === null) return null;
  projectCheck(Array.isArray(value) && value.length === count);
  return value.map((notes, bar) => {
    projectCheck(Array.isArray(notes) && notes.length <= 16);
    const positions = new Set();
    return notes.map(note => {
      projectCheck(note && typeof note === 'object');
      const step = projectNumber(note.step, 0, 15, true);
      projectCheck(!positions.has(step)); positions.add(step);
      const articulation = projectChoice(note.articulation, single ? ['single'] : ['open', 'mute']);
      const result = {step, root: projectNumber(note.root, minPitch, maxPitch, true),
        length: projectNumber(note.length, .001, single ? count * 16 - bar * 16 - step : 16 - step), articulation};
      if (note.fifth !== undefined) result.fifth = projectNumber(note.fifth, 0, 24, true);
      if (note.transition !== undefined) result.transition = projectChoice(note.transition, ['slide', 'hammer']);
      if (note.from !== undefined) result.from = projectNumber(note.from, 38, 86, true);
      if (result.transition === 'slide') projectCheck(result.from !== undefined);
      if (note.expression !== undefined) result.expression = projectChoice(note.expression, ['bend', 'vibrato']);
      if (note.bendCents !== undefined) result.bendCents = projectNumber(note.bendCents, 0, 1200);
      if (result.expression === 'bend') projectCheck(result.bendCents !== undefined);
      if (note.bendShape !== undefined) {
        result.bendShape = projectChoice(note.bendShape, ['up-return', 'release']);
        projectCheck(result.expression === 'bend' && result.bendCents === 200);
      }
      if (note.voicing !== undefined) {
        projectCheck(Array.isArray(note.voicing) && note.voicing.length > 0 && note.voicing.length <= 6);
        const strings = new Set();
        result.voicing = note.voicing.map(pair => {
          projectCheck(Array.isArray(pair) && pair.length === 2);
          const string = projectNumber(pair[0], 0, 5, true);
          projectCheck(!strings.has(string)); strings.add(string);
          return [string, projectNumber(pair[1], 0, 22, true)];
        });
      }
      if(note.voiceArticulations!==undefined) {
        projectCheck(!single&&note.voiceArticulations&&typeof note.voiceArticulations==='object'&&!Array.isArray(note.voiceArticulations));
        const entries=Object.entries(note.voiceArticulations);projectCheck(entries.length<=6);
        result.voiceArticulations=Object.fromEntries(entries.map(([pitch,value])=>{
          projectCheck(String(Number(pitch))===pitch&&guitarPitches(result).includes(Number(pitch)));
          return [pitch,projectChoice(value,['open','mute'])];
        }));
      }
      if (note.voiceTechniques !== undefined) {
        projectCheck(!single && note.voiceTechniques && typeof note.voiceTechniques==='object' && !Array.isArray(note.voiceTechniques));
        const entries=Object.entries(note.voiceTechniques);projectCheck(entries.length<=6);
        result.voiceTechniques=Object.fromEntries(entries.map(([pitch,t])=>{
          projectCheck(String(Number(pitch))===pitch && guitarPitches(result).includes(Number(pitch)) && t && typeof t==='object');
          const type=projectChoice(t.type,['hammer','pull','bend-half','bend-whole']);
          return [pitch,{type,...(['hammer','pull'].includes(type)?{from:projectNumber(t.from,38,86,true)}:{})}];
        }));
      }
      if (note.voiceEdits !== undefined) {
        projectCheck(note.voiceEdits && typeof note.voiceEdits === 'object' && !Array.isArray(note.voiceEdits));
        const entries = Object.entries(note.voiceEdits);
        projectCheck(entries.length <= 6);
        const pitches = guitarPitches(result);
        result.voiceEdits = Object.fromEntries(entries.map(([pitch, spans]) => {
          projectCheck(Number.isInteger(Number(pitch)) && Number(pitch) >= 38 && Number(pitch) <= 86 && String(Number(pitch)) === pitch
            && Array.isArray(spans) && spans.length <= 16 && (pitches.includes(Number(pitch)) || spans.length === 0));
          let end = 0;
          return [pitch, spans.map(pair => {
            projectCheck(Array.isArray(pair) && pair.length === 2);
            const offset = projectNumber(pair[0], end, 16 - step);
            const length = projectNumber(pair[1], .001, 16 - step - offset);
            end = offset + length;
            return [offset, length];
          })];
        }));
      }
      return result;
    }).sort((a, b) => a.step - b.step);
  });
}

function projectDrums(value, count) {
  projectCheck(Array.isArray(value) && value.length === count);
  return value.map(beats => {
    projectCheck(Array.isArray(beats) && beats.length === 16);
    return beats.map(hits => {
      projectCheck(Array.isArray(hits) && hits.length <= drumVoices.length);
      const kinds = new Set();
      return hits.map(hit => {
        const kind = projectChoice(hit?.kind, drumVoices.map(voice => voice.id));
        projectCheck(!kinds.has(kind)); kinds.add(kind);
        return {kind, velocity: projectNumber(hit.velocity, .001, 1)};
      });
    });
  });
}

function projectDetails(value, field) {
  projectCheck(value && typeof value === 'object');
  if (field === 'bass') return {bassName:projectText(value.bassName ?? 'Bass'),bassStyle:projectChoice(value.bassStyle ?? 'riff',['riff','root','independent'])};
  if (field === 'drums') return {grooveName: projectText(value.grooveName), groove: projectNumber(value.groove, 0, 2, true)};
  const melody = () => ({melodyEdited: Boolean(value.melodyEdited), leadTake: projectNumber(value.leadTake, 0, 2, true)});
  if (field === 'lead') return melody();
  const mode = projectChoice(value.mode, ['riff', 'melody']);
  projectCheck(value.preset === null || value.preset === 0 || value.preset === 1);
  return {guitarName: projectText(value.guitarName), preset: value.preset, polyphonicRiff: Boolean(value.polyphonicRiff), mode,
    ...(mode === 'melody' ? melody() : {})};
}

function readArrangement(text) {
  projectCheck(typeof text === 'string' && text.length <= arrangementFileLimit, 'Die Datei ist zu groß.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Die Datei ist keine gültige Arrangement-Datei.'); }
  projectCheck(value?.format === 'fuzz-room-arrangement', 'Wähle eine mit „Arrangement speichern“ erstellte Fuzz-Room-Datei.');
  projectCheck([1,2].includes(value.version), 'Diese Dateiversion wird noch nicht unterstützt.');
  projectCheck(Array.isArray(value.parts) && value.parts.length > 0 && value.parts.length <= 256);
  const ids = new Set();
  const parts = value.parts.map(part => {
    const id = projectNumber(part?.id, 1, Number.MAX_SAFE_INTEGER - 1, true);
    projectCheck(!ids.has(id)); ids.add(id);
    const p = part.pattern, meta = part.meta;
    projectCheck(p && meta);
    const count = projectChoice(p.guitar?.length, [4, 8, 16]);
    const mode = projectChoice(p.mode, ['riff', 'melody']);
    const pattern = {style: projectChoice(p.style, ['stoner', 'punk', 'hard']),
      melodyStyle: projectChoice(p.melodyStyle, ['desert', 'psych', 'stoner', 'blues']),
      key: projectNumber(p.key, 0, 11, true), scale: projectChoice(p.scale, Object.keys(scales)),
      tempo: projectNumber(p.tempo, 55, 210, true), mode,
      guitar: projectNotes(p.guitar, count, mode === 'melody'), drums: projectDrums(p.drums, count),
      lead: projectNotes(p.lead, count, true, true), bass: projectNotes(p.bass ?? null,count,true,true,26,55)};
    const details = {...projectDetails(meta, 'guitar'), ...projectDetails(meta, 'drums'), ...projectDetails(meta, 'lead'), ...projectDetails(meta, 'bass'),
      style: projectChoice(meta.style, ['stoner', 'punk', 'hard']),
      melodyStyle: projectChoice(meta.melodyStyle, ['desert', 'psych', 'stoner', 'blues']), muteLead: Boolean(meta.muteLead)};
    projectCheck(details.mode === mode);
    const history = Object.fromEntries(['guitar', 'drums', 'lead', 'bass'].map(field => {
      const stored = part.history?.[field] ?? {past: [], future: []};
      const stacks = Object.fromEntries(['past', 'future'].map(stack => {
        projectCheck(Array.isArray(stored[stack]) && stored[stack].length <= 30);
        return [stack, stored[stack].map(snapshot => {
          const details = projectDetails(snapshot?.details, field);
          const data = field === 'bass' ? projectNotes(snapshot.data,count,true,true,26,55) : field === 'drums' ? projectDrums(snapshot.data, count)
            : projectNotes(snapshot.data, count, field === 'lead' || details.mode === 'melody', field === 'lead');
          return {data, details};
        })];
      }));
      return [field, stacks];
    }));
    return {id, name: projectText(part.name, 60), type: projectText(part.type, 60), pattern, meta: details, history};
  });
  projectCheck(ids.has(value.activeSection));
  const levels = Object.fromEntries(mixerChannels.map(channel => [channel, projectNumber(value.mixer?.levels?.[channel] ?? (channel==='bass-volume' && value.version===1?100:undefined), 0, 100)]));
  projectCheck(Array.isArray(value.mixer?.mutes) && value.mixer.mutes.every(channel => mixerChannels.includes(channel) && channel !== 'lead-volume'));
  const guides = Object.fromEntries(['riff', 'melody'].map(track => [track,
    Object.fromEntries(['snare', 'kick'].map(kind => [kind, Boolean(value.view?.guides?.[track]?.[kind])]))]));
  const articulation = projectChoice(value.view?.articulation ?? 'open', ['open', 'mute']);
  return {parts, activeSection: value.activeSection, mixer: {levels, mutes: [...new Set(value.mixer.mutes)]}, view: {guides, articulation},
    locks: {guitar: Boolean(value.locks?.guitar), drums: Boolean(value.locks?.drums)}};
}

function createArrangement() {
  if (chatComparison) throw new Error('Übernimm oder verwerfe zuerst die ChatGPT-Vorschau.');
  saveSection();
  songParts.forEach(sectionHistory);
  const value = {format: 'fuzz-room-arrangement', version: 2, parts: songParts, activeSection,
    mixer: {levels: Object.fromEntries(mixerChannels.map(channel => [channel, Number(get(channel).value)])), mutes: [...mixerMutes]},
    locks: {guitar: get('lock-guitar').checked, drums: get('lock-drums').checked},
    view: {guides: drumGuides, articulation: get('riff-articulation').value}};
  const text = JSON.stringify(value, null, 2);
  projectCheck(new TextEncoder().encode(text).length <= arrangementFileLimit, 'Das Arrangement ist für eine einzelne Datei zu groß.');
  return text;
}

function saveArrangement() {
  try {
    pendingArrangementDownload = createArrangement();
    get('arrangement-filename').value = lastArrangementName;
    get('arrangement-save-dialog').showModal();
    get('arrangement-filename').focus();
    get('arrangement-filename').select();
  } catch (error) { get('arrangement-status').textContent = error.message; }
}

function arrangementFilename(value) {
  const name = value.trim().replace(/\.json$/i, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '');
  return (name || 'fuzz-room-arrangement') + '.json';
}

get('arrangement-save-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!pendingArrangementDownload) return;
  const filename = arrangementFilename(get('arrangement-filename').value);
  const url = URL.createObjectURL(new Blob([pendingArrangementDownload], {type: 'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  lastArrangementName = filename.slice(0, -5);
  pendingArrangementDownload = null;
  get('arrangement-save-dialog').close();
  get('arrangement-status').textContent = `${filename} heruntergeladen – inklusive aller Songteile, Einstellungen und Rückgängig-Verläufe.`;
});
get('arrangement-save-cancel').addEventListener('click', () => {
  pendingArrangementDownload = null;
  get('arrangement-save-dialog').close();
});
get('arrangement-save-dialog').addEventListener('cancel', () => { pendingArrangementDownload = null; });

function loadArrangement(project) {
  if (playback) stop();
  chatComparison = null;
  aiPromptContext = null;
  noteDrag = null;
  suppressGridClick = false;
  songParts = project.parts;
  sectionSerial = Math.max(...songParts.map(part => part.id));
  for (const channel of mixerChannels) get(channel).value = project.mixer.levels[channel];
  mixerMutes.clear();
  project.mixer.mutes.forEach(channel => mixerMutes.add(channel));
  get('lock-guitar').checked = project.locks.guitar;
  get('lock-drums').checked = project.locks.drums;
  for (const track of ['riff', 'melody']) Object.assign(drumGuides[track], project.view.guides[track]);
  get('riff-articulation').value = project.view.articulation;
  renderDrumGuideButtons();
  get('ai-melody-dialog').close();
  get('ai-response').value = '';
  get('ai-prompt-preview').hidden = true;
  get('ai-status').textContent = '';
  setMelodyTool('');
  renderComparison();
  openSection(project.activeSection, {skipSave: true});
  get('arrangement-status').textContent = `${songParts.length} Songteile geladen. Das Arrangement ist wieder vollständig bearbeitbar.`;
}

get('save-arrangement').addEventListener('click', saveArrangement);
get('arrangement-save-current').addEventListener('click', saveArrangement);
get('import-arrangement').addEventListener('click', () => {
  if (playButton.disabled) return;
  get('arrangement-file').value = '';
  get('arrangement-file').click();
});
get('arrangement-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    projectCheck(file.size <= arrangementFileLimit, 'Die Datei ist zu groß (höchstens 50 MB).');
    pendingArrangement = readArrangement(await file.text());
    const parts = pendingArrangement.parts;
    get('arrangement-import-summary').textContent = `${file.name} · ${parts.length} Songteile · ${parts.reduce((sum, part) => sum + part.pattern.guitar.length, 0)} Takte: ${parts.map(part => part.name).join(' → ')}`;
    get('arrangement-import-dialog').showModal();
  } catch (error) {
    pendingArrangement = null;
    get('arrangement-status').textContent = `${error.message} Dein geöffnetes Arrangement bleibt erhalten.`;
  }
});
get('arrangement-import-cancel').addEventListener('click', () => {
  pendingArrangement = null;
  get('arrangement-import-dialog').close();
});
get('arrangement-import-dialog').addEventListener('cancel', () => { pendingArrangement = null; });
get('arrangement-import-confirm').addEventListener('click', () => {
  if (!pendingArrangement || playButton.disabled) return;
  loadArrangement(pendingArrangement);
  pendingArrangement = null;
  get('arrangement-import-dialog').close();
});
