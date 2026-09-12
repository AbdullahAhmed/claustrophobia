p='src/main.js'; s=open(p,encoding='utf-8').read()
a=s.index("const names = [...new Set([...txt.matchAll(/ by ([^—")
b=s.index("].map(m => m[1].trim()))]", a)
s = s[:a] + "const names = [...new Set([...txt.matchAll(/ by ([^\\u2014\\n]+?) \\u2014/g)" + s[b:]
open(p,'w',encoding='utf-8').write(s); print('ok')
