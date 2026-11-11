import json, sys
from playwright.sync_api import sync_playwright
URL='http://localhost:8787/'
errs=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name+(' '+str(extra) if extra and not cond else ''))
    if not cond: errs.append(name)
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx=b.new_context(viewport={'width':1280,'height':900}, locale='ko-KR')
    pg=ctx.new_page(); logs=[]
    pg.on('console', lambda m: logs.append((m.type,m.text)) if m.type in('error','warning') else None)
    pg.on('pageerror', lambda e: logs.append(('pageerror',str(e))))
    pg.goto(URL)
    check('empty state shown', pg.locator('#empty').is_visible())
    # 사람 추가
    pg.fill('#newName','홍길동'); pg.click('#addForm button')
    check('editor shown', pg.locator('#editor').is_visible())
    check('5 rows initially', pg.locator('#rowsBody tr').count()==5)
    def fill(i, s, e, memo=''):
        r=pg.locator('#rowsBody tr').nth(i)
        if memo: r.locator('.f-memo').fill(memo)
        r.locator('.f-start').fill(s); r.locator('.f-end').fill(e); r.locator('.f-end').blur()
    fill(0,'2026-1-1','2026/3/30','A초')
    fill(1,'20260201','2026. 3. 30.','B초')
    fill(2,'2026.4.1','2026.4.30')
    t=pg.locator('#rowsBody tr').nth(0)
    check('row1 = 0y2m29d', [t.locator('.res-'+k).inner_text() for k in 'ymd']==['0','2','29'], [t.locator('.res-'+k).inner_text() for k in 'ymd'])
    w=pg.locator('#warnBody .warn-text').all_inner_texts()
    print('warnings:',w)
    check('overlap warning text', w==['경고) 2026. 2. 1.~2026. 3. 30. (1개월 29일 중복)'])
    check('row2 normalized', pg.locator('#rowsBody tr').nth(1).locator('.f-start').input_value()=='2026. 2. 1.')
    print('total:',pg.inner_text('#totalValue'),'|',pg.inner_text('#totalNote'))
    # 0 2 29 + 1 29(2/1~3/30=1m29d)+ 4/1~4/30=1m0d(full) -> M=0+1+1=2,D=58->+1m→ 3m? 
    fill(3,'21/2/20','21.3.19')
    r3=pg.locator('#rowsBody tr').nth(3)
    check('2자리 연도 정규화', r3.locator('.f-start').input_value()=='2021. 2. 20.' and r3.locator('.f-end').input_value()=='2021. 3. 19.', r3.locator('.f-start').input_value())
    check('2자리 연도 계산 0y0m28d', [r3.locator('.res-'+k).inner_text() for k in 'ymd']==['0','1','0'], [r3.locator('.res-'+k).inner_text() for k in 'ymd'])
    fill(3,'','')
    check('포함 합산 0년 5개월 28일', pg.inner_text('#totalValue')=='0년 5개월 28일')
    check('제외 합산 0년 3개월 29일', pg.inner_text('#totalUniq')=='0년 3개월 29일', pg.inner_text('#totalUniq'))
    pg.screenshot(path='/home/claude/shots/1_main.png', full_page=True)
    # 두번째 사람
    pg.fill('#newName','홍길순'); pg.press('#newName','Enter')
    check('second person empty', pg.locator('#personTitle').inner_text()=='홍길순' and pg.inner_text('#totalValue')=='—')
    fill(0,'2020-2-29','2021-2-28')
    print('gilsun:',pg.inner_text('#totalValue'))
    # 새로고침 후 유지(쿠키)
    pg.wait_for_timeout(600)
    cks=[c for c in ctx.cookies() if c['name'].startswith('cc_')]
    print('cookies:',[(c['name'],len(c['value'])) for c in cks])
    check('cookies written', len(cks)==3)
    pg.reload()
    check('people persisted', pg.locator('#peopleList .person').count()==2)
    check('selected persisted', pg.locator('#personTitle').inner_text()=='홍길순')
    pg.locator('#peopleList .person').first.click()
    check('data persisted', pg.locator('#rowsBody tr').nth(0).locator('.f-memo').input_value()=='A초' and pg.locator('#rowsBody tr').nth(1).locator('.f-start').input_value()=='2026. 2. 1.')
    check('overlap after reload', len(pg.locator('#warnBody .warn-text').all_inner_texts())==1)
    # 잘못된 날짜 / 역순
    fill(3,'2026-2-30','2026-3-1')
    check('bad date flagged', pg.locator('#rowsBody tr').nth(3).locator('.chip.bad').count()==1)
    fill(4,'2026-5-10','2026-5-1')
    check('reversed flagged', pg.locator('#rowsBody tr').nth(4).locator('.chip.bad').count()==1)
    # Enter 이동 및 행추가
    pg.locator('#rowsBody tr').nth(4).locator('.f-end').focus(); pg.keyboard.press('Enter')
    check('Enter adds row', pg.locator('#rowsBody tr').count()==6)
    # 행 삭제
    pg.locator('#rowsBody tr').nth(5).locator('.del').click()
    check('row deleted', pg.locator('#rowsBody tr').count()==5)
    # 저장 방식 전환
    pg.select_option('#modeSelect','local'); pg.wait_for_timeout(300)
    check('cookies cleared after switch', len([c for c in ctx.cookies() if c['name'].startswith('cc_')])==0)
    pg.reload()
    check('local persisted', pg.locator('#peopleList .person').count()==2 and pg.locator('#modeSelect').input_value()=='local')
    pg.select_option('#modeSelect','cookie'); pg.wait_for_timeout(300)
    check('back to cookie', len([c for c in ctx.cookies() if c['name'].startswith('cc_')])==3)
    # 쿠키 용량 한도: 100명 한도와 12KB 예산
    res=pg.evaluate("""()=>{const S=window.CareerStorage;const people=[];for(let i=1;i<=100;i++){people.push({id:i,name:'사람'+i,rows:[{memo:'근무',start:'2020-01-01',end:'2020-12-31'}]});}
      const m=S.measure({people,selected:1}); const r=S.save('cookie',{people,selected:1}); S.save('cookie',{people:[],selected:0}); return {m,r};}""")
    print('100 people x1 row:',res)
    res2=pg.evaluate("""()=>{const S=window.CareerStorage;const rows=[];for(let i=0;i<50;i++)rows.push({memo:'가나다라마바사아자차카타파하가나다라마바사아자차카타파하',start:'2020-01-01',end:'2020-12-31'});
      return S.save('cookie',{people:[{id:1,name:'긴사람',rows}],selected:1});}""")
    print('1 person x 50 long rows:',res2)
    pg.reload()
    # 백업 내보내기
    with pg.expect_download() as d: pg.click('#btnExport')
    path=d.value.path(); data=json.load(open(path)); check('export ok', data['app']=='career-calc')
    # 반응형 스크린샷
    pg.set_viewport_size({'width':390,'height':844}); pg.screenshot(path='/home/claude/shots/2_mobile.png', full_page=True)
    print('console:',logs)
    check('no console errors/CSP violations', not [l for l in logs if l[0] in('error','pageerror')], logs)
    b.close()
print('FAILED:',errs if errs else 'none')
