# 產生單一檔案 index.html（內嵌 LOGO 與 html2canvas，可離線使用）
import base64, pathlib
d = pathlib.Path(__file__).resolve().parent.parent
src = (d/'src'/'app.html').read_text(encoding='utf-8')
logo = 'data:image/jpeg;base64,' + base64.b64encode((d/'logo.jpg').read_bytes()).decode()
h2c = (d/'html2canvas.min.js').read_text(encoding='utf-8')
out = src.replace('__LOGO__', logo).replace('/*H2C*/', h2c)
import sys
name = sys.argv[1] if len(sys.argv)>1 else 'index.html'
(d/name).write_text(out, encoding='utf-8')
print(name, len(out.encode()))
