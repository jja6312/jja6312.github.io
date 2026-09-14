"""Read-only ZIP/XML workbook validation and small contact sheets for QA."""
import argparse
import json
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
from PIL import Image, ImageOps, ImageDraw

def inspect_xlsx(path):
    with zipfile.ZipFile(path) as z:
        ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        w=ET.fromstring(z.read('xl/workbook.xml'))
        sheets=[x.attrib['name'] for x in w.findall('m:sheets/m:sheet',ns)]
        errors=[];merges=0
        for member in z.namelist():
            if member.startswith('xl/worksheets/sheet') and member.endswith('.xml'):
                root=ET.fromstring(z.read(member)); errors += [(member,c.attrib['r']) for c in root.findall('.//m:c[@t="e"]',ns)]; merges+=len(root.findall('.//m:mergeCell',ns))
        if errors:raise AssertionError(errors)
        return {'sheets':sheets,'merge_count':merges,'formula_errors':errors,'bytes':Path(path).stat().st_size}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('xlsx');p.add_argument('--previews');a=p.parse_args();print(json.dumps(inspect_xlsx(a.xlsx),ensure_ascii=False))
    if a.previews:
        files=sorted(Path(a.previews).glob('*.png'))
        for start in range(0,len(files),8):
            canvas=Image.new('RGB',(1600,4*310),'#DDE2E8');draw=ImageDraw.Draw(canvas)
            for idx,path in enumerate(files[start:start+8]):
                im=Image.open(path).convert('RGB');im.thumbnail((784,280));x=idx%2*800+8;y=idx//2*310+25;canvas.paste(im,(x,y));draw.text((x,y-20),path.stem,fill='#182D42')
            canvas.save(Path(a.previews)/f'contact_{start//8+1}.jpg')
