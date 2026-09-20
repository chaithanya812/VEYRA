# -*- coding: utf-8 -*-
"""VEYRA report: Dzylo Modular Quotation 2.0 (from YouTube KjzrkJjfGYo).
Part A = evidence (screenshot + On-screen + How VEYRA builds it).
Part B = instruction (reuse w/ receipts, data model, pricing engine, decisions,
units, NOT-building, open questions). Review draft — owner corrects, then split
into FRAME-REGISTER + PLAN .md files."""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    Table, TableStyle, HRFlowable, ListFlowable, ListItem, Image, KeepTogether, PageBreak, CondPageBreak)

BASE = "C:/Users/chait/AppData/Local/Temp/claude/C--Users-chait-Downloads-TOO-MUCH-RESEARCH-2-VEYRA-CRM/f03c3d59-13fc-483b-a906-79ef1a230680/scratchpad/dzylo"
RF = BASE + "/report_frames"; FR = BASE + "/frames"
OUT = "C:/Users/chait/AppData/Local/Temp/claude/C--Users-chait-Downloads-TOO-MUCH-RESEARCH-2-VEYRA-CRM/f03c3d59-13fc-483b-a906-79ef1a230680/scratchpad/VEYRA-DZYLO-Modular-Quotation-Report.pdf"

def rf():
    fonts = {"body":"Helvetica","bold":"Helvetica-Bold","mono":"Courier","it":"Helvetica-Oblique"}
    win = r"C:\Windows\Fonts"
    for reg,bold,it in [("segoeui.ttf","segoeuib.ttf","segoeuii.ttf"),("arial.ttf","arialbd.ttf","ariali.ttf")]:
        rp,bp,ip = (os.path.join(win,x) for x in (reg,bold,it))
        if os.path.exists(rp) and os.path.exists(bp):
            pdfmetrics.registerFont(TTFont("UI",rp)); pdfmetrics.registerFont(TTFont("UI-B",bp))
            fonts["body"],fonts["bold"]="UI","UI-B"
            if os.path.exists(ip):
                pdfmetrics.registerFont(TTFont("UI-I",ip)); fonts["it"]="UI-I"
            break
    for m in ["consola.ttf","cour.ttf"]:
        mp=os.path.join(win,m)
        if os.path.exists(mp): pdfmetrics.registerFont(TTFont("Mono",mp)); fonts["mono"]="Mono"; break
    return fonts
F=rf()
RED=colors.HexColor(0xD6122B); INK=colors.HexColor(0x1A1A1A); SUB=colors.HexColor(0x5A5F66)
LINE=colors.HexColor(0xD9DCE1); SUNK=colors.HexColor(0xF4F5F7); CHIP=colors.HexColor(0xEDEFF2)
GREEN=colors.HexColor(0x1B7A3D); AMBER=colors.HexColor(0x8A5A00)
ss=getSampleStyleSheet()
def S(n,**k): b=k.pop("parent",ss["Normal"]); return ParagraphStyle(n,parent=b,**k)
body=S("body",fontName=F["body"],fontSize=9.2,leading=13.2,textColor=INK,spaceAfter=5)
small=S("small",parent=body,fontSize=8.1,leading=11.3,textColor=SUB)
h1=S("h1",fontName=F["bold"],fontSize=18,leading=21,textColor=INK,spaceAfter=3)
h2=S("h2",fontName=F["bold"],fontSize=13,leading=16,textColor=INK,spaceBefore=13,spaceAfter=4)
h3=S("h3",fontName=F["bold"],fontSize=10.4,leading=13,textColor=INK,spaceBefore=9,spaceAfter=2)
kick=S("kick",fontName=F["bold"],fontSize=8,leading=10,textColor=RED,spaceAfter=1)
onscr=S("onscr",fontName=F["bold"],fontSize=8.3,leading=10,textColor=SUB,spaceBefore=3,spaceAfter=1)
veyra=S("veyra",fontName=F["bold"],fontSize=8.3,leading=10,textColor=RED,spaceBefore=4,spaceAfter=1)
ban=S("ban",fontName=F["bold"],fontSize=8.6,leading=12,textColor=colors.white)
bsub=S("bsub",fontName=F["body"],fontSize=8.2,leading=11.4,textColor=colors.white)
cap=S("cap",fontName=F["body"],fontSize=7.7,leading=10,textColor=SUB,alignment=1,spaceBefore=3)
cellL=S("cellL",parent=body,fontSize=8.0,leading=10.3,spaceAfter=0)
foot=S("foot",parent=small,fontSize=7.2,textColor=SUB)

def mk(t):
    import re
    t=re.sub(r"`([^`]+)`",lambda x:f'<font face="{F["mono"]}" size="8.3">{x.group(1)}</font>',t)
    return t
def P(t,st=body): return Paragraph(mk(t),st)
def BUL(items,st=body,b="\u2013"):
    return ListFlowable([ListItem(Paragraph(mk(x),st),leftIndent=10,value=b) for x in items],
        bulletType="bullet",start=b,leftIndent=13,bulletFontName=F["body"],bulletFontSize=9,spaceBefore=1,spaceAfter=5)
def rule(c=LINE,w=0.8,sb=2,sa=6): return HRFlowable(width="100%",thickness=w,color=c,spaceBefore=sb,spaceAfter=sa)
def notice(title,lines,bg=RED):
    inner=[Paragraph(title,ban)]+[Paragraph(mk(x),bsub) for x in lines]
    t=Table([[inner]],colWidths=[168*mm]); t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),bg),
        ("LEFTPADDING",(0,0),(-1,-1),10),("RIGHTPADDING",(0,0),(-1,-1),10),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),8)]))
    return t
