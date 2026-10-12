"""Render editable deliverables locally. Requires LibreOffice and bundled Poppler."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from pdf2image import convert_from_path

root = Path.cwd()
private = root / 'output/showcase-artifacts-20261012'
out = root / 'public/reizo/deliverables'
soffice = private / 'libreoffice/program/soffice.com'
pdfs = private / 'pdfs'
pdfs.mkdir(exist_ok=True)
profile = (private / 'render-profile').as_uri()
flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
for source in sorted(out.glob('*')):
    if len(sys.argv) > 1 and source.stem not in sys.argv[1:]:
        continue
    if source.suffix not in ['.pptx', '.xlsx']:
        continue
    filter_name = 'pdf:calc_pdf_Export:{"SinglePageSheets":{"type":"boolean","value":"true"}}' if source.suffix == '.xlsx' else 'pdf:impress_pdf_Export'
    command = [str(soffice), '-env:UserInstallation='+profile, '--headless', '--norestore', '--convert-to', filter_name, '--outdir', str(pdfs), str(source)]
    result = subprocess.run(command, capture_output=True, timeout=90, creationflags=flags)
    pdf = pdfs / (source.stem+'.pdf')
    if not pdf.exists():
        raise RuntimeError(f'{source.name}: {result.stdout!r} {result.stderr!r}')
    images = convert_from_path(pdf, dpi=96)
    for index, page in enumerate(images):
        folder = out if source.suffix == '.pptx' else private
        page.save(folder / f'{source.stem}-{index+1}.png')
    print(f'{source.name}: {len(images)} rendered page(s)', flush=True)

for key in ['legal-0', 'office-0']:
    rendered = private / key
    for index, page in enumerate(sorted(rendered.glob('page-*.png'))):
        shutil.copyfile(page, out / f'{key}-{index+1}.png')
