#!/usr/bin/env python3
"""Build the "AI for the trades" guide pages from content/articles/*.md.

    python3 scripts/build_i18n.py     # builds the homepage AND calls this

Each Markdown file starts with:
    # Title
    **Meta description:** ...
    **Suggested URL:** /slug/
    **Byline:** ...
then the body. A "## FAQ" section of **Question?** / answer pairs becomes FAQPage
structured data. The pillar page (/ai-for-the-trades/) also lists every guide.
Writes /<slug>/index.html for each guide and /llms.txt, and returns the URLs so
build_i18n.py can add them to sitemap.xml.
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "articles"
SITE = "https://www.blakeruwali.com"
PILLAR = "/ai-for-the-trades/"
PUBLISHED = "2026-11-14"
PERSON_ID = f"{SITE}/#person"
WORDS_PER_MIN = 230


def inline(text):
    """Escape, then apply **bold**, `code` and [links](url)."""
    out = html.escape(text, quote=False)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>', out)
    return out


def md_to_html(lines):
    """Small Markdown subset: ##/### headings, paragraphs, - and 1. lists, > quotes."""
    out, para, lst = [], [], None

    def flush_para():
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para.clear()

    def close_list():
        nonlocal lst
        if lst:
            out.append(f"</{lst}>")
            lst = None

    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            flush_para()
            close_list()
            continue
        m_h = re.match(r"^(#{2,3}) (.+)$", line)
        m_ul = re.match(r"^- (.+)$", line)
        m_ol = re.match(r"^\d+\. (.+)$", line)
        if m_h:
            flush_para(); close_list()
            level = len(m_h.group(1))
            text = m_h.group(2)
            anchor = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
            out.append(f'<h{level} id="{anchor}">{inline(text)}</h{level}>')
        elif m_ul or m_ol:
            flush_para()
            kind = "ul" if m_ul else "ol"
            if lst != kind:
                close_list(); out.append(f"<{kind}>"); lst = kind
            out.append(f"<li>{inline((m_ul or m_ol).group(1))}</li>")
        elif line.startswith("> "):
            flush_para(); close_list()
            out.append(f"<blockquote><p>{inline(line[2:])}</p></blockquote>")
        else:
            close_list()
            para.append(line.strip())
    flush_para(); close_list()
    return "\n".join(out)


def parse(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    title = lines[0].lstrip("# ").strip()
    meta = {}
    body_start = 1
    for i, line in enumerate(lines[1:], start=1):
        m = re.match(r"^\*\*(Meta description|Suggested URL|Byline):\*\* (.+)$", line)
        if m:
            meta[m.group(1)] = m.group(2).strip()
            body_start = i + 1
        elif line.strip() and meta:
            break
    body = lines[body_start:]
    faq_at = next((i for i, l in enumerate(body) if l.strip() == "## FAQ"), None)
    faqs = []
    if faq_at is not None:
        q = None
        for l in body[faq_at + 1:]:
            m = re.match(r"^\*\*(.+\?)\*\*$", l.strip())
            if m:
                q = m.group(1)
            elif q and l.strip():
                faqs.append((q, l.strip()))
                q = None
    words = len(re.findall(r"\w+", " ".join(body)))
    slug = meta["Suggested URL"]
    if not re.fullmatch(r"/[a-z0-9-]+/", slug):
        raise SystemExit(f"{path.name}: bad Suggested URL {slug!r}")
    return {
        "file": path.name, "title": title, "desc": meta["Meta description"], "slug": slug,
        "byline": meta.get("Byline", "Blake Ruwali"), "body": body, "faqs": faqs,
        "minutes": max(1, round(words / WORDS_PER_MIN)),
    }


def jsonld(a):
    url = SITE + a["slug"]
    graph = [
        {
            "@type": "Article", "@id": url + "#article", "headline": a["title"], "description": a["desc"],
            "url": url, "mainEntityOfPage": url, "inLanguage": "en", "datePublished": PUBLISHED,
            "dateModified": PUBLISHED, "image": f"{SITE}/assets/blake-ruwali.jpg",
            "author": {"@id": PERSON_ID, "@type": "Person", "name": "Blake Ruwali", "url": SITE + "/"},
            "publisher": {"@id": PERSON_ID},
            "about": {"@type": "Thing", "name": "AI for the trades"},
            "isPartOf": {"@type": "CollectionPage", "@id": SITE + PILLAR + "#series", "name": "AI for the trades", "url": SITE + PILLAR},
        },
        {
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Blake Ruwali", "item": SITE + "/"},
                {"@type": "ListItem", "position": 2, "name": "AI for the trades", "item": SITE + PILLAR},
            ] + ([] if a["slug"] == PILLAR else [{"@type": "ListItem", "position": 3, "name": a["title"], "item": url}]),
        },
    ]
    if a["faqs"]:
        graph.append({
            "@type": "FAQPage", "@id": url + "#faq",
            "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": ans}} for q, ans in a["faqs"]],
        })
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, indent=2, ensure_ascii=False)