def chip(txt,bg=CHIP,fg=INK):
    p=ParagraphStyle("c",fontName=F["bold"],fontSize=7.5,leading=9,textColor=fg)
    t=Table([[Paragraph(txt,p)]]); t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),bg),
        ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),2.5),("BOTTOMPADDING",(0,0),(-1,-1),3),("BOX",(0,0),(-1,-1),0.5,LINE)]))
    return t
def chiprow(cs):
    t=Table([cs],hAlign="LEFT"); t.setStyle(TableStyle([("LEFTPADDING",(0,0),(0,-1),0),("RIGHTPADDING",(0,0),(-1,-1),6),
        ("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0),("VALIGN",(0,0),(-1,-1),"MIDDLE")])); return t
def img(path,w=150*mm):
    im=Image(path); im.drawWidth=w; im.drawHeight=w*im.imageHeight/im.imageWidth
    box=Table([[im]],colWidths=[w]); box.setStyle(TableStyle([("BOX",(0,0),(-1,-1),0.75,LINE),
        ("LEFTPADDING",(0,0),(-1,-1),2),("RIGHTPADDING",(0,0),(-1,-1),2),("TOPPADDING",(0,0),(-1,-1),2),("BOTTOMPADDING",(0,0),(-1,-1),2)])); return box

def footer(c,d):
    c.saveState(); c.setStrokeColor(LINE); c.setLineWidth(0.6); c.line(21*mm,15*mm,189*mm,15*mm)
    c.setFont(F["body"],7.2); c.setFillColor(SUB)
    c.drawString(21*mm,10.5*mm,"VEYRA \u2014 Dzylo Modular Quotation 2.0 \u00b7 report draft for owner review")
    c.drawRightString(189*mm,10.5*mm,"Page %d"%d.page); c.restoreState()

doc=BaseDocTemplate(OUT,pagesize=A4,leftMargin=21*mm,rightMargin=21*mm,topMargin=17*mm,bottomMargin=20*mm,
    title="VEYRA \u2014 Dzylo Modular Quotation 2.0 report")
doc.addPageTemplates([PageTemplate(id="m",frames=[Frame(doc.leftMargin,doc.bottomMargin,doc.width,doc.height,id="f")],onPage=footer)])
st=[]

# ================= TITLE =================
st+=[Paragraph("EVIDENCE \u2192 INSTRUCTION \u2022 SCREENSHOTS \u2192 REPORT",kick),
 Paragraph("Dzylo \u201cModular Quotation 2.0\u201d \u2014 build report for VEYRA",h1),
 Paragraph("Source: YouTube <b>KjzrkJjfGYo</b> \u2014 \u201cCreate Modular Kitchen &amp; Wardrobe Quotations in Minutes\u201d, "
   "Dzylo AI, 19:58, uploaded 2026-02-16. Competitor tenant <b>Virtuate Designs</b> on <b>one.dzylo.com</b> \u2014 the same "
   "Dzylo product already in FRAME-REGISTER-V4. 148 scene frames extracted; the report cites the curated set. Full "
   "transcript and every frame are saved alongside this file.",small),Spacer(1,5),
 notice("Standing instruction (unchanged)",
   ["<b>Do not copy this UI.</b> Understand why every box is there, keep the information, drop the density, improve on it. "
    "Evidence (Part A, what was seen) stays separate from instruction (Part B, what we decide). Nothing is built until you correct this report."]),
 Spacer(1,6),
 notice("Two things to decide before anything is built",
  ["<b>1. \u201cQuotation 2.0\u201d is on VEYRA\u2019s PARKED list (HANDOFF Part 8: \u201cdo not build, do not delete the placeholders\u201d).</b> "
   "This report reads your sending me this video as UN-parking it. Confirm \u2014 everything in Part B assumes yes.",
   "<b>2. No number in this system comes from an LLM (HARD RULE 2).</b> Dzylo\u2019s \u201ccalculator\u201d is deterministic geometry \u00d7 tenant "
   "rates \u2014 which is exactly how VEYRA already prices (`measurement-model` \u2192 `computeLine`). The whole feature fits the rule with no exception."],bg=INK)]
st+=[Spacer(1,8),Paragraph("What the video shows, in one paragraph",h2),rule(RED,1.4),
 P("A designer builds a <b>modular kitchen &amp; wardrobe</b> quotation without Excel. It has four parts. "
   "<b>(1) Catalog</b> \u2014 under Settings \u2192 Modular Catalog, a tenant keeps ~300 <b>modules</b> (each a template: dimensions + how many "
   "shutters/shelves/panels/drawers/handles/hinges), grouped by <b>categories</b>. <b>(2) Components</b> \u2014 eight priced building blocks "
   "(Carcass, Shutters, Drawers, Handles, Hinges, Add-Ons, Accessories, Edge Bands) that are the rate cards. <b>(3) Presets</b> \u2014 the headline "
   "feature: a saved bundle of component choices (\u201cKitchen\u201d, \u201cWardrobe\u201d) so a whole module\u2019s specification fills in one click. "
   "<b>(4) Quotation</b> \u2014 on a lead, add a modular line, pick a module, <b>Apply Preset</b>, and a live price appears; the quote renders with a "
   "payment plan, bank details and T&amp;C. VEYRA already owns most of the second half (a quotation builder, a measurement engine, a GST engine, a "
   "panel-geometry engine); what is new is the <b>modular config layer</b> and one <b>deterministic modular-pricing model</b>.")]
st+=[PageBreak()]

# ================= PART A — EVIDENCE =================
st+=[Paragraph("PART A \u2014 EVIDENCE",kick),Paragraph("One entry per screen: what is literally on screen, then how VEYRA builds it",h2),rule(RED,1.4)]

def entry(fid,title,path,onscreen,build,w=150*mm,chips=None):
    blk=[Paragraph(f"{fid} \u2014 {title}",h3)]
    if chips: blk.append(chiprow(chips)); blk.append(Spacer(1,3))
    blk.append(img(path,w))
    blk.append(Paragraph("ON SCREEN",onscr)); blk.append(P(onscreen,small))
    blk.append(Paragraph("HOW VEYRA BUILDS IT",veyra)); blk.append(P(build,small))
    st.append(KeepTogether(blk)); st.append(Spacer(1,8))

entry("DZ-00","Settings \u2192 the Modular Catalog entry point",FR+"/f_003.png",
 "Dzylo Settings. An <b>Integrations</b> row (Integrate Leads, WhatsApp API &amp; Templates, Webhooks, Automations, Zoho Books, Dzylo Dialer, "
 "Voice API, AI Chat Agent) and a <b>Quotations</b> row (Quotation Catalog, <b>Modular Catalog</b>, Quotation Templates, Payment &amp; Tax "
 "Settings, Invoice Templates, Site Layout Templates, Modules List, Module Hardware &amp; Accessories).",
 "The modular catalog is tenant CONFIG, so it lives under VEYRA `/settings` beside numbering and quotation config \u2014 not as a top-level app "
 "area. Ignore the integrations row entirely (Zoho / Dialer / Voice / WhatsApp / AI-Chat are VEYRA out-of-scope, Part 8). Add one Settings card, "
 "\u201cModular Catalog\u201d, gated on a settings capability.")

entry("DZ-01","Catalogs tab \u2014 a tenant holds several catalogs",RF+"/X-categories.png",
 "URL `settings/modular-catalogs`. Four tabs: <b>Catalogs \u00b7 Components \u00b7 Categories \u00b7 Presets</b>. The list: <b>Modular Catalog [Default]</b>, "
 "<b>Modular Dzylo Modules \u2014 286 items</b>, <b>Modular 2.0 \u2014 285 items</b>. Buttons: Import, + Catalog. (A hover elsewhere exposes a "
 "`/componentConfig` route \u2014 components are their own config surface.)",
 "One config screen with four tabs. A <b>catalog</b> is a named set of modules with exactly one Default per tenant (scoped-unique). Open question: "
 "are Components/Categories/Presets shared tenant-wide or per-catalog? The video treats them as siblings of Catalogs, i.e. tenant-wide \u2014 see "
 "Q2. Each becomes a tenant-scoped table registered in `lib/data/tables.ts` with org-isolation asserts in `verify.mjs` (HARD RULE 3).")

entry("DZ-02","A module = a template (dimensions + part counts)",RF+"/P1-06_module_item_form.png",
 "\u201cUpdate Sink Carcass with Single Drawer Double Shutter \u2014 BUSC-1CD2S-900\u201d. Fields: image, <b>Category*</b> (Kitchen BaseUnit), Sub "
 "Category, <b>Code</b> (BUSC-1CD2S-900), Item Name*, <b>Width* 900 \u00b7 Height* 720 \u00b7 Depth* 580 mm</b>, <b>Shutters* 2 \u00b7 Shelves* 0 \u00b7 "
 "Panels* 0 \u00b7 Drawers* 1 \u00b7 Handles* 3 \u00b7 Hinges* 2</b>, Description, Specification, <b>UOM* (Nos)</b>, and an expandable <b>Settings</b> "
 "(item margin / discount / tax / HSN). The code encodes config+width (BU2S-900 = base-unit, 2-shutter, 900mm).",
 "A module is a reusable line template, analogous to VEYRA `items` (`lib/items-model.ts`: `Item`, UOMS, GST_RATES). New table "
 "`modular_modules` (org_id, catalog_id, category_id, code, name, width_mm, height_mm, depth_mm, shutters, shelves, panels, drawers, handles, "
 "hinges, uom, margin, discount, tax_rate, hsn). The part counts are what the pricing engine multiplies component rates by. Store dims in mm "
 "(integers) \u2014 `production-model` already works in mm.")

entry("DZ-03","~300 modules + Excel bulk import",RF+"/P1-09_excel_template.png",
 "\u201cModular Dzylo Modules\u201d list: S.No, Image, Name, Category, Code, Dimensions, Description, Specification, UOM, Shutters, Shelves\u2026 Rows like "
 "Bottle Pull Out BU1BPO-300 (300\u00d7720\u00d7580). A kebab menu offers <b>Import Excel \u00b7 Export To Excel \u00b7 Download Template</b>; there is a "
 "seed-library <b>Import</b> that fills a blank catalog with a starter set.",
 "Reuse VEYRA\u2019s bulk-item path: `lib/items-csv.ts` (+ `items-csv.test.ts`) and `BulkCreateResult` in `items-model.ts` already parse a template "
 "and report per-row outcomes \u2014 extend it for the module columns rather than writing a second importer. Watch the known trap: PostgREST bulk "
 "insert needs <b>uniform keys</b> across rows (Mistakes \u00a7Writes), so a blank optional column must be present as null, not omitted. The "
 "\u201cImport starter library\u201d is the mechanism behind the demo-data decision (Part B \u00a7Owner decisions).")

entry("DZ-04","Categories + subcategories",FR+"/f_077.png",
 "<b>Categories</b> tab. A <b>Create Category</b> dialog (Category Name, + Add Sub Category). The list: Kitchen Base Unit, Kitchen Tall Unit, "
 "Kitchen Wall Unit, Other Storage, Wardrobe, Wardrobe Loft \u2014 each with a Sub-Categories count and edit/delete.",
 "A two-level taxonomy. New table `modular_categories` (org_id, catalog scope per Q2, name, parent_id nullable for subcategory, seq). This is the "
 "same shape as any VEYRA lookup; reach it only through `withOrg()`. A module\u2019s `category_id` FK points here (composite `(id, org_id)` so another "
 "tenant\u2019s category can\u2019t be referenced \u2014 Mistakes \u00a7Writes, the same-tenant composite-FK rule).")

entry("DZ-05","Components \u2014 Carcass (the 5-price rate card)",RF+"/P2-13_carcass_list.png",
 "<b>Components</b> tab, sub-tabs <b>Carcass \u00b7 Shutters \u00b7 Drawers \u00b7 Handles \u00b7 Hinges \u00b7 Add Ons \u00b7 Accessories \u00b7 Edge Bands</b>. Carcass "
 "columns: Name, Brand, Description, <b>Box Price, Board Price, Shelf/Panel Price, Back Panel Price, Drawer Price, Margin</b>. Rows incl. Branded "
 "BWP (1200/400/400/200/2500), HDMR (600/200/200/100/1500), WPC (900/300/300/150/2000), MDF (550/180/180/90/1300).",
 "Eight component types = tenant rate cards. Carcass is the only one with five prices because it drives the box/board geometry (see engine). "
 "Model as `modular_components(type enum, name, brand, description, margin, prices jsonb)` OR five nullable price columns \u2014 recommend a typed "
 "price set per type. These rates are the tenant config the engine reads; <b>no rate is ever produced by a model</b> (RULE 2). Carcass box vs "
 "board price is the single most important concept \u2014 it needs an inline explainer (Part B).")

entry("DZ-06","Components \u2014 Shutter (Price + Visible Price)",RF+"/P2-14_shutter_list.png",
 "Shutter columns: Name, Brand, Description, <b>Price, Visible Price, Margin</b>. Rows: Veneer Both-Side (1200/600), Acrylic Plain (450/225), "
 "Acrylic Textured (500/250), AGT Poly-gloss (400/200)\u2026 Two prices because a shutter\u2019s front is the normal Price while an exposed side (e.g. an "
 "end-of-run corner) uses the <b>Visible Price</b>, both per sq ft.",
 "Shutter carries two per-sqft rates. The engine multiplies Price by front shutter area and Visible Price by the area of whichever sides the line "
 "marks visible. \u201cVisible Price / visible sides\u201d is non-obvious \u2192 inline explainer + a Q on how sides are chosen (Q8).")

entry("DZ-07","Components \u2014 Add-Ons (added to shutter/carcass cost)",RF+"/P2-17_hinges_addons.png",
 "Add Ons columns: Name, Brand, Description, <b>Price, Margin</b>. Rows: Carcass Handle Provision (100), Twin/double colour tape \u2014 Rehau \u2014 "
 "\u201cAdded to the original cost of shutter.\u201d (70), Steel-finish PVC tape (50), Shutter Classical style \u2014 Laminated (200), Handle-less P.U. door "
 "(150). Drawers / Handles / Hinges / Accessories / Edge Bands all share this single-price shape.",
 "Add-ons are surcharges attached to either the shutter or the carcass subtotal (the description says which). Model the generic component as "
 "Name/Brand/Description/Price/Margin, with Carcass (5 prices) and Shutter (2 prices) as the two specialisations. An add-on row needs an "
 "`applies_to` (shutter|carcass) so the engine adds it to the right subtotal \u2014 the video states this verbally; capture it explicitly.")

entry("DZ-08","Components \u2014 Edge Bands (priced per running foot)",RF+"/P2-19_edgebands_list.png",
 "Edge Bands: <b>0.8mm \u00d7 22mm \u2014 Price 5</b>, <b>2mm \u00d7 22mm \u2014 Price 15</b>. Price is <b>per running foot (RFT)</b>, not per unit \u2014 it "
 "multiplies the exposed perimeter of the panels.",
 "Edge-band cost = banded perimeter \u00d7 RFT rate. VEYRA already computes banding length: `production-model.panelBandingMm(panel)` returns the mm "
 "of banding for a panel \u2014 reuse it, convert mm\u2192RFT, \u00d7 rate. This is the clearest example of \u201cthe geometry already exists\u201d.")

entry("DZ-09","Presets \u2014 the headline feature (a saved bundle)",RF+"/P4-27_lead_hub.png",
 "<b>Presets</b> tab: <b>1 Kitchen</b>, <b>2 Wardobe [Default]</b>, + Preset. A preset is a named, reusable specification.",
 "New table `modular_presets` (org_id, scope per Q2, name, description, is_default, config jsonb). A preset stores component <i>choices</i> (which "
 "shutter, which carcass, edge-bands, add-ons, visibility, back-panel, and drawer/handle/hinge/accessory selections) \u2014 not prices; prices are "
 "resolved at quote time from the current rate cards, so a rate change reprices every future quote automatically. This is a config bundle, the "
 "same idea as VEYRA\u2019s prompt-library templates (`lib/prompt-library-model.ts`: assemble from parts).")

entry("DZ-10","The Preset editor \u2014 every field that fills a line",RF+"/P3-21_preset_carcass_vis.png",
 "<b>Update Preset</b> modal. <b>Name*, Description</b>. <b>Shutter / Visible</b>: Shutter, Edge Band, Add Ons. <b>Carcass</b>: Carcass, Edge Band, "
 "Add Ons, <b>Visible Sides</b>, <b>Visibility Config</b> (dropdown open: <b>Additional Panel</b> \u2713 | <b>Integrated Carcass</b>), <b>Back "
 "Panel</b> (Regular | Thin). Then collapsible <b>Drawers (+Drawer) \u00b7 Handles (+Handle) \u00b7 Hinges (+Hinge) \u00b7 Accessories (+Accessory)</b>. "
 "(Narration adds an <b>Installation rate</b>, e.g. \u20b9300/installation.)",
 "This modal defines the exact shape of a modular line spec \u2014 build the shared editor component once and reuse it for both \u201cedit preset\u201d and "
 "\u201cedit a quotation line\u201d (DZ-11 is the same form). The enumerations (Visibility Config, Back Panel, drawer Type/Placement/Price-Strategy) "
 "belong in a pure model as consts (like `MEASURE_MODES`), never in JSX (Mistakes \u00a7React: a client-const-on-server bug). Each non-obvious option "
 "carries an inline explainer (Part B).")

entry("DZ-11","Add Item \u2192 Apply Preset \u2192 live price",RF+"/P4-31_additem_preset_applied.png",
 "URL `/quotation-maker/<lead>/<id>`. <b>Add Item</b> with a <b>Presets</b> dropdown at the top; the same Shutter/Carcass/Drawers\u2026 sections "
 "auto-filled (Acrylic Textured, 2mm\u00d722mm, Commercial Ply, Additional Panel, Regular Panel). A <b>Drawer 1</b> block: Width/Height/Depth/Count "
 "(mm), <b>Mechanism</b>, <b>Type</b> (Full Body|Base Back), <b>Placement</b> (External|Internal), <b>Price Strategy</b> (Per Unit|Per Board). "
 "Behind, the builder rail: Base Price, Margin, ItemWise Discount, Additional Charges, Discounts, Sub Total, Tax, Final Price. Bottom: "
 "<b>Price: INR 52,127</b> (live, info icon) and <b>Add Item</b>. Elsewhere: an <b>eye</b> reveals the box/board/back-panel breakdown, and the "
 "form blocks Add Item until a drawer <b>Mechanism</b> is chosen.",
 "This is the deterministic engine made visible: dimensions + part counts + resolved component rates \u2192 a Base Price, in front of the existing "
 "line maths. Build `lib/modular-pricing-model.ts` (pure, tested) returning both the price and its component breakdown (for the eye popover and "
 "for audit). Its output flows into `computeLine` \u2192 `computeQuoteTotals` (quotations-model) exactly as `resolveQty` does today \u2014 the engine "
 "sits in front and never alters the GST/discount maths. Reuse `production-model.panelAreaSqm` / `panelBandingMm`. Validation (mechanism "
 "required) is server-checked, not just client. \u201cPer Unit vs Per Board\u201d and \u201cFull Body vs Base Back\u201d get explainers.")

entry("DZ-12","Where a quotation starts \u2014 the lead hub",FR+"/f_095.png",
 "\u201cLead Data\u201d, ID 547 / Mr Ramesh / project-2BHK in Delhi. Tiles: Basic Details, <b>Quotation Generator</b>, Inspirations, Designs &amp; "
 "Documents, Project Management, Financial Planning, Site Progress, Communication, Virtual Tour, Quotations &amp; Site Details.",
 "VEYRA already opens quotations from a lead (`/leads/[id]` \u2192 quotations). No new hub needed \u2014 the modular quotation is just a quotation whose "
 "`type = 'modular'`. Keep VEYRA\u2019s existing lead detail; do not clone this tile grid.")

entry("DZ-13","Quotation Generator \u2014 versions, reviewers, approvals",FR+"/f_096.png",
 "URL `/quotation/generator`. Sub-tabs <b>Quotations \u00b7 Site Measurements \u00b7 Approvals</b>. Columns: Name, <b>Version (v1)</b>, Final Amount, "
 "Items, Author, Created/Updated, <b>State (Created)</b>, <b>Reviewer</b>, <b>Review Status</b>. + Quotation. On create: Name + <b>Type = "
 "Modular</b>. (Narration: Growth plan = modular-only quotations; Pro/Enterprise = mixed modular + normal.)",
 "VEYRA already has a quotations list, versioning and templates (`app/(app)/quotations`, `lib/quotations-model.ts` QUOTE_STATUSES, "
 "`quotations-diff.ts`). Add a `type` (normal|modular) to the create flow. The plan-gating (Growth vs Pro) is a business rule \u2014 VEYRA has no such "
 "quotation plan tiers today; Q3. Reviewer/approval already exists conceptually via `can()` \u2014 don\u2019t rebuild it.")

entry("DZ-14","The output \u2014 builder rail, preview, payment plan",FR+"/f_104.png",
 "\u201cModular Quote for Mr. Ramesh\u201d. Left rail: Base Price, Margin, ItemWise Discount, Additional Charges, Discounts, Sub Total, Tax, Final Price. "
 "<b>Items | Preview</b>. Preview: line table (Description, Image, Dimensions, UOM, USP, QTY, Price), Summary (Category/Quantity/Price/Discount/"
 "Total \u2192 Final Total), <b>Payment Plan</b> (Advance 25% \u00b7 Before Production 50% \u00b7 Before Installation 10% \u00b7 HandOver 15%), Bank Details, "
 "Terms &amp; Conditions. Column customisation (e.g. hide Dimensions).",
 "Almost entirely already built in VEYRA: `quotations-pdf.ts` renders the quote; payment schedule maps to VEYRA `milestones`; bank/T&C are "
 "template config; GST via `computeGstTotals`. The only new work is making a <b>modular line</b> render (its dimensions/area/breakdown) and adding "
 "column-visibility. Do not rebuild the quote document.")

st+=[PageBreak()]

# ================= PART B — INSTRUCTION =================
st+=[Paragraph("PART B \u2014 INSTRUCTION (what we build, and why)",kick),Paragraph("The build plan",h2),rule(RED,1.4),
 P("Modular Quotation 2.0 is an <b>extension of VEYRA\u2019s existing quotation builder</b>, not a new product. It adds a tenant <b>config layer</b> "
   "(catalogs, modules, categories, components, presets) and <b>one deterministic pricing model</b>. The builder, GST engine, versioning, PDF, "
   "payment plan and lead flow already exist."),
 Paragraph("1 \u00b7 What already exists in VEYRA \u2014 do not rebuild (checked, with receipts)",h3)]
reuse=Table([
 [P("<b>Quotation builder</b>",cellL),P("`app/(app)/quotations/` \u2014 `quote-builder.tsx` (16KB), `line-dialog.tsx` (14.5KB), `item-combobox.tsx`, `page.tsx`, `templates/`, `[id]/`, `new/`. Extend the line dialog; do not start a new builder.",cellL)],
 [P("<b>Line &amp; quote maths</b>",cellL),P("`lib/quotations-model.ts` \u2014 `computeLine` (LineInput\u2192LineTotals), `computeQuoteTotals`, `marginPct`, `QuotationLine`/`Section`, discount + GST engine (`splitGst`, `computeGstTotals`, INDIAN_STATES). The modular price feeds this unchanged.",cellL)],
 [P("<b>Deterministic qty</b>",cellL),P("`lib/measurement-model.ts` \u2014 `deriveQty`/`resolveQty` over area/elevation/linear/count/lumpsum, with a <i>visible formula</i>. The exact pattern the modular engine follows; its docstring already states RULE 2.",cellL)],
 [P("<b>Panel geometry</b>",cellL),P("`lib/production-model.ts` \u2014 `panelAreaSqm(l_mm,w_mm)`, `panelBandingMm(panel)`, `effectiveQty`, Grain. Carcass box/board area and edge-band running length come from here.",cellL)],
 [P("<b>Bulk import</b>",cellL),P("`lib/items-csv.ts` + `items-model.ts` `BulkCreateResult`/`BulkItemOutcome`, UOMS, GST_RATES. Reuse for the module Excel import.",cellL)],
 [P("<b>The spine</b>",cellL),P("`lib/scope-model.ts` (`ScopeItem`, `buildScopeTree`). A modular quotation line should resolve to a `scope_item` like every other line (Reuse index: \u201cone row a quote line, a material request, a PO and a cut panel all resolve to\u201d).",cellL)],
 [P("<b>Numbering / PDF</b>",cellL),P("`lib/data/config.ts` (`issueDocNumber`/`previewNextNumber`, Indian-FY), `lib/quotations-pdf.ts` (11.7KB) renders the quote, `quotation-templates-model.ts` for bank/T&C templates.",cellL)],
 [P("<b>Tenant guard / tables</b>",cellL),P("`lib/data/with-org.ts` (only guard), `lib/data/tables.ts` (registers `quotations`/`quotation_sections`/`quotation_lines`/`quotation_templates`\u2026). Every new table registers here + `verify.mjs` asserts isolation.",cellL)],
],colWidths=[30*mm,138*mm])
reuse.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LINEBELOW",(0,0),(-1,-2),0.5,LINE),("BACKGROUND",(0,0),(0,-1),SUNK),
 ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)]))
