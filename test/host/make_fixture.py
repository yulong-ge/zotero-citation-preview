from pathlib import Path
import sys
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
pdf = canvas.Canvas(str(out), pagesize=letter, invariant=1)
pdf.setTitle('Citation Preview GUI test fixture')
pdf.setFont('Helvetica-Bold', 18)
pdf.drawString(60, 730, 'Citation Preview GUI test fixture')
pdf.setFont('Helvetica', 12)
pdf.drawString(60, 660, 'A named reference with a known boundary:')
pdf.drawString(310, 660, '[2]')
pdf.linkRect('', 'cite.fixture2', (309, 657, 328, 673), relative=0, thickness=0)
pdf.drawString(60, 360, 'A lower reference exercises popup placement:')
pdf.drawString(330, 360, '[44]')
pdf.linkRect('', 'cite.fixture44', (329, 357, 354, 373), relative=0, thickness=0)
pdf.showPage()
pdf.setFont('Helvetica-Bold', 18)
pdf.drawString(60, 730, 'References')
pdf.setFont('Helvetica', 11)
for number, y in [(2, 660), (3, 620), (44, 420), (45, 380)]:
    pdf.bookmarkHorizontalAbsolute(f'cite.fixture{number}', y + 10, left=60)
    pdf.drawString(60, y, f'[{99 if len(sys.argv)>2 and sys.argv[2]=="parser-failure" and number==44 else number}] Jane Researcher. Visual citation testing study {number}. 2024.')
pdf.save()

# PDF.js must receive a named destination, not ReportLab's inline destination array.
import pikepdf
with pikepdf.Pdf.open(out) as document:
    names = pikepdf.Array()
    for annotation, name in zip(document.pages[0].Annots, ['cite.fixture2', 'cite.fixture44'], strict=True):
        names.extend([pikepdf.String(name), pikepdf.Dictionary(D=annotation.Dest)])
        annotation.Dest = pikepdf.String(name)
    document.Root.Names = pikepdf.Dictionary(Dests=pikepdf.Dictionary(Names=names))
    temporary = out.with_suffix('.tmp.pdf')
    document.save(temporary)
temporary.replace(out)
