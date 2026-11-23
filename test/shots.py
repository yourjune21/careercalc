import os,sys
from playwright.sync_api import sync_playwright
tag=sys.argv[1]; s=os.environ['PDF_SAMPLE']
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_context(viewport={'width':1280,'height':900}).new_page(); pg.goto('http://localhost:8787/')
    pg.click('#awardToggle'); pg.wait_for_timeout(200)
    pg.screenshot(path=f'/home/claude/shots/{tag}_empty.png', full_page=True)
    with pg.expect_file_chooser() as fc: pg.click('#btnPdfEmpty')
    fc.value.set_files(s); pg.wait_for_selector('#sumGrid .sum-card', timeout=20000)
    pg.fill('#awardBase1','2026-11-23'); pg.fill('#awardFrom1','2024-1-1'); pg.fill('#awardTo1','2024-12-31'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'/home/claude/shots/{tag}_pdf.png', full_page=True)
    m=b.new_context(viewport={'width':390,'height':800}).new_page(); m.goto('http://localhost:8787/')
    m.click('#awardToggle'); m.wait_for_timeout(200)
    m.screenshot(path=f'/home/claude/shots/{tag}_mobile.png', full_page=True)