st+=[reuse,Spacer(1,4),
 P("<b>The single most valuable line in this report:</b> the second half of the video (builder, versioning, reviewers, payment plan, PDF, GST) is "
   "mostly built. The genuinely new work is the config layer and the pricing model.")]

# Data model
st+=[Paragraph("2 \u00b7 The data model (new tables \u2014 all tenant-scoped, additive, idempotent)",h3),
 P("Every table below carries `org_id uuid not null references public.orgs(id) on delete cascade`, is added to `lib/data/tables.ts`, and gains "
   "org- and project-isolation asserts in `scripts/verify.mjs` (HARD RULE 3; a new table is three edits). Numbers = migration slots from 0044.")]
dm=Table([
 [P("<b>0044 `modular_catalogs`</b>",cellL),P("org_id, name, is_default, description. One default per org (scoped-unique partial index).",cellL)],
 [P("<b>0045 `modular_categories`</b>",cellL),P("org_id, catalog scope (Q2), name, parent_id (nullable = subcategory), seq. Composite `(id, org_id)` for same-tenant FKs.",cellL)],
 [P("<b>0046 `modular_components`</b>",cellL),P("org_id, type (carcass|shutter|drawer|handle|hinge|addon|accessory|edgeband), name, brand, description, margin, applies_to (add-ons), and typed prices: carcass{box,board,shelf_panel,back_panel,drawer}, shutter{price,visible}, others{price}. Prices are per-sqft or per-RFT by type.",cellL)],
 [P("<b>0047 `modular_modules`</b>",cellL),P("org_id, catalog_id, category_id, code, name, width_mm, height_mm, depth_mm, shutters, shelves, panels, drawers, handles, hinges, uom, margin, discount, tax_rate, hsn, image_ref (optional upload; NOT generated).",cellL)],
 [P("<b>0048 `modular_presets`</b>",cellL),P("org_id, scope (Q2), name, description, is_default, config jsonb (component choices + visibility + back panel + drawers/handles/hinges/accessories + installation_rate).",cellL)],
 [P("<b>0049 `modular_line_config`</b>",cellL),P("the per-line spec: line_id \u2192 `quotation_lines`(id), module_id, applied_preset_id, resolved component ids, dims override, drawers[], visible_sides, visibility_config, back_panel, installation_rate, computed_breakdown jsonb. One row per modular line (scoped-unique on line_id).",cellL)],
],colWidths=[42*mm,126*mm])
dm.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LINEBELOW",(0,0),(-1,-2),0.5,LINE),("BACKGROUND",(0,0),(0,-1),SUNK),
 ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)]))
