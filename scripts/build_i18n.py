#!/usr/bin/env python3
"""Build every language version of the site from one template.

    python3 scripts/build_i18n.py

Reads i18n/template.html, i18n/style.html, i18n/graph.json and i18n/<code>.json, then writes
index.html (English) and <path>/index.html for every other language, plus
sitemap.xml. Edit the JSON files, never the generated HTML.

Keys ending in _html are inserted as-is (they carry links, so write &amp;
yourself). Every other key is plain text and is escaped here.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
I18N = ROOT / "i18n"
SITE = "https://www.blakeruwali.com"

# (file code, URL path, hreflang/lang attribute, uses a non-Latin script)
LANGS = [
    ("en", "", "en", False),
    ("zh", "zh", "zh-Hans", True),
    ("hi", "hi", "hi", True),
    ("es", "es", "es", False),
    ("ar", "ar", "ar", True),
    ("fr", "fr", "fr", False),
    ("bn", "bn", "bn", True),
    ("pt", "pt", "pt", False),
    ("ru", "ru", "ru", True),
    ("id", "id", "id", False),
    ("ur", "ur", "ur", True),
    ("de", "de", "de", False),
    ("ja", "ja", "ja", True),
    ("mr", "mr", "mr", True),
    ("vi", "vi", "vi", False),
    ("te", "te", "te", True),
    ("tr", "tr", "tr", False),
    ("ta", "ta", "ta", True),
    ("ko", "ko", "ko", True),
    ("it", "it", "it", False),
    ("ne", "ne", "ne", True),
]


def url_for(path):
    return f"{SITE}/{path}/" if path else f"{SITE}/"


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def main():
    template = (I18N / "template.html").read_text(encoding="utf-8")
    style = (I18N / "style.html").read_text(encoding="utf-8")
    graph = json.loads((I18N / "graph.json").read_text(encoding="utf-8"))
    en = json.loads((I18N / "en.json").read_text(encoding="utf-8"))
    data = {code: json.loads((I18N / f"{code}.json").read_text(encoding="utf-8")) for code, *_ in LANGS}

    hreflang = "\n".join(
        f'<link rel="alternate" hreflang="{tag}" href="{url_for(path)}">' for _, path, tag, _ in LANGS
    ) + f'\n<link rel="alternate" hreflang="x-default" href="{url_for("")}">'

    for code, path, tag, nolatin in LANGS:
        t = data[code]
        missing = sorted(set(en) - set(t))
        if missing:
            raise SystemExit(f"{code}.json is missing keys: {', '.join(missing)}")
        url = url_for(path)
        rtl = t["dir"] == "rtl"

        g = json.loads(json.dumps(graph))
        page = g["@graph"][0]
        assert page["@type"] == "ProfilePage"
        page["@id"] = url + "#webpage"
        page["url"] = url
        if code != "en":
            page["inLanguage"] = tag
            page["isPartOf"] = {"@type": "WebSite", "url": url_for("")}

        switcher = "\n".join(
            f'        <li><a href="{"/" + p + "/" if p else "/"}" hreflang="{tg}" lang="{tg}"'
            + (' aria-current="page"' if c == code else "")
            + f'>{esc(data[c]["native"])}</a></li>'
            for c, p, tg, _ in LANGS
        )

        values = {
            "lang": tag,
            "dir": t["dir"],
            "html_class": ' class="nolatin"' if nolatin else "",
            "url": url,
            "hreflang": hreflang,
            "jsonld": json.dumps(g, indent=2, ensure_ascii=False),
            "style": style,
            "switcher": switcher,
            "arrow": "←" if rtl else "→",
            "code_upper": code.upper(),
        }
        for k, v in t.items():
            values.setdefault(k, v if k.endswith("_html") else esc(v))

        def sub(m):
            key = m.group(1)
            if key not in values:
                raise SystemExit(f"template key {key!r} has no value for {code}")
            return values[key]

        html = re.sub(r"\{\{(\w+)\}\}", sub, template)
        out = ROOT / path / "index.html" if path else ROOT / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(html, encoding="utf-8")

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ]
    for _, path, _, _ in LANGS:
        lines.append(f"  <url><loc>{url_for(path)}</loc>")
        for _, p2, tag2, _ in LANGS:
            lines.append(f'    <xhtml:link rel="alternate" hreflang="{tag2}" href="{url_for(p2)}"/>')
        lines.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{url_for("")}"/>')
        lines.append("  </url>")
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"built {len(LANGS)} pages")


if __name__ == "__main__":
    main()
