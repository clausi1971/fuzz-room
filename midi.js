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
    bars.forEach((notes, bar) => {
      for (const {step, pitch, length, index} of riffAttacks(notes.filter(note => note.articulation !== 'single'))) {
        const start = (bar * stepsPerBar + step) * ticksPerStep;
        addNote(events, channel, pitch, (step === 0 ? 107 : 92) - index * 10, start, start + Math.round(length * ticksPerStep));
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
    if (only && !tracks[only]) return null;
    const chunks = only
      ? [track(tracks[only][0], [...timing, ...tracks[only][1]])]
      : [track('Fuzz Room', timing), ...Object.values(tracks).map(([name, events]) => track(name, events))];
    const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, only ? 0 : 1, ...bigEndian(chunks.length, 2), ...bigEndian(midiDivision, 2)];
    return new Uint8Array([...header, ...chunks.flat()]);
  }
  
  function downloadMidi(pattern, only) {
    const midi = encodeMidi(pattern, only);
    if (!midi) return;
    const url = URL.createObjectURL(new Blob([midi], {type: 'audio/midi'}));
    const link = document.createElement('a');
    link.href = url;
    const part = {guitar: pattern.mode === 'melody' ? 'melodie' : 'riff', lead: 'melodie', drums: 'drums'}[only] ?? 'loop';
    link.download = `fuzz-room-${part}-${pattern.tempo}bpm.mid`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
