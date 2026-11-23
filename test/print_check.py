import os, subprocess
from playwright.sync_api import sync_playwright
s=os.environ['PDF_SAMPLE']
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    pg=b.new_context(viewport={'width':1280,'height':900}).new_page(); pg.goto('http://localhost:8787/')
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    with pg.expect_file_chooser() as fc: pg.click('#btnPdfEmpty')
    fc.value.set_files(s); pg.wait_for_selector('#sumGrid .sum-card', timeout=20000)
    import sys
    if len(sys.argv)>1: pg.uncheck('#groupChk'); pg.wait_for_timeout(300)
    pg.evaluate("window.print=()=>{}"); pg.click('#btnPrint'); pg.wait_for_timeout(300)
    pg.emulate_media(media='print')
    pg.pdf(path='/tmp/sheet.pdf', format='A4', margin={'top':'12mm','bottom':'12mm','left':'12mm','right':'12mm'}, prefer_css_page_size=True, print_background=True)
    print('errors', errs, 'rows', pg.locator('#printSheet .ps-rows tbody tr').count())