st+=[dm,Spacer(1,3),
 P("<b>A modular line is still a `quotation_line`</b> (so totals, GST, discounts, PDF, versioning all work unchanged); `modular_line_config` hangs "
   "off it holding the spec and the computed breakdown. <b>Totals are derived, never stored</b> (RULE 6): the line\u2019s price is recomputed from the "
   "config + current rates, and `verify.mjs` should assert a stored grand-total column does not exist.")]

# The engine
st+=[CondPageBreak(60*mm),Paragraph("3 \u00b7 The deterministic modular-pricing model (`lib/modular-pricing-model.ts`, NEW, pure + tested)",h3),
 P("The heart of the feature, and the expensive half \u2014 it is a <b>domain-data problem</b>, not a coding one. Given a module (dims + counts), a "
   "resolved component set (rates), and the line config, it returns a Base Price <b>and</b> its breakdown. No value is ever an LLM output (RULE 2). "
   "The formulas, read off the narration \u2014 <b>confirm each with the owner</b>, they drive every rupee:")]
st+=[BUL([
 "<b>Carcass box price</b> = counts two faces only (height \u00d7 width) \u00d7 carcass box rate. Used when the carcass is simple.",
 "<b>Carcass board price</b> = counts all five sides (leaving the shutter front) \u00d7 carcass board rate. Box vs board is chosen per line.",
 "<b>Shelves</b> (horizontal) and <b>panels</b> (vertical): count \u00d7 area \u00d7 shelf/panel rate.",
 "<b>Back panel</b>: its own (cheaper) rate; Regular vs Thin picks the rate.",
 "<b>Shutter</b>: front area \u00d7 Price; each <b>visible side</b> area \u00d7 Visible Price. Visibility config (Additional Panel adds a shutter on top of "
   "the carcass; Integrated Carcass replaces the carcass and applies shutter on the front) changes what area is charged.",
 "<b>Edge band</b>: banded perimeter (`panelBandingMm`) \u00d7 per-RFT rate.",
 "<b>Drawers</b>: <b>Per Unit</b> = fixed price \u00d7 count; <b>Per Board</b> = built from W\u00d7H\u00d7D custom + mechanism; Full Body vs Base Back changes "
   "how many sides are material; External vs Internal is placement.",
 "<b>Add-ons</b> add to the shutter or carcass subtotal (per the component\u2019s applies_to). <b>Handles/Hinges</b>: set price \u00d7 count. "
   "<b>Accessories</b>: chosen items \u00d7 price. <b>Installation</b>: a per-installation rate added to the line.",
 "<b>Margins</b> apply at component, item (module) and quote level \u2014 precedence must be fixed (Q5).",
],small),
 P("Every intermediate travels with its two inputs (a price without its geometry is untrustworthy \u2014 Mistakes \u00a7Reads); the breakdown is what the "
   "<b>eye</b> popover shows and what `modular_line_config.computed_breakdown` stores for audit.")]

