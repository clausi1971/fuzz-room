'use strict';

// Original phrase families, informed by the interviews documented in docs/stoner-research.md.
const stonerProfiles = {
  classic: {name:'Klassischer Stoner',description:'Schwerer Groove, wiederkehrende Motive, offene Antworten und bewusste Pausen.',muted:.58,gate:6,
    riff:[[0,3,6,10,14],[0,4,7,10],[0,2,6,8,13],[0,5,8,11,14],[0,3,8,12],[0,4,6,11,14],[0,2,7,10,13],[0,6,8,14],[0,3,5,10,12],[0,4,9,12,15],[0,2,4,8,11,14],[0,5,9,13]],
    kick:[[0,6,8,14],[0,3,8,11],[0,5,8,14],[0,6,10],[0,2,8,13],[0,7,8,14],[0,4,9,14],[0,3,6,12]],
    phrase:[[0,5,9],[1,6,10],[0,4,8,13],[2,7,11],[0,6,12],[0,3,8,11],[1,5,10,14],[0,7,10,13]],
    bass:[[0,6,8],[0,4,10],[0,7,12],[0,3,8,14],[0,8],[0,5,11,14],[0,6,10,13],[0,4,8,12]]},
  desert: {name:'Desert Rock',description:'Rollende Synkopen, Blues-Bewegungen, trockene Akzente und Antworten zwischen Riff und Gesang.',muted:.46,gate:4.5,
    riff:[[0,3,6,8,11,14],[0,2,5,8,10,13],[0,3,7,10,14],[0,2,6,9,12,14],[0,5,7,10,13],[0,3,6,11,14],[0,2,4,7,10,14],[0,4,6,9,13],[0,3,8,10,15],[0,2,5,9,12],[0,4,7,11,14],[0,3,5,8,12,15]],
    kick:[[0,3,8,11],[0,6,8,13],[0,3,7,10],[0,5,8,14],[0,2,8,11],[0,7,10,14],[0,3,6,9],[0,5,10,13]],
    phrase:[[1,4,7,11],[0,3,8,12],[2,5,9,13],[0,6,10],[1,5,8,14],[0,3,7,10,14],[2,6,11],[0,5,9,12]],
    bass:[[0,3,8,11],[0,6,10,14],[0,2,7,11],[0,5,8,13],[0,3,6,12],[0,7,10],[0,4,9,14],[0,2,8,12]]},
  doom: {name:'Doom Stoner',description:'Wenige schwere Einsätze, lange Töne, große Atempausen und häufig ein Halftime-Backbeat.',muted:.27,gate:9,
    riff:[[0,8],[0,6,12],[0,4,12],[0,10],[0,7,12],[0,4,8],[0,9,14],[0,5,11],[0,8,14],[0,3,10],[0,6,14],[0,4,10,14]],
    kick:[[0,10],[0,6],[0,8,14],[0,4,12],[0,7],[0,11],[0,5,12],[0,6,14]],
    phrase:[[0,9],[2,10],[0,6,12],[3,11],[0,8],[1,7,12],[4,11],[0,5,10]],
    bass:[[0,8],[0,10],[0,6],[0,4,12],[0,9,14],[0,7,12],[0,11],[0,5,13]]},
  psych: {name:'Psych Stoner',description:'Hypnotische Motive, versetzte Akzente, lange Antworten und schrittweise Veränderungen über mehrere Takte.',muted:.35,gate:7.5,
    riff:[[0,3,7,10,14],[0,5,8,13],[0,3,6,9,12],[0,4,7,11,14],[0,2,7,10],[0,5,9,12],[0,3,8,11,15],[0,4,9,13],[0,2,6,11,14],[0,6,10,13],[0,3,5,10,14],[0,4,8,11]],
    kick:[[0,6,11],[0,5,10],[0,3,9,14],[0,7,12],[0,4,10,14],[0,6,9,13],[0,5,11,14],[0,3,8,13]],
    phrase:[[1,7,12],[0,5,11],[3,8,13],[0,4,10,14],[2,6,12],[1,5,9,13],[0,7,11],[2,8,14]],
    bass:[[0,6,11],[0,5,10],[0,7,12],[0,3,9,14],[0,4,11],[0,6,10,14],[0,5,9,13],[0,8,13]]}
};
const phraseContours = [[0,1,2,0],[0,2,1,-1],[0,-1,-2,0],[0,0,2,1],[0,1,-1,0],[0,2,3,1],[0,-2,-1,1],[0,1,0,-2],[0,3,2,0],[0,-1,1,2],[0,2,0,1],[0,-2,0,-1],[0,1,3,2],[0,-1,-3,-1],[0,0,-1,1],[0,2,1,0]];
const stonerProgressions = [[0,0,3,0],[0,2,0,5],[0,3,0,4],[0,0,5,3],[0,4,3,0],[0,2,5,0],[0,5,3,0],[0,0,2,4]];
const stonerFills = [[12,14,15],[10,12,14,15],[11,12,14,15],[8,10,12,14,15],[9,11,13,14,15],[10,11,12,14],[8,11,13,15],[11,13,14,15],[7,10,12,14,15],[9,12,14,15],[10,12,13,14,15],[8,9,12,14]];
let compositionSerial=0;
const recentCompositions=new Map();
const choose=(values,random)=>values[Math.floor(random()*values.length)];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
function stonerProfile(config) {return stonerProfiles[config.stonerStyle]??stonerProfiles.classic;}
function freshComposition(kind,config,count,build,previous=null) {
  const key=[kind,config.style,config.stonerStyle??'classic',config.key,config.scale,config.melodyStyle,count].join('/');
  const fingerprint=bars=>JSON.stringify(kind==='drums'?bars.map(beats=>beats.map(hits=>hits.map(hit=>hit.kind).sort())):bars);
  const recent=recentCompositions.get(key)??[];
  const before=previous?fingerprint(previous):null;
  let result,signature;
  for(let attempt=0;attempt<12;attempt++) {
    let seed=(Math.floor(Math.random()*4294967296)^Math.imul(++compositionSerial,0x9e3779b1))>>>0;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
    result=build(random);signature=fingerprint(result);
    if(signature!==before&&!recent.includes(signature))break;
  }
  recentCompositions.delete(key);recentCompositions.set(key,[...recent.slice(-7),signature]);
  if(recentCompositions.size>64)recentCompositions.delete(recentCompositions.keys().next().value);
  return result;
}
function varyRhythm(steps,random,ending=false) {
  let result=steps.slice();
  if(ending&&result.length>2)result=result.slice(0,Math.max(2,result.length-1));
  else if(random()<.55&&result.length>2) {
    const i=1+Math.floor(random()*(result.length-1));
    result[i]=clamp(result[i]+choose([-1,1],random),1,15);
  }
  return [...new Set(result)].sort((a,b)=>a-b);
}
function makeStonerRiff(config,decorate=true) {
  const profile=stonerProfile(config),scale=intervals(config.scale),root=tonic(config.key),count=config.bars??4,options=riffGenerationOptions(config);
  return freshComposition('riff',config,count,random=>{
    const rhythm=choose(profile.riff,random),answer=choose(profile.riff,random),contour=choose(phraseContours,random),progression=choose(stonerProgressions,random);
    const bars=Array.from({length:count},(_,bar)=>{
      const steps=bar%4===0||bar%4===2?varyRhythm(rhythm,random):varyRhythm(answer,random,bar===count-1);
      return steps.map((step,i)=>{
        const development=bar>=4&&i>0&&random()<.3?choose([-1,1],random):0;
        const degree=i===0?progression[bar%4]:(progression[bar%4]+contour[i%contour.length]+development+scale.length)%scale.length;
        let pitch=root+scale[degree%scale.length];while(pitch>57)pitch-=12;while(pitch<38)pitch+=12;
        if(bar===count-1&&i===steps.length-1&&random()<.7)pitch=root;
        const articulation=!options.open?'mute':!options.pm?'open':random()<profile.muted?'mute':'open';
        const gap=(steps[i+1]??16)-step;
        const fifth=[7,6,8,5,4,3].find(interval=>scale.includes((pitch-config.key+interval+120)%12));
        return {step,root:pitch,length:Math.max(.5,Math.min(gap-.18,articulation==='mute'?choose([.8,1.2,1.6],random):profile.gate*(.6+random()*.4))),articulation,fifth};
      });
    });
    return decorate?decorateRiff(bars,config):bars;
  });
}
function makeStonerDrums(config,guitar,variation=0) {
  const profile=stonerProfile(config);
  return freshComposition('drums',config,guitar.length,random=>{
    const motif=choose(profile.kick,random),answer=choose(profile.kick,random),fill=choose(stonerFills,random);
    const half=config.stonerStyle==='doom'?random()<.8:variation===2||random()<.1;
    const hats=choose(config.stonerStyle==='doom'?[[0,4,8,12],[0,4,8,12],[0,2,4,6,8,10,12,14]]:[[0,2,4,6,8,10,12,14],[0,2,4,6,8,10,12,14],[0,4,8,12],[0,3,4,6,8,11,12,14]],random);
    return guitar.map((notes,bar)=>{
      const beats=Array.from({length:16},()=>[]),ending=bar%4===3;
      const add=(step,kind,velocity)=>{if(step>=0&&step<16&&!beats[step].some(hit=>hit.kind===kind))beats[step].push({kind,velocity:clamp(velocity,.05,1)});};
      const riffAccent=notes.filter(note=>note.step>0&&note.step<15).map(note=>note.step);
      const kicks=[...(bar%2?answer:motif),...(riffAccent.length&&random()<.8?[choose(riffAccent,random)]:[])];
      for(const step of kicks)add(step,'kick',step%4===0?.92:.73+random()*.08);
      for(const step of half?[8]:[4,12])add(step,'snare',.79+random()*.08);
      if(config.stonerStyle!=='doom'&&random()<.38)add(choose([3,7,11,15],random),'snare',.22+random()*.08);
      for(const step of hats)if(!(bar===0&&step===0)&&!(ending&&step>=12))add(step,variation===1&&step%4===2?'open':'hat',step%4===0?.44:.25+random()*.08);
      if(bar===0)add(0,'crash',.68);
      if(ending){const endingFill=bar<4?fill:choose(stonerFills,random);endingFill.forEach((step,i)=>add(step,i===endingFill.length-1?'tom':i%2?'tom-mid':'tom-high',.65+random()*.18));}
      return beats;
    });
  });
}
function harmonicPitches(config,riff,bar,step,pitches) {
  const chord=riff?.[bar]?.findLast(note=>note.step<=step)??riff?.[bar]?.[0];
  const classes=chord?guitarPitches(chord).map(pitch=>pitch%12):[config.key];
  const matching=pitches.filter(pitch=>classes.includes(pitch%12));
  return matching.length?matching:pitches;
}
function pitchedPhrase(config,riff,pitches,random,vocal=false,drums=null) {
  const profile=stonerProfile(config),count=riff?.length??config.bars??4;
  const bank=config.style==='punk'?[[0,4,8,12],[0,2,6,8,12],[1,4,7,10,13],[0,3,6,10,14],[2,5,8,12]]:config.style==='hard'?[[0,4,8,12],[1,5,9,13],[0,3,8,11],[2,6,10],[0,5,10,14]]:profile.phrase;
  const motif=choose(bank,random),answer=choose(bank,random),contour=choose(phraseContours,random);
  const center=Math.floor(pitches.length*(.3+random()*.35));
  let previous;
  return Array.from({length:count},(_,bar)=>{
    const ending=bar===count-1;
    let rhythm=bar%4===0||bar%4===2?varyRhythm(motif,random,ending):varyRhythm(answer,random,ending);
    if(vocal&&random()<.65) {
      const anchors=[...new Set([...(riff?.[bar]?.map(note=>note.step)??[]),...(drums?.[bar]?.flatMap((hits,step)=>hits.some(hit=>hit.kind==='kick')?[step]:[])??[])])].filter(step=>step<=3&&step<(rhythm[1]??16));
      if(anchors.length)rhythm=[...new Set([choose(anchors,random),...rhythm.slice(1)])].sort((a,b)=>a-b);
    }
    return rhythm.map((step,i)=>{
      const preferred=pitches[clamp(center+contour[i%contour.length]+(bar%2?choose([-1,0,1],random):0),0,pitches.length-1)];
      let pool=pitches.filter(pitch=>previous===undefined||Math.abs(pitch-previous)<=7);
      if(i===0||ending&&i===rhythm.length-1) {
        const chord=ending&&i===rhythm.length-1?pool.filter(pitch=>pitch%12===config.key):harmonicPitches(config,riff,bar,step,pool);
        if(chord.length)pool=chord;
      }
      pool=pool.toSorted((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred));
      const root=choose(pool.slice(0,Math.min(2,pool.length)),random),gap=(rhythm[i+1]??16)-step;
      const breath=vocal?choose([.5,.75,1,1.5,2],random):choose([.15,.3,.5,.75],random);
      const cap=vocal?(config.stonerStyle==='doom'?9:7):9.4;
      const length=Math.max(.5,Math.min(cap,Math.round((gap-breath)*4)/4));
      const note={step,root,length,articulation:'single'};
      if(!vocal) {
        const delta=previous===undefined?0:root-previous;
        if(delta>0&&delta<=4&&random()<.24)note.transition='hammer';
        else if(delta!==0&&Math.abs(delta)<=7&&random()<.14){note.transition='slide';note.from=previous;}
        if(length>=1.5&&random()<(config.melodyStyle==='blues'?.35:.22)){note.expression='bend';note.bendCents=config.stonerStyle==='psych'?100:200;note.bendShape=note.bendCents===200&&random()<.5?'up-return':undefined;}
        else if(length>3&&random()<.35)note.expression='vibrato';
      }
      previous=root;return note;
    });
  });
}
function makeStonerLead(config,riff,take=0) {
  let pitches=melodyPitches(config).filter(pitch=>pitch>=66&&pitch<=83);
  if(config.melodyStyle==='blues'||config.melodyStyle==='desert') {
    const tones=[0,3,5,6,7,10];const filtered=pitches.filter(pitch=>tones.includes((pitch-config.key+120)%12));if(filtered.length>=4)pitches=filtered;
  }
  return freshComposition('lead',config,riff?.length??config.bars??4,random=>pitchedPhrase(config,riff,pitches,random));
}
function makeStonerBass(config,guitar,drums,behavior='riff') {
  const profile=stonerProfile(config),pitches=bassPitches(config);
  return freshComposition('bass-'+behavior,config,guitar.length,random=>{
    const motif=choose(profile.bass,random),answer=choose(profile.bass,random),contour=choose(phraseContours,random);
    return guitar.map((notes,bar)=>{
      const kicks=drums[bar].flatMap((hits,step)=>hits.some(hit=>hit.kind==='kick')?[step]:[]);
      const rhythm=behavior==='riff'?[...new Set(notes.map(note=>note.step))]:[...new Set([...(bar%2?answer:motif),...(behavior==='independent'&&kicks.length?[choose(kicks,random)]:[])])].sort((a,b)=>a-b);
      return rhythm.map((step,i)=>{
        const chord=notes.findLast(note=>note.step<=step)??notes[0];
        let target=behavior==='root'?26+(config.key+10)%12:(chord?.root??tonic(config.key))-12;
        while(target<26)target+=12;while(target>55)target-=12;
        const home=pitches.reduce((best,pitch)=>Math.abs(pitch-target)<Math.abs(best-target)?pitch:best,pitches[0]);
        let root=home;
        if(behavior==='independent')root=pitches[clamp(pitches.indexOf(home)+contour[i%contour.length],0,pitches.length-1)];
        else if(behavior==='riff'&&i>0&&random()<.18){const octave=pitches.filter(pitch=>pitch%12===home%12&&pitch!==home);if(octave.length)root=choose(octave,random);}
        const gap=(rhythm[i+1]??16)-step;
        return {step,root,length:Math.max(.5,Math.min(gap-choose([.15,.35,.75,1],random),config.stonerStyle==='doom'?8:behavior==='root'?7.8:4.5)),articulation:'single'};
      });
    });
  });
}
function makeFreshVocal(config,riff,drums,range='mid',previous=null) {
  return freshComposition('vocal-'+range,config,riff.length,random=>pitchedPhrase(config,riff,vocalPitches(config,range),random,true,drums),previous);
}
function stonerPromptGuidance(context) {
  if((context.musicStyle??context.style)!=='stoner')return '';
  const p=stonerProfile(context);
  return '\nStoner-Unterstil für alle neuen Spuren: '+p.name+'. '+p.description+' Entwickle ein eigenes Grundmotiv mit Wiedererkennung, eine Antwort, kleine rhythmische Veränderungen und einen Abschluss. Riff und Kick teilen wichtige Akzente; Bass lässt bewusste Pausen und trägt den Groove. Die Lead-Gitarre antwortet statt jede Gesangsphrase zu verdoppeln. Gesang bleibt singbar, mit Atempausen und neuer Tonfolge und neuem Rhythmus. Über 8/16 Takte weiterentwickeln, keine starre Vier-Takt-Kopie. Halte Tempo, Tonart, Stimmlage und die erlaubten Rifftechniken ein.';
}