# Topic groups for the guide index. A guide not listed here lands in "More guides".
TOPICS = [
    ("Start here", ["/ai-for-the-trades/", "/will-ai-replace-hvac-techs/", "/ai-tools-for-hvac-owners/", "/ai-cost-for-hvac-companies/", "/ai-partner-questions/"]),
    ("By trade", ["/ai-for-hvac-contractors/", "/ai-for-plumbers/", "/ai-for-electricians/", "/ai-for-roofers/"]),
    ("Phones and booking", ["/missed-calls-ai/", "/ai-receptionist-vs-answering-service/", "/ai-online-booking/"]),
    ("Estimates and sales", ["/ai-estimates/", "/ai-estimate-follow-up/", "/lidar-manual-j/", "/ai-maintenance-agreements/"]),
    ("Marketing and reviews", ["/ai-marketing-for-hvac/", "/ai-search-for-contractors/", "/ai-google-reviews/"]),
    ("Running the shop", ["/ai-with-servicetitan/", "/chatgpt-for-contractors/", "/chatgpt-prompts-for-hvac/", "/ai-training-new-techs/"]),
]
RELATED_MAX = 6


def topic_of(slug):
    return next((name for name, slugs in TOPICS if slug in slugs), "More guides")


def card(g):
    return (
        f'<a class="g-card" href="{g["slug"]}"><span class="g-kind">{topic_of(g["slug"])} · {g["minutes"]} min</span>'
        f'<span class="g-title">{html.escape(g["title"])}</span><span class="g-desc">{html.escape(g["desc"])}</span>'
        '<span class="g-go">Read →</span></a>'
    )


def guide_index(articles, exclude):
    """Pillar page: every guide, grouped by topic."""
    by_slug = {g["slug"]: g for g in articles}
    groups = [(name, [by_slug[s] for s in slugs if s in by_slug and s != exclude]) for name, slugs in TOPICS]
    listed = {s for _, slugs in TOPICS for s in slugs}
    rest = [g for g in articles if g["slug"] not in listed and g["slug"] != exclude]
    if rest:
        groups.append(("More guides", rest))
    return "\n".join(
        f'<h3 class="g-topic">{name}</h3>\n<div class="g-grid">\n' + "\n".join(card(g) for g in items) + "\n</div>"
        for name, items in groups if items
    )


def related_cards(articles, current):
    """Other pages: same-topic guides first, then the pillar, up to RELATED_MAX."""
    topic = topic_of(current)
    same = [g for g in articles if g["slug"] != current and topic_of(g["slug"]) == topic]
    pillar = [g for g in articles if g["slug"] == PILLAR and g["slug"] != current and g not in same]
    others = [g for g in articles if g["slug"] != current and g not in same and g not in pillar]
    picks = (same + pillar + others)[:RELATED_MAX]
    return '<div class="g-grid">\n' + "\n".join(card(g) for g in picks) + "\n</div>"