# Owner decisions
st+=[Paragraph("4 \u00b7 Owner decisions folded in (your two asks)",h3),
 P("<b>(a) Demo / placeholder data that clears itself.</b> Every config list (each Component type, Categories, Presets, Modules) ships with example "
   "rows drawn from the video\u2019s own data, shown inside a marked \u201cDEMO \u2014 sample, replace me\u201d box. The moment the tenant adds their first real "
   "row in that section, the demo box disappears. Mechanism: seed rows with `is_demo = true` (per the video values \u2014 e.g. Carcass: Branded BWP "
   "1200/400/400/200/2500\u2026); the list hides the demo box once a non-demo row exists, and demo rows are excluded from any real quotation\u2019s pricing "
   "until the tenant explicitly keeps them. This is essentially VEYRA\u2019s existing seed pattern, flagged and self-clearing \u2014 and it also solves the "
   "\u201cImport starter library\u201d button (DZ-03). <b>Q7</b> settles auto-clear vs manual-dismiss and per-tenant-seed vs shared-sample-import."),
 P("<b>(b) Inline explainer boxes on non-obvious options.</b> Clicking (or hovering) an option opens a short \u201cwhat this is\u201d box \u2014 the same "
   "philosophy as `measurement-model`\u2019s visible formula. Author the copy once as a pure vocabulary map (like `prompt-library-model` VOCAB), keyed "
   "by option, so it is testable and never lives in JSX. The video hands us the exact copy:")]
