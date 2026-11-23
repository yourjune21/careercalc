import os
from playwright.sync_api import sync_playwright
s=os.environ['PDF_SAMPLE']
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    m=b.new_context(viewport={'width':390,'height':800}).new_page(); m.goto('http://localhost:8787/')
    with m.expect_file_chooser() as fc: m.click('#btnPdfEmpty')
    fc.value.set_files(s); m.wait_for_selector('#sumGrid .sum-card', timeout=20000)
    m.click('#rowsSummary'); m.wait_for_timeout(300)
    m.screenshot(path='/home/claude/shots/v18_m_pdf.png', full_page=True)
    print(m.evaluate('document.documentElement.scrollWidth'))
