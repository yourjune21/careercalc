import os
from playwright.sync_api import sync_playwright
s=os.environ['PDF_SAMPLE']
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_context(viewport={'width':1280,'height':900}).new_page(); pg.goto('http://localhost:8787/')
    with pg.expect_file_chooser() as fc: pg.click('#btnPdfEmpty')
    fc.value.set_files(s)
    pg.wait_for_selector('#sumGrid .sum-card', timeout=20000)
    print('OK', pg.locator('#peopleList .person').count(), pg.inner_text('#personTitle'), pg.locator('#sumGrid .sum-value').first.inner_text(), pg.locator('#empty').is_visible())