exp=Table([
 [P("<b>Box price</b>",cellL),P("Counts two dimensions only \u2014 height \u00d7 width.",cellL)],
 [P("<b>Board price</b>",cellL),P("Counts all five sides, leaving the shutter front.",cellL)],
 [P("<b>Shelves / Panels</b>",cellL),P("Shelves are horizontal, panels vertical \u2014 priced per sq ft.",cellL)],
 [P("<b>Back panel</b>",cellL),P("Separate, cheaper rate because the back panel is thin (Regular vs Thin).",cellL)],
 [P("<b>Visible price</b>",cellL),P("For a side that is exposed (e.g. an end-of-run corner) \u2014 shutter applied there, per sq ft.",cellL)],
 [P("<b>Additional Panel vs Integrated Carcass</b>",cellL),P("Additional = shutter goes on top of the carcass. Integrated = carcass replaced, shutter on the front only.",cellL)],
 [P("<b>Full Body vs Base Back</b>",cellL),P("Full Body = all drawer sides are material. Base Back = only bottom, front and back are material; the two sides are the mechanism (typical kitchen).",cellL)],
 [P("<b>External vs Internal</b>",cellL),P("External opens directly (chest of drawers). Internal sits inside a wardrobe you open first.",cellL)],
 [P("<b>Per Unit vs Per Board</b>",cellL),P("Per Unit = a fixed price. Per Board = custom, define width/height/depth + count.",cellL)],
 [P("<b>Add-on</b>",cellL),P("An extra added to the shutter or carcass cost (e.g. handle provision +\u20b9100).",cellL)],
 [P("<b>Edge band</b>",cellL),P("Priced per running foot of exposed panel edge.",cellL)],
],colWidths=[52*mm,116*mm])
exp.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LINEBELOW",(0,0),(-1,-2),0.5,LINE),("BACKGROUND",(0,0),(0,-1),SUNK),
 ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)]))
