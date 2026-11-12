'use strict';

const midiDivision = 480;
const ticksPerStep = midiDivision / 4;
const slideRange = 12;

function variableLength(value) {
  const bytes = [value & 0x7f];
  while ((value >>= 7) > 0) bytes.unshift((value & 0x7f) | 0x80);
  return bytes;
}

function bigEndian(value, count) {
  return Array.from({length: count}, (_, index) => (value >>> (8 * (count - 1 - index))) & 0xff);
}

function midiTrack(name, events, steps = loopSteps) {
  const title = Array.from(new TextEncoder().encode(name));
  const data = [0, 0xff, 0x03, ...variableLength(title.length), ...title];
  let position = 0;
  for (const event of events.sort((a, b) => a.tick - b.tick || a.order - b.order)) {
    data.push(...variableLength(event.tick - position), ...event.bytes);
    position = event.tick;
  }
  data.push(...variableLength(steps * ticksPerStep - position), 0xff, 0x2f, 0);
  return [0x4d, 0x54, 0x72, 0x6b, ...bigEndian(data.length, 4), ...data];
}

function encodeMidi(pattern, only) {
  const track = (name, events) => midiTrack(name, events, pattern.guitar.length * stepsPerBar);
  const tempo = Math.round(60000000 / pattern.tempo);
  const timing = [
    {tick: 0, order: 0, bytes: [0xff, 0x51, 3, ...bigEndian(tempo, 3)]},
    {tick: 0, order: 1, bytes: [0xff, 0x58, 4, 4, 2, 24, 8]},
  ];
  const drums = [];
  const addNote = (track, channel, pitch, velocity, start, end) => {
    track.push({tick: start, order: 2, bytes: [0x90 + channel, pitch, velocity]});
    track.push({tick: end, order: 1, bytes: [0x80 + channel, pitch, 0]});
  };
  const guitarEvents = (bars, channel, patch) => {
    const events = [{tick: 0, order: 0, bytes: [0xc0 + channel, patch]}];
    if (bars.some(notes => notes.some(note => note.transition === 'slide' || note.expression))) {
      for (const [control, value] of [[101, 0], [100, 0], [6, slideRange], [38, 0], [101, 127], [100, 127]]) {
        events.push({tick: 0, order: 0, bytes: [0xb0 + channel, control, value]});
      }
    }
    const independent = bars.some(notes=>notes.some(note=>Object.keys(note.voiceTechniques??{}).length));
    const techniqueChannels=[3,4,5,6,7,8,10,11,12,13,14];
    const channelEnds=Object.fromEntries(techniqueChannels.map(ch=>[ch,0]));
    if(independent) for(const ch of techniqueChannels) {
      events.push({tick:0,order:0,bytes:[0xc0+ch,patch]});
      for(const [cc,value] of [[101,0],[100,0],[6,slideRange],[38,0],[101,127],[100,127]]) events.push({tick:0,order:0,bytes:[0xb0+ch,cc,value]});
    }
    bars.forEach((notes, bar) => {
      for (const voice of riffAttacks(notes.filter(note => note.articulation !== 'single')).sort((a,b)=>a.step-b.step||a.index-b.index)) {
        const {step,pitch,length,index,note}=voice;
        const start = (bar * stepsPerBar + step) * ticksPerStep;
        const performed=riffVoiceNote(voice), end=start+Math.round(length*ticksPerStep);
        const hasTechnique=Boolean(note.voiceTechniques?.[pitch]);
        const ch=hasTechnique?techniqueChannels.find(ch=>channelEnds[ch]<=start):channel;
        if(ch===undefined) throw new Error('Zu viele gleichzeitige Riff-Spieltechniken für den MIDI-Export.');
        if(hasTechnique) channelEnds[ch]=end;
        addNote(events,ch,pitch,(performed.transition?76:step===0?107:92)-index*10,start,end);
        if(performed.transition) {
          events.push({tick:start,order:1.5,bytes:[0xb0+ch,68,127]},{tick:end,order:1,bytes:[0xb0+ch,68,0]});
        }
        const curve=leadPitchCurve(performed,15/pattern.tempo);
        if(curve.length) {
          const points=[];
          curve.forEach(([step,cents],i)=>{
            const previous=curve[i-1];
            if(previous) {const count=Math.ceil((step-previous[0])/.18);for(let j=1;j<count;j++)points.push([previous[0]+(step-previous[0])*j/count,previous[1]+(cents-previous[1])*j/count]);}
            points.push([step,cents]);
          });
          for(const [step,cents] of points) {const value=Math.round(8192+8191*cents/(slideRange*100));events.push({tick:start+Math.round(step*ticksPerStep),order:1.5,bytes:[0xe0+ch,value&127,value>>7]});}
          events.push({tick:end,order:1.2,bytes:[0xe0+ch,0,64]});
        }
      }
      for (const note of notes.filter(note => note.articulation === 'single')) {
        const start = (bar * stepsPerBar + note.step) * ticksPerStep;
        const end = start + Math.round(note.length * ticksPerStep);
        const velocity = note.transition ? 76 : note.step === 0 ? 107 : 92;
        addNote(events, channel, note.root, velocity, start, end);
        const addBend = (step, cents) => {
          const value = Math.round(8192 + 8191 * cents / (slideRange * 100));
          const tick = start + Math.round(ticksPerStep * step);
          events.push({tick, order: 1.5, bytes: [0xe0 + channel, value & 0x7f, value >> 7]});
        };
        const curve = leadPitchCurve(note, 15 / pattern.tempo);
        curve.forEach(([step, cents], index) => {
          const previous = curve[index - 1];
          if (previous && previous[1] !== cents) {
            const span = step - previous[0];
            const samples = Math.ceil(span / .18);
            for (let sample = 1; sample < samples; sample++) {
              const fraction = sample / samples;
              addBend(previous[0] + span * fraction, previous[1] + (cents - previous[1]) * fraction);
            }
          }
          addBend(step, cents);
        });
        }
      });
      return events;
    };
    pattern.drums.forEach((beats, bar) => beats.forEach((hits, step) => {
      const start = (bar * stepsPerBar + step) * ticksPerStep;
      hits.forEach(hit => addNote(drums, 9, drumVoice[hit.kind].midi, Math.round(hit.velocity * 127), start, start + 60));
    }));
    const tracks = {
      guitar: [pattern.mode === 'melody' ? 'Melodie' : 'Riff', guitarEvents(pattern.guitar, 0, 30)],
      drums: ['Drums', drums],
    };
    if (pattern.lead) tracks.lead = ['Melodie', guitarEvents(pattern.lead, 1, 29)];
    if (pattern.bass) tracks.bass = ['Bass', guitarEvents(pattern.bass, 2, 33)];
    if (pattern.vocal) tracks.vocal = ['Gesang', guitarEvents(pattern.vocal, 15, 52)];
    if (only && !tracks[only]) return null;
    const chunks = only
      ? [track(tracks[only][0], [...timing, ...tracks[only][1]])]
      : [track('Fuzz Room', timing), ...Object.values(tracks).map(([name, events]) => track(name, events))];
    const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, only ? 0 : 1, ...bigEndian(chunks.length, 2), ...bigEndian(midiDivision, 2)];
    return new Uint8Array([...header, ...chunks.flat()]);
  }
  
  let pendingMidi;
  function downloadMidi(pattern, only) {
    const midi = encodeMidi(pattern, only);
    if (!midi) return;
    const part = {guitar:pattern.mode==='melody'?'melodie':'riff',lead:'melodie',drums:'drums',bass:'bass',vocal:'gesang'}[only]??'alle-spuren';
    pendingMidi = midi;
    document.getElementById('midi-filename').value = 'fuzz-room-'+part+'-'+pattern.tempo+'bpm';
    document.getElementById('midi-export-dialog').showModal();
    document.getElementById('midi-filename').focus();
    document.getElementById('midi-filename').select();
  }
  function midiFilename(value) {
    const name = value.trim().replace(/\.midi?$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'');
    return (name || 'fuzz-room') + '.mid';
  }
  document.getElementById('midi-export-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!pendingMidi) return;
    const url = URL.createObjectURL(new Blob([pendingMidi],{type:'audio/midi'}));
    const link = document.createElement('a');link.href=url;link.download=midiFilename(document.getElementById('midi-filename').value);link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);pendingMidi=null;document.getElementById('midi-export-dialog').close();
  });
  function cancelMidiExport(){pendingMidi=null;document.getElementById('midi-export-dialog').close();}
  document.getElementById('midi-export-cancel').addEventListener('click',cancelMidiExport);
  document.getElementById('midi-export-dialog').addEventListener('cancel',()=>{pendingMidi=null;});
