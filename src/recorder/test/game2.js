const E=require('../src/engine.js');
const m=E.newMatch(['FatCloud','雷靈使'],0);
const T=(...acts)=>({actions:acts,ended:true});
const f=(form,cards,extra)=>Object.assign({kind:'formation',form,cards},extra||{});
const d=c=>({kind:'discard',card:c});
m.turns=[
 T({kind:'pouch',card:'金1',strat:'還魂'},{kind:'job',job:'獨行客',cards:['金3']},d('金4')),
 T(f('虛空碎靈術',['金3','火3','水3']),d('火1')),
 T({kind:'job',job:'毒師',cards:['水1','土1']},d('金3')),
 T({kind:'job',job:'初行客',cards:['土1']},d('木1')),
 T(f('震暴',['火5','火5','水5','土5']),d('火5')),
 T({kind:'pouch',card:'水1',strat:'混水'},f('震暴',['火5','火2','水4','土5']),d('水3')),
 T(f('水擊術',['水5']),d('木4')),
 T({kind:'job',job:'法師',cards:['火3']},d('土3')),
 T(f('金靈喚術',['金1','金5']),d('金2')),
 T(f('虛空碎靈術',['金3','火3','水3']),d('火1')),
 T(f('土擊術',['土1']),d('木5')),
 T(f('樸木',['木5','木5','木4']),d('火5')),
 T({kind:'cover',cards:['土1','火4'],form:'空城'},d('水1')),
 T(f('虛空碎靈術',['木3','木3','金3'])),
];
const r=E.replay(m);
r.turns.forEach(t=>{const a=t.after;console.log(String(t.i+1).padStart(2),t.acts.map(x=>x.text+(x.notes.length?' 〔'+x.notes.join('；')+'〕':'')).join(' ／ '),'| HP',a.hp.join('/'),'手',t.handEnd,'精靈',a.spirit.map(s=>s?s.k+s.p:'-').join('/'),t.issues.length?'  !!'+t.issues.map(x=>x.level[0]+':'+x.msg).join(' | '):'');});
console.log(r.final.over);