st+=[exp]

# Units
st+=[CondPageBreak(50*mm),Paragraph("5 \u00b7 The work, as numbered units (dispatch one at a time, never parallel)",h3)]
units=Table([
 [P("<b>U1</b>",cellL),P("`modular_categories` \u2014 table + model + settings screen + demo rows. <b>S</b>",cellL)],
 [P("<b>U2</b>",cellL),P("`modular_components` \u2014 table + typed price model + tabbed screen (8 types) + demo rows + explainer-copy map. <b>M</b>",cellL)],
 [P("<b>U3</b>",cellL),P("`modular_catalogs` + `modular_modules` \u2014 tables + model + list + item form + Excel import (reuse `items-csv`). <b>M</b>",cellL)],
 [P("<b>U4</b>",cellL),P("`modular_presets` \u2014 table + config model + preset editor (the shared spec form) + demo preset. <b>M</b>",cellL)],
 [P("<b>U5</b>",cellL),P("`lib/modular-pricing-model.ts` \u2014 the deterministic engine + exhaustive tests. Reuse `production-model` geometry. <b>L / research</b>",cellL)],
 [P("<b>U6</b>",cellL),P("Add-Modular-Item editor \u2014 extend `line-dialog.tsx`: Apply Preset, live price, eye breakdown, mechanism validation (server-checked). <b>L</b>",cellL)],
 [P("<b>U7</b>",cellL),P("`modular_line_config` persistence + modular line flows into `computeQuoteTotals`; `type='modular'` on create; column customisation. <b>M</b>",cellL)],
 [P("<b>U8</b>",cellL),P("Preview / PDF \u2014 make a modular line render (dims/area/breakdown) in `quotations-pdf.ts`; verify payment plan + GST unchanged. <b>M</b>",cellL)],
 [P("<b>U9</b>",cellL),P("Shared demo-data self-clearing + explainer-box component, adopted across U1\u2013U4. <b>S</b>",cellL)],
],colWidths=[14*mm,154*mm])
units.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LINEBELOW",(0,0),(-1,-2),0.5,LINE),
 ("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)]))
st+=[units]

# NOT building
st+=[Paragraph("6 \u00b7 NOT building (said out loud)",h3),
 BUL([
  "<b>Module 3D renders / generated images</b> \u2014 the thumbnails. Part 8 lists 2D\u21923D and text-to-image as settled NO. Allow an uploaded image or a neutral icon; generate nothing.",
  "<b>The integrations row</b> (Zoho Books, Dzylo Dialer, Voice API, AI Chat Agent, WhatsApp) \u2014 VEYRA out-of-scope (Part 8).",
  "<b>\u201cSmart Actions\u201d AI</b> and any AI-authored numbers or specs.",
  "<b>The competitor\u2019s dense 12-column matrix look</b> \u2014 keep the information, drop the density (standing instruction).",
  "<b>A second quotation builder, GST engine, or PDF</b> \u2014 all exist; extend, don\u2019t fork.",
 ],small,b="\u00d7")]

# Open questions
st+=[Paragraph("7 \u00b7 Open questions \u2014 answer in one pass, ordered by how much each changes the work",h3),
 BUL([
  "<b>Q1 (biggest).</b> \u201cQuotation 2.0\u201d is on the PARKED list (Part 8). Confirm we are un-parking it \u2014 all of Part B assumes yes.",
  "<b>Q2.</b> Are Components / Categories / Presets shared tenant-wide, or scoped per catalog? (Video suggests tenant-wide; it changes every FK.)",
  "<b>Q3.</b> Plan gating \u2014 Dzylo restricts Growth to modular-only and lets Pro/Enterprise mix modular + normal lines. VEYRA has no quotation plan tiers today. Gate, or allow mixed for everyone?",
  "<b>Q4.</b> Modular line storage \u2014 the child table `modular_line_config` (recommended, auditable) vs a JSON column on `quotation_lines`?",
  "<b>Q5.</b> Margin precedence \u2014 component margin, module (item) margin and quote margin all exist. In what order do they apply?",
  "<b>Q6.</b> UOM \u2014 modules show \u201cNos\u201d but price by area / running foot internally. Is the displayed UOM always Nos, with geometry internal?",
  "<b>Q7.</b> Demo data \u2014 auto-clear on first real row, or manual \u201cdismiss demo\u201d per section? And per-tenant seeded rows vs a shared read-only sample library the tenant imports (the video\u2019s Import button)?",
  "<b>Q8.</b> Visible sides \u2014 how does a line choose which faces are visible (Top/Bottom/Left/Right multiselect), and which faces feed the visible-price area?",
 ],small)]

st+=[Spacer(1,8),notice("Next step",
 ["Correct this report \u2014 expect it to be substantial. On your OK I split it into the two repo files the sub-agents read "
  "(`FRAME-REGISTER-DZYLO.md` = Part A, `PLAN-DZYLO.md` = Part B) and persist the frames into the repo so a new chat can open them by id. "
  "Then U1\u2013U9 get built one at a time, each with the six gates, a browser pass, and a commit. <b>Nothing is built until you say so.</b>"],bg=INK)]

doc.build(st)
print("WROTE",OUT,os.path.getsize(OUT),"bytes")
