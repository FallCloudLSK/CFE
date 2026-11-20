const fs=require('fs');const RP=require('../src/report.js');
// reuse game1 by hacking: load test match
const src=fs.readFileSync(__dirname+'/game1.js','utf8').split('const r=E.replay')[0];
const m=eval(src+';m');
const sess={players:m.players,games:[m,m]};
fs.writeFileSync('/tmp/claude-0/-home-user/0f31dc3d-e0d6-5c6b-b9db-9b5353a80261/scratchpad/out.html',RP.exportHTML(sess));
fs.writeFileSync('/tmp/claude-0/-home-user/0f31dc3d-e0d6-5c6b-b9db-9b5353a80261/scratchpad/out.xlsx',RP.exportXLSX(sess));
console.log('ok');
