'use strict';

class LoopSound {
  constructor() {
    this.context = new AudioContext();
    this.cache = new Map();
    this.voices = new Set();
    const ctx = this.context;
    this.master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -7;
    limiter.knee.value = 4;
    limiter.ratio.value = 10;
    limiter.attack.value = .003;
    this.master.connect(limiter).connect(ctx.destination);

    this.drumLevel = ctx.createGain();
    this.drumLevel.connect(this.master);
    this.drums = ctx.createGain();
    this.drums.gain.value = 1.245;
    this.drums.connect(this.drumLevel);
    const room = ctx.createConvolver();
    room.buffer = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * .36), ctx.sampleRate);
    for (let side = 0; side < 2; side++) {
      const samples = room.buffer.getChannelData(side);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 4;
      }
    }
    const roomLevel = ctx.createGain();
    roomLevel.gain.value = .16;
    this.drums.connect(room).connect(roomLevel).connect(this.drumLevel);

    this.guitarLevel = ctx.createGain();
    this.guitarLevel.connect(this.master);
    this.vocalLevel = ctx.createGain();
    this.vocalLevel.connect(this.master);
    this.bassLevel = ctx.createGain();
    this.bassLevel.connect(this.master);
    this.bassInput = this.filter('highpass', 22);
    const bassDrive = ctx.createWaveShaper();
    bassDrive.curve = Float32Array.from({length:4097},(_,i)=>Math.tanh((i/2048-1)*2.2));
    bassDrive.oversample = '2x';
    const bassOutput = ctx.createGain();
    bassOutput.gain.value = .58;
    const bassBody=this.filter('peaking',110,.7);bassBody.gain.value=2;
    this.bassInput.connect(bassDrive).connect(bassBody).connect(this.filter('lowpass',1250)).connect(bassOutput).connect(this.bassLevel);

    this.guitars = [-.9, .9].map(pan => {
      const input = this.filter('highpass', 65);
      const fuzz = ctx.createWaveShaper();
      fuzz.curve = Float32Array.from({length: 4097}, (_, i) => Math.tanh((i / 2048 - 1) * 9.5 + .18) - Math.tanh(.18));
      fuzz.oversample = '2x';
      const cab = this.filter('lowpass', pan < 0 ? 2450 : 2850, .8);
      const body = this.filter('peaking', 620, .8);
      body.gain.value = 3;
      const output = ctx.createGain();
      output.gain.value = .27;
      const stereo = ctx.createStereoPanner();
      stereo.pan.value = pan;
      input.connect(fuzz).connect(this.filter('highpass', 55)).connect(body).connect(cab).connect(output).connect(stereo).connect(this.guitarLevel);
      return input;
    });

    this.leadLevel = ctx.createGain();
    this.leadLevel.connect(this.master);
    // Two slightly different performances, narrower than the riff's ±0.9 panorama.
    this.leadInputs=[this.filter('highpass',65),this.filter('highpass',65)];
    this.leadInput=this.leadInputs[0];
    this.leadTone='riff';
    this.leadToneGates=Object.fromEntries(['riff','dark'].map(tone=>{
      const gate=ctx.createGain();gate.gain.value=tone==='riff'?1:0;gate.connect(this.leadLevel);
      this.leadInputs.forEach((input,side)=>{
        const fuzz=ctx.createWaveShaper(),amount=tone==='riff'?9.5:14;
        fuzz.curve=Float32Array.from({length:4097},(_,i)=>Math.tanh((i/2048-1)*amount+.18)-Math.tanh(.18));fuzz.oversample='2x';
        const body=this.filter('peaking',tone==='riff'?620:440,.8);body.gain.value=tone==='riff'?3:5;
        const cab=this.filter('lowpass',tone==='riff'?(side?2850:2450):(side?2200:1900),.8);
        const level=ctx.createGain();level.gain.value=tone==='riff'?.15:.14;
        const pan=ctx.createStereoPanner();pan.pan.value=side?.42:-.42;
        input.connect(fuzz).connect(this.filter('highpass',55)).connect(body).connect(cab).connect(level).connect(pan).connect(gate);
      });
      return [tone,gate];
    }));
    this.leadSustainWave = ctx.createPeriodicWave(new Float32Array(6), Float32Array.of(0, .74, .38, .22, .12, .055));
  }

  filter(type, frequency, resonance = .707) {
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = resonance;
    return filter;
  }

  sample(key, duration, create) {
    if (!this.cache.has(key)) {
      if (this.cache.size >= 96) this.cache.delete(this.cache.keys().next().value);
      const rate = this.context.sampleRate;
      const buffer = this.context.createBuffer(1, Math.ceil(duration * rate), rate);
      create(buffer.getChannelData(0), rate);
      this.cache.set(key, buffer);
    }
    return this.cache.get(key);
  }

  string(note, muted, side) {
    const frequency = 440 * 2 ** ((note - 69) / 12) * (side ? 1.0025 : .9985);
    return this.sample(`g${note}/${muted}/${side}`, muted ? .56 : 2.65, (data, rate) => {
      const pick = side ? .218 : .174;
      const harmonics = 20;
      const levels = Array.from({length: harmonics}, (_, h) => {
        const harmonic = h + 1;
        return Math.sin(Math.PI * harmonic * pick) * (1 - .58 * Math.cos(harmonic * .81)) / harmonic ** 1.22;
      });
      const decay = levels.map((_, h) => Math.exp(-(muted ? 10.5 + h * 1.4 : .95 + h * .5) / rate));
      let previousNoise = 0;
      for (let i = 0; i < data.length; i++) {
        const time = i / rate;
        const bend = 1.1 * Math.sin(time * 22) * Math.min(time, .22);
        let signal = 0;
        for (let h = 0; h < harmonics; h++) {
          const harmonic = h + 1;
          const phase = 2 * Math.PI * frequency * harmonic * (1 + harmonic ** 2 * .000018) * time;
          signal += levels[h] * Math.sin(phase + bend * harmonic + .22 * side * h);
          levels[h] *= decay[h];
        }
        const noise = Math.random() * 2 - 1;
        signal += (noise - previousNoise) * .075 * Math.exp(-time * 260);
        previousNoise = noise;
        data[i] = .47 * signal * Math.min(time / .0024, 1) * Math.min((data.length - i) / 1500, 1);
      }
    });
  }

  guitar(time, voices, stepDuration, velocity) {
    for (let side = 0; side < 2; side++) {
      const onset = time + (side ? .009 : 0) + Math.random() * .004;
      for (const voice of voices) {
        const {note, pitch, index, length, offset} = voice;
        const performed = riffVoiceNote(voice);
        const muted = voice.articulation === 'mute';
        const buffer = this.string(pitch, muted, side);
        const start = onset + (offset ? 0 : index * .0035);
        const duration = length * stepDuration;
        const level = velocity / (1 + index * .36);
        const tail = note.voiceEdits?.[pitch] ? .012 : .032;
        const source=this.voice(buffer, start, duration, performed.transition ? level*.78 : level, this.guitars[side], Boolean(performed.transition), tail);
        const sustain=!muted && duration>1.7 ? this.sustainString(start,pitch,duration,this.guitars[side],side,.09*level,tail) : null;
        for(const sourceVoice of sustain?[source,sustain]:[source]) for(const [step,cents] of leadPitchCurve(performed,stepDuration)) {
          if(step===0) sourceVoice.detune.setValueAtTime(cents,start);
          else sourceVoice.detune.linearRampToValueAtTime(cents,start+step*stepDuration);
        }
      }
    }
  }

  lead(time, note, stepDuration) {
    const legato = Boolean(note.transition);
    const length = note.length * stepDuration;
    const curve = leadPitchCurve(note, stepDuration);
    for(let side=0;side<2;side++){
      const start=time+(side?.007:0),input=this.leadInputs[side];
      const source=this.voice(this.string(note.root,false,side),start,length,legato?.71:.79,input,legato);
      const sustain=length>1.7?this.sustainString(start,note.root,length,input,side,.07):null;
      for (const voice of sustain ? [source, sustain] : [source]) {
      for (const [step, cents] of curve) {
        if (step === 0) voice.detune.setValueAtTime(cents, start);
        else voice.detune.linearRampToValueAtTime(cents, start + step * stepDuration);
      }
      }
    }
  }

  setLeadTone(tone='riff'){
    if(!this.leadToneGates[tone]||this.leadTone===tone)return;
    this.leadTone=tone;
    for(const [name,gate] of Object.entries(this.leadToneGates))gate.gain.setTargetAtTime(name===tone?1:0,this.context.currentTime,.025);
  }

  setVocalTone(tone='ah'){this.vocalTone=tone==='guide'?'guide':'ah';}

  vocal(time,note,stepDuration) {
    const ctx=this.context,length=note.length*stepDuration;
    const oscillator=ctx.createOscillator();oscillator.type=this.vocalTone==='guide'?'triangle':'sawtooth';oscillator.frequency.value=440*2**((note.root-69)/12);
    const envelope=ctx.createGain(),attack=Math.min(.07,length*.2),release=Math.min(.14,length*.3);
    envelope.gain.setValueAtTime(0,time);envelope.gain.linearRampToValueAtTime(.09,time+attack);
    envelope.gain.setValueAtTime(.09,time+length-release);envelope.gain.linearRampToValueAtTime(0,time+length);
    envelope.connect(this.vocalLevel);
    if(this.vocalTone==='guide'){
      oscillator.connect(envelope);this.trackVoice(oscillator);oscillator.start(time);oscillator.stop(time+length+.02);return;
    }
    for(const [frequency,level] of [[800,1],[1150,.6],[2900,.25]]) {
      const formant=this.filter('bandpass',frequency,7),gain=ctx.createGain();gain.gain.value=level;
      oscillator.connect(formant).connect(gain).connect(envelope);
    }
    const vibrato=ctx.createOscillator(),depth=ctx.createGain();vibrato.frequency.value=5.3;depth.gain.value=10;
    vibrato.connect(depth).connect(oscillator.detune);
    this.trackVoice(oscillator);this.trackVoice(vibrato);
    oscillator.start(time);vibrato.start(time);oscillator.stop(time+length+.02);vibrato.stop(time+length+.02);
  }

  bass(time, note, stepDuration) {
    const length = note.length * stepDuration;
    this.voice(this.string(note.root, false, 0), time, length, .85, this.bassInput);
    if (length > 1.7) this.sustainString(time, note.root, length, this.bassInput, 0, .13);
  }

  sustainString(time, pitch, length, output, side = 0, level = .11, tail = .05) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.setPeriodicWave(this.leadSustainWave);
    oscillator.frequency.value = 440 * 2 ** ((pitch - 69) / 12) * (side ? 1.0025 : .9985);
    gain.gain.setValueAtTime(0, time + .34);
    gain.gain.linearRampToValueAtTime(level, time + 1.25);
    gain.gain.linearRampToValueAtTime(level * .77, time + length);
    gain.gain.linearRampToValueAtTime(0, time + length + tail);
    oscillator.connect(gain).connect(output);
    this.trackVoice(oscillator);
    oscillator.start(time);
    oscillator.stop(time + length + tail);
    return oscillator;
  }

  drumSample(kind, take) {
    const durations = {kick: .46, snare: .48, hat: .15, open: .55, crash: 1.85, 'tom-high': .47, 'tom-mid': .56, tom: .66};
    return this.sample(`${kind}${take}`, durations[kind], (data, rate) => {
      const metal = [2903, 3431, 4217, 5327, 6883, 7639];
      let phase = 0;
      let low = 0;
      let high = 0;
      for (let i = 0; i < data.length; i++) {
        const time = i / rate;
        const noise = Math.random() * 2 - 1;
        low += .22 * (noise - low);
        high += .06 * (noise - high);
        let sound;
        if (kind === 'kick' || kind.startsWith('tom')) {
          const base = ({kick:48,'tom-high':160,'tom-mid':123,tom:88}[kind]) + take * 1.3;
          phase += 2 * Math.PI / rate * (base + 76 * Math.exp(-time * 43));
          const decay = kind === 'kick' ? 10 : 7;
          sound = .9 * Math.sin(phase) * Math.exp(-time * decay)
            + .19 * Math.sin(phase * 1.98) * Math.exp(-time * 33)
            + (noise - high) * .28 * Math.exp(-time * 170);
        } else if (kind === 'snare') {
          const shell = Math.sin(2 * Math.PI * (205 + take * 5) * time) + .39 * Math.sin(2 * Math.PI * 385 * time);
          sound = .38 * shell * Math.exp(-time * 30)
            + (.72 * (noise - low) + .52 * (low - high)) * Math.exp(-time * 14);
        } else {
          const decay = kind === 'hat' ? 43 : kind === 'open' ? 12 : 3.8;
          const shimmer = metal.reduce((sum, hz) => sum + Math.sin(2 * Math.PI * (hz + take * 19) * time), 0);
          sound = (.58 * (noise - low) + .05 * shimmer) * Math.exp(-time * decay);
        }
        data[i] = sound * Math.min(time / .0015, 1) * Math.min((data.length - i) / 750, 1);
      }
    });
  }

  drum(time, kind, velocity) {
    const take = Math.floor(Math.random() * 3);
    const buffer = this.drumSample(kind, take);
    const positions = {kick: 0, snare: .04, hat: -.29, open: -.29, 'tom-high':-.2, 'tom-mid':.08, tom: .33, crash: .52};
    const panner = this.context.createStereoPanner();
    panner.pan.value = positions[kind];
    panner.connect(this.drums);
    const source = this.voice(buffer, time, buffer.duration, velocity, panner);
    source.addEventListener('ended', () => panner.disconnect(), {once: true});
  }

  trackVoice(source) {
    this.voices.add(source);
    source.addEventListener('ended', () => this.voices.delete(source), {once: true});
  }

  voice(buffer, time, length, velocity, output, legato = false, tail = .032) {
    const source = this.context.createBufferSource();
    this.trackVoice(source);
    const gain = this.context.createGain();
    const offset = legato ? .018 : 0;
    const release = Math.min(length + tail, buffer.duration - offset);
    source.buffer = buffer;
    gain.gain.setValueAtTime(legato ? 0 : velocity, time);
    if (legato) gain.gain.linearRampToValueAtTime(velocity, time + .012);
    gain.gain.setValueAtTime(velocity, time + Math.min(length, release - .015));
    gain.gain.linearRampToValueAtTime(0, time + release);
    source.connect(gain).connect(output);
    source.start(time, offset);
    source.stop(time + release);
    return source;
  }

  setVolume(value) {
    this.master.gain.setTargetAtTime(value, this.context.currentTime, .012);
  }

  setTrackLevels(guitar, drums, lead, bass = 1, vocal = .8) {
    const now = this.context.currentTime;
    this.guitarLevel.gain.setTargetAtTime(guitar, now, .012);
    this.drumLevel.gain.setTargetAtTime(drums, now, .012);
    this.leadLevel.gain.setTargetAtTime(lead, now, .012);
    this.bassLevel.gain.setTargetAtTime(bass, now, .012);
    this.vocalLevel.gain.setTargetAtTime(vocal, now, .012);
  }

  stop() {
    this.setVolume(0);
    const end = this.context.currentTime + .035;
    for (const source of this.voices) source.stop(end);
  }
}
