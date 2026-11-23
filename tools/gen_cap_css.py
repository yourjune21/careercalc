"""style.css 의 @media print 규칙을 '.cap' 범위의 일반 규칙으로 바꿔 public/cap.css 를 만든다.
JPG/PDF 저장(화면 캡처)이 인쇄와 같은 모양이 되도록 하기 위함. 인쇄용 CSS를 고친 뒤에는 이 스크립트를 다시 실행:
    python3 tools/gen_cap_css.py
"""
import re, io
src = open('public/style.css', encoding='utf-8').read()
src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
out = []
i = 0
while True:
    m = re.compile(r'@media\s+print\s*\{').search(src, i)
    if not m: break
    j = m.end(); depth = 1
    while depth:
        c = src[j]; depth += (c == '{') - (c == '}'); j += 1
    body = src[m.end():j-1]
    i = j
    # 본문 안의 일반 규칙들 (중첩 @ 규칙은 없다고 가정)
    for r in re.finditer(r'([^{}]+)\{([^{}]*)\}', body):
        sels, decl = r.group(1).strip(), r.group(2).strip()
        if sels.startswith('@'): continue
        keep = []
        for s in [x.strip() for x in sels.split(',')]:
            if not s or re.search(r'(^|[\s>+~])(body|html)\b|#printSheet|#printMulti|#btn|\.drop|\.rec-detail|\.sum-grid|\.sum-table|\.refbar|\.refwrap', s): continue
            keep.append('.cap ' + s)
        if keep: out.append(', '.join(keep) + ' { ' + decl + ' }')
base = '''/* 자동 생성 (tools/gen_cap_css.py) — JPG/PDF 저장용 */
.cap { position: fixed; left: -10000px; top: 0; width: 210mm; height: 297mm; padding: 14mm 15mm; box-sizing: border-box; background: #fff; color: #1b2a2a; font-size: 12px; }
.cap .ps-sum { font-size: 9.5px; letter-spacing: -0.03em; width: 100%; } .cap .ps-sum th, .cap .ps-sum td { white-space: normal !important; word-break: keep-all; } .cap .ps-sum th, .cap .ps-sum td { padding-left: 4px; padding-right: 4px; }
'''
open('public/cap.css', 'w', encoding='utf-8').write(base + '\n'.join(out) + '\n')
print(len(out), 'rules')
