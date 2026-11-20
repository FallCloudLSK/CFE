const E=require('../src/engine.js');
const m=E.newMatch(['FatCloud','雷靈使'],0);
const T=(...acts)=>({actions:acts,ended:true});
const f=(form,cards,extra)=>Object.assign({kind:'formation',form,cards},extra||{});
const d=c=>({kind:'discard',card:c});
m.turns=[
 T({kind:'pouch',card:'金1',strat:'還魂'},{kind:'job',job:'初行客',cards:['土1']},d('土5')),
 T(f('坱土',['土1','土4','土5']),d('金4')),
 T({kind:'job',job:'毒師',cards:['水1','土1']},d('金5')),
 T({kind:'job',job:'風行者',cards:['土3']},d('水1')),
 T(f('震暴',['火5','火5','水5','土5']),d('水2')),
 T(f('幻化',['火5','火3']),d('水3')),
 T(f('土擊術',['土4']),d('金1')),
 T({kind:'pouch',card:'水1',strat:'混水'},f('震暴',['火3','火3','水3','火5']),d('火1')),
 T({kind:'note',text:'羽調‧流水（水3水3）舊規則'},{kind:'adjust',who:0,field:'hand',mode:'add',value:-2},{kind:'pass'},d('木4')),
 T(f('木擊術',['木3']),d('木5')),
 T(f('五流歸一',['木1','木1','水1','土1','土1']),d('金1')),
 T(f('幻化',['土1','金3']),d('金1')),
 T({kind:'retrieve'},{kind:'spirit',id:'飛刃'},{kind:'cover',cards:['水3','水4'],form:'封印'},d('金3')),
 T(f('震暴',['火5','火3','水3','土3'])),
];
const r=E.replay(m);
r.turns.forEach(t=>{
  const a=t.after;
  console.log(String(t.i+1).padStart(2),m.players[t.p].padEnd(8),
    t.acts.map(x=>x.text+(x.notes.length?' 〔'+x.notes.join('；')+'〕':'')).join(' ／ '),
    '| HP',a.hp.join('/'),'手',t.handEnd,'精靈',a.spirit.map(s=>s?s.k+s.p:'-').join('/'),'星',a.star.join('/'),'職',a.job.join('/'),
    t.issues.length?'  !!'+t.issues.map(x=>x.level[0]+':'+x.msg).join(' | '):'');
});
console.log(r.final.over);
