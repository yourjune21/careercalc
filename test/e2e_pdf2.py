import os
from playwright.sync_api import sync_playwright
sample=os.environ['PDF_SAMPLE']; errs=[]
def check(n,c,e=''):
    print(('PASS ' if c else 'FAIL ')+n+(' '+str(e) if e and not c else ''))
    if not c: errs.append(n)
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_context(viewport={'width':1280,'height':900}).new_page(); pg.goto('http://localhost:8787/')
    pg.fill('#newName','홍길동'); pg.press('#newName','Enter'); pg.wait_for_timeout(200)
    pg.fill('#rowsBody tr >> nth=0 >> .f-memo','홍길동경력'); pg.fill('#rowsBody tr >> nth=0 >> .f-start','2020-3-1'); pg.press('#rowsBody tr >> nth=0 >> .f-start','Tab')
    check('홍길동 입력됨', pg.locator('#peopleList .person').count()==1)
    pg.set_input_files('#pdfFile', sample); pg.locator('#docMsg', has_text='채웠습니다').wait_for(timeout=20000)
    names=pg.locator('#peopleList .person').all_inner_texts()
    check('홍길동은 두고 안영준이 새로 생성', len(names)==2 and any('홍길동' in x for x in names) and any('안영준' in x for x in names), names)
    pg.locator('#peopleList .person', has_text='홍길동').click(); pg.wait_for_timeout(200)
    check('홍길동 데이터 그대로', pg.input_value('#rowsBody tr >> nth=0 >> .f-memo')=='홍길동경력', pg.input_value('#rowsBody tr >> nth=0 >> .f-memo'))
    # 휴직 줄 종류 표시
    pg.locator('#peopleList .person', has_text='안영준').click(); pg.wait_for_timeout(200)
    memos=pg.locator('#rowsBody .f-memo').evaluate_all('els=>els.map(e=>e.value)')
    check('휴직 종류 표시', any('육아휴직(첫째)' in m for m in memos), memos)
    check('휴직 줄 색 구분', pg.locator('#rowsBody tr[data-cat="l"]').count()==1)
    # 이름으로 먼저 추가한 같은 이름 → 그 사람에 채움
    pg.fill('#newName','김철수'); pg.press('#newName','Enter'); pg.wait_for_timeout(200)
    check('총 3명', pg.locator('#peopleList .person').count()==3)
    print('FAILED:', errs or 'none')
