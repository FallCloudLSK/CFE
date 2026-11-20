#!/usr/bin/env python3
"""組裝 recorder.html：python3 build.py [輸出路徑]"""
import base64, json, pathlib, sys
R = pathlib.Path(__file__).resolve().parent
src = (R / 'src' / 'app.html').read_text(encoding='utf-8')
logo = 'data:image/jpeg;base64,' + base64.b64encode((R / 'assets' / 'logo.jpg').read_bytes()).decode()
cards = json.loads((R / 'assets' / 'cards.json').read_text(encoding='utf-8'))
def js(n): return (R / 'src' / n).read_text(encoding='utf-8').replace('</script', '<\\/script')
out = (src.replace('__LOGO__', logo)
       .replace('/*__RULES__*/', js('rules.js'))
       .replace('/*__ENGINE__*/', js('engine.js'))
       .replace('/*__XLSX__*/', js('xlsx.js'))
       .replace('/*__REPORT__*/', js('report.js'))
       .replace('/*__CARDS__*/', 'const CARD_IMG = ' + json.dumps(cards, ensure_ascii=False) + ';'))
dst = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else R / 'recorder.html'
dst.write_text(out, encoding='utf-8')
print(dst, len(out.encode()))
