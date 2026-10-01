from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter, ImageOps
import qrcode
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A3

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src" / "assets"
OUT = ROOT / "flyer-output"
OUT.mkdir(exist_ok=True)

W, H = 3508, 4961  # A3 portrait at 300dpi
RED = "#D71920"
DEEP_RED = "#930E18"
GOLD = "#F5C542"
CREAM = "#FFF7EA"
INK = "#111111"
MUTED = "#6A625B"
WHITE = "#FFFFFF"

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_COND_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf"

def font(size, bold=False, condensed=False):
    path = FONT_COND_BOLD if condensed else (FONT_BOLD if bold else FONT_REG)
    try:
        return ImageFont.truetype(path, size=size)
    except Exception:
        return ImageFont.load_default()

def rounded(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

def trim_alpha(im):
    im = im.convert("RGBA")
    a = im.getchannel("A")
    bbox = a.getbbox()
    return im.crop(bbox) if bbox else im

def paste_contain(base, im, box, pad=0):
    x0, y0, x1, y1 = box
    iw, ih = im.size
    bw, bh = x1-x0-2*pad, y1-y0-2*pad
    scale = min(bw/iw, bh/ih)
    nw, nh = max(1,int(iw*scale)), max(1,int(ih*scale))
    im2 = im.resize((nw,nh), Image.Resampling.LANCZOS)
    px = x0 + (x1-x0-nw)//2
    py = y0 + (y1-y0-nh)//2
    if im2.mode == "RGBA":
        base.alpha_composite(im2, (px,py))
    else:
        base.paste(im2, (px,py))
    return (px,py,nw,nh)

def fit_crop(im, size, focus=(0.5,0.5)):
    return ImageOps.fit(im.convert("RGB"), size, method=Image.Resampling.LANCZOS, centering=focus)

def wrap(draw, text, fnt, max_width):
    words=text.split()
    lines=[]; cur=""
    for word in words:
        test=(cur+" "+word).strip()
        if draw.textbbox((0,0),test,font=fnt)[2] <= max_width:
            cur=test
        else:
            if cur: lines.append(cur)
            cur=word
    if cur: lines.append(cur)
    return lines

def draw_wrapped(draw, xy, text, fnt, fill, max_width, line_gap=10, anchor=None, align="left"):
    x,y=xy
    lines=wrap(draw,text,fnt,max_width)
    lh=(draw.textbbox((0,0),"Ag",font=fnt)[3]-draw.textbbox((0,0),"Ag",font=fnt)[1])
    for line in lines:
        if align=="center":
            w=draw.textbbox((0,0),line,font=fnt)[2]
            tx=x+(max_width-w)//2
        else: tx=x
        draw.text((tx,y),line,font=fnt,fill=fill)
        y += lh+line_gap
    return y

# Base
img=Image.new("RGBA",(W,H),INK)
draw=ImageDraw.Draw(img)

# Background gradient
for y in range(H):
    t=y/H
    if t < .34:
        # burgundy into near-black
        r=int(115*(1-t/.34)+18*(t/.34)); g=int(8*(1-t/.34)+10*(t/.34)); b=int(18*(1-t/.34)+12*(t/.34))
    else:
        u=(t-.34)/.66
        r=int(18*(1-u)+12*u); g=int(10*(1-u)+12*u); b=int(12*(1-u)+12*u)
    draw.line((0,y,W,y),fill=(r,g,b,255))

# Hero photo on right
hero=Image.open(ASSETS/"hero-table.jpg")
hero=fit_crop(hero,(1600,1660),(0.5,0.48)).convert("RGBA")
hero=ImageEnhance.Contrast(hero).enhance(1.06)
# soften left edge with mask
mask=Image.new("L",hero.size,255)
md=ImageDraw.Draw(mask)
for x in range(420):
    a=int(255*x/420)
    md.line((x,0,x,hero.height),fill=a)
img.paste(hero,(W-1600,0),mask)

# dark red overlay across hero
ov=Image.new("RGBA",(W,1660),(115,0,10,55))
img.alpha_composite(ov,(0,0))

# Main exact MealDeck logo
mdlogo=trim_alpha(Image.open(ASSETS/"mealdeck-logo.png"))
paste_contain(img,mdlogo,(140,95,1740,680),pad=0)

# Hero copy
draw=ImageDraw.Draw(img)
draw.text((150,705),"THE FULL HOUSE OF FLAVOUR",font=font(62,True,True),fill=GOLD)
draw.text((150,785),"PLAY YOUR",font=font(148,True,True),fill=WHITE)
draw.text((150,925),"CRAVINGS RIGHT.",font=font(148,True,True),fill=GOLD)
body="Pick from different food brands, deal them into one basket and pay one delivery fee. One order. Every craving."
draw_wrapped(draw,(155,1110),body,font(50,False),CREAM,1420,line_gap=18)

# QR CTA card
qr=qrcode.QRCode(version=None,box_size=14,border=3,error_correction=qrcode.constants.ERROR_CORRECT_M)
qr.add_data("https://mealdeck.co.uk")
qr.make(fit=True)
qim=qr.make_image(fill_color="black",back_color="white").convert("RGBA")
qx,qy,qw,qh=2700,910,640,640
rounded(draw,(qx-34,qy-34,qx+qw+34,qy+qh+205),42,CREAM)
paste_contain(img,qim,(qx,qy,qx+qw,qy+qh),pad=0)
draw.text((qx+qw//2,qy+qh+35),"SCAN TO DEAL ME IN",font=font(42,True,True),fill=RED,anchor="ma")
draw.text((qx+qw//2,qy+qh+92),"mealdeck.co.uk",font=font(36,True),fill=INK,anchor="ma")

# Direct-order proposition
sec_y=1660
rounded(draw,(95,sec_y+45,W-95,sec_y+720),55,"#FFF8EB")
draw.text((160,sec_y+105),"WHY JUGGLE AGGREGATOR BASKETS?",font=font(70,True,True),fill=INK)
draw.text((160,sec_y+205),"ORDER DIRECT.",font=font(110,True,True),fill=RED)
draw.text((160,sec_y+322),"Same food. Same delivery. Better direct value.",font=font(60,True),fill=INK)
draw.text((160,sec_y+410),"Mix cuisines in ONE basket. Pay ONE delivery fee.",font=font(54,True),fill=DEEP_RED)
benefits=["Mix brands","Group ordering","Split payments","Loyalty points","Live tracking"]
bx=160; by=sec_y+535
for i,b in enumerate(benefits):
    tw=draw.textbbox((0,0),b,font=font(34,True))[2]
    rounded(draw,(bx,by,bx+tw+92,by+78),35,INK)
    draw.ellipse((bx+24,by+24,bx+48,by+48),fill=GOLD)
    draw.text((bx+62,by+18),b,font=font(34,True),fill=WHITE)
    bx += tw+118

# Offers section
offers_y=2455
draw.text((150,offers_y),"OFFERS ON THE TABLE",font=font(60,True,True),fill=GOLD)
draw.text((150,offers_y+72),"GOOD DEALS. CLEARLY DEALT.",font=font(92,True,True),fill=WHITE)
offers=[
("A","♥","THE BURGER ACE","FREE","Spend £21. Get a burger on us."),
("2","♦","PERFECT PAIR","1/2 PRICE","Buy one. Deal the second for half."),
("S","♠","SNAP!","2 FOR 1","Match two of the same. Pay for one."),
("K","♣","THE GROUP HAND","+ POINTS","More people. More points."),
("F","♥","FULL HOUSE FEAST","£5 OFF","Three brands. One basket. One saving."),
("10","♦","THE LOYALTY FLUSH","10x PTS","Your fifth direct order in a month.")
]
card_w=1010; card_h=440; gap=76
for idx,(rank,suit,label,value,title) in enumerate(offers):
    row=idx//3; col=idx%3
    x=150+col*(card_w+gap); y=offers_y+210+row*(card_h+70)
    rounded(draw,(x,y,x+card_w,y+card_h),42,CREAM,outline=GOLD,width=7)
    suit_fill=RED if suit in ["♥","♦"] else INK
    draw.text((x+44,y+30),rank,font=font(50,True),fill=suit_fill)
    draw.text((x+44,y+84),suit,font=font(48,True),fill=suit_fill)
    draw.text((x+130,y+40),label,font=font(36,True,True),fill=RED)
    draw.text((x+130,y+108),value,font=font(74,True,True),fill=INK)
    draw_wrapped(draw,(x+130,y+207),title,font(36,True),MUTED,card_w-210,line_gap=8)

draw.text((150,offers_y+1170),"Selected items/brands. Offer limits apply. See mealdeck.co.uk for current terms.",font=font(28,False),fill="#CFC7BC")

# Brand deck section
brands_y=3745
draw.text((150,brands_y),"THE COMPLETE FLAVOUR DECK",font=font(72,True,True),fill=WHITE)
draw.text((150,brands_y+90),"14 brands. One premium collection.",font=font(38,False),fill="#D4CCC3")

brands=[
("Taconelle","French tacos","taconelle-premium.png"),
("Tavo Chicken","All things chicken","tavo-chicken-premium.png"),
("Skorch","Smash burgers","skorch-premium.png"),
("Load'd","French tacos & mac n cheese","loadd-premium.png"),
("Tarka Box","Desi food","tarka-box-premium.png"),
("Paratique","Signature parathas","paratique-premium.png"),
("Sabzora","Vegetarian Indian","sabzora-premium.png"),
("Vyta","Fresh juices","vyta-premium.png"),
("Icova","Iced coffee, chai & desserts","icova-premium.png"),
("Moktl","Zero-alcohol mocktails","moktl-premium.png"),
("Souvano","Mediterranean plates","souvano-premium.png"),
("Nusara","South East Asian fusion","nusara-premium.png"),
("Pastarivo","Fresh pasta","pastarivo-premium.png"),
("Rise & Griddle","Breakfast & brunch","rise-and-griddle-premium.png"),
]
logo_dir=ASSETS/"premium-logos"
cols=7; bw=445; bh=340; g=32
startx=(W-(cols*bw+(cols-1)*g))//2
for i,(name,cat,fn) in enumerate(brands):
    row=i//cols; col=i%cols
    x=startx+col*(bw+g); y=brands_y+180+row*(bh+44)
    rounded(draw,(x,y,x+bw,y+bh),34,CREAM)
    li=trim_alpha(Image.open(logo_dir/fn))
    paste_contain(img,li,(x+20,y+20,x+bw-20,y+245),pad=8)
    # subtle divider
    draw.line((x+40,y+254,x+bw-40,y+254),fill="#E3D7C7",width=2)
    cat_lines=wrap(draw,cat,font(25,True),bw-50)
    ty=y+274
    for line in cat_lines[:2]:
        tw=draw.textbbox((0,0),line,font=font(25,True))[2]
        draw.text((x+(bw-tw)//2,ty),line,font=font(25,True),fill=MUTED)
        ty+=32

# Footer
fy=4660
draw.rectangle((0,fy,W,H),fill=RED)
draw.text((150,fy+70),"ONE ORDER. EVERY CRAVING.",font=font(74,True,True),fill=WHITE)
draw.text((150,fy+170),"Direct-order offers • One basket • One delivery fee • Group orders • Loyalty • Live tracking",font=font(34,True),fill=CREAM)
draw.text((W-150,fy+82),"MEALDECK.CO.UK",font=font(62,True,True),fill=GOLD,anchor="ra")
draw.text((W-150,fy+175),"Brand availability depends on area and service time.",font=font(27,False),fill=CREAM,anchor="ra")

# Save print preview
png=OUT/"mealdeck-a3-flyer.png"
img.convert("RGB").save(png,quality=95,dpi=(300,300))

# True A3 PDF page using PNG as print artwork
pdf=OUT/"mealdeck-a3-flyer.pdf"
c=canvas.Canvas(str(pdf),pagesize=A3)
pw,ph=A3
c.drawImage(str(png),0,0,width=pw,height=ph,preserveAspectRatio=True,mask='auto')
c.save()

print(png)
print(pdf)