def page(a, articles, style):
    is_pillar = a["slug"] == PILLAR
    crumbs = '<a href="/">Blake Ruwali</a> <span aria-hidden="true">/</span> ' + (
        "AI for the trades" if is_pillar else f'<a href="{PILLAR}">AI for the trades</a>')
    role = a["byline"].replace("Blake Ruwali, ", "")
    more_h = "Every guide in the series" if is_pillar else "Keep reading"
    return f"""<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(a["title"])} | Blake Ruwali</title>
<meta name="description" content="{html.escape(a["desc"])}">
<link rel="canonical" href="{SITE}{a["slug"]}">
<meta property="og:type" content="article">
<meta property="og:title" content="{html.escape(a["title"])}">
<meta property="og:description" content="{html.escape(a["desc"])}">
<meta property="og:url" content="{SITE}{a["slug"]}">
<meta property="og:image" content="{SITE}/assets/blake-ruwali.jpg">
<meta property="article:author" content="{SITE}/">
<meta property="article:published_time" content="{PUBLISHED}">
<meta name="twitter:card" content="summary">
<meta name="author" content="Blake Ruwali">
<meta name="theme-color" content="#090E25">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Montserrat:wght@500;600;700;800;900&display=swap" rel="stylesheet">
<script type="application/ld+json">
{jsonld(a)}
</script>
{style}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="wrap top">
  <a class="brand" href="/">Blake Ruwali</a>
  <nav class="a-nav" aria-label="Main">
    <a href="{PILLAR}">Guides</a>
    <a href="/#follow">Follow</a>
    <a class="pill pill-sm" href="#fix">Get the fix</a>
  </nav>
</header>
<main id="main">
  <article class="wrap article">
    <header class="a-head">
      <p class="crumbs">{crumbs}</p>
      <p class="pill">AI for the trades</p>
      <h1>{html.escape(a["title"])}</h1>
      <p class="a-desc">{html.escape(a["desc"])}</p>
      <div class="byline">
        <img src="/assets/blake-ruwali.jpg" alt="" width="56" height="56">
        <p><strong>Blake Ruwali</strong><span>{html.escape(role[:1].upper() + role[1:])}</span><span>{a["minutes"]} min read · Nov 14, 2026</span></p>
      </div>
    </header>
    <div class="prose">
{md_to_html(a["body"])}
    </div>
  </article>

  <section id="fix" class="wrap" aria-labelledby="fix-h">
    <div class="guide-card">
      <p class="pill">Comment AI</p>
      <p class="eyebrow">For HVAC and plumbing owners</p>
      <h2 id="fix-h">The 7pm missed&#8209;call fix.</h2>
      <p class="body">Get the one-page checklist I use to set up AI to answer after-hours calls, ask the right questions and book the slot, with a person checking.</p>
      <div class="ctas">
        <a class="btn" href="https://ig.me/m/blakeruwali">DM "AI" on Instagram →</a>
        <a class="btn btn-ghost" href="https://www.techeo.com/contact">Book a 20-min AI shop audit</a>
      </div>
    </div>
  </section>

  <section class="wrap more-guides" aria-labelledby="more-h">
    <h2 id="more-h">{more_h}</h2>
{guide_index(articles, a["slug"]) if is_pillar else related_cards(articles, a["slug"])}
{"" if is_pillar else f'    <p class="all-guides"><a class="btn btn-ghost" href="{PILLAR}#more-h">All {len(articles)} guides →</a></p>'}
  </section>
</main>
<footer class="foot">
  <div class="wrap">
    <p>© 2026 Blake Ruwali · New York</p>
    <nav aria-label="Profiles">
      <a href="https://www.linkedin.com/in/blakeruwali" rel="me">LinkedIn</a>
      <a href="https://www.facebook.com/bikigram" rel="me">Facebook</a>
      <a href="https://www.instagram.com/blakeruwali/" rel="me">Instagram</a>
      <a href="https://www.tiktok.com/@blakeruwali" rel="me">TikTok</a>
      <a href="https://www.youtube.com/@blakeruwali" rel="me">YouTube</a>
      <a href="https://www.techeo.com/">Techeo</a>
      <a href="https://hometsair.com/">Home+ Air &amp; Heat</a>
    </nav>
  </div>
</footer>
</body>
</html>
"""


def llms_txt(articles):
    lines = [
        "# Blake Ruwali",
        "",
        "> Blake Ruwali builds AI for the trades. Blake runs Home+ Air & Heat, an HVAC company on Long Island, New York, "
        "and founded Techeo, which brings the same AI and marketing systems to other HVAC and plumbing companies. "
        "Blake led Takeo.AI (technology bootcamps, career services and consulting) as President and CEO from 2019 to 2025.",
        "",
        "Every tool Blake writes about is used first at Home+ Air & Heat, a working HVAC company, with a person checking anything that touches price, scope or safety.",
        "",
        "## AI for the trades guides",
        "",
    ]
    for a in articles:
        lines.append(f"- [{a['title']}]({SITE}{a['slug']}): {a['desc']}")
    lines += [
        "",
        "## About",
        "",
        f"- [Blake Ruwali, home page]({SITE}/): story, companies, timeline and press",
        "- [Home+ Air & Heat](https://hometsair.com/): heating and cooling on Long Island and in New York City",
        "- [Techeo](https://www.techeo.com/): AI and marketing for HVAC and plumbing companies",
        "",
        "## Profiles",
        "",
        "- [LinkedIn](https://www.linkedin.com/in/blakeruwali)",
        "- [YouTube](https://www.youtube.com/@blakeruwali)",
        "- [Instagram](https://www.instagram.com/blakeruwali/)",
        "- [Facebook](https://www.facebook.com/bikigram)",
        "- [TikTok](https://www.tiktok.com/@blakeruwali)",
        "",
    ]
    return "\n".join(lines)


def main():
    style = (ROOT / "content" / "article-style.html").read_text(encoding="utf-8")
    articles = [parse(p) for p in sorted(SRC.glob("*.md"))]
    if not any(a["slug"] == PILLAR for a in articles):
        raise SystemExit(f"no article uses the pillar URL {PILLAR}")
    articles.sort(key=lambda a: (a["slug"] != PILLAR, a["file"]))
    for a in articles:
        out = ROOT / a["slug"].strip("/") / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page(a, articles, style), encoding="utf-8")
    (ROOT / "llms.txt").write_text(llms_txt(articles), encoding="utf-8")
    print(f"built {len(articles)} guides")
    return [SITE + a["slug"] for a in articles]


if __name__ == "__main__":
    main()
