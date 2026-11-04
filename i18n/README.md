# Translations

The site is generated from `template.html` plus one JSON file per language.

1. Edit `en.json` (or any `<code>.json`), never the generated `index.html` files.
2. Run `python3 scripts/build_i18n.py`. It rewrites `index.html`, every
   `<code>/index.html` and `sitemap.xml`, and fails if a language is missing a key.
3. Commit the JSON and the generated pages together.

Keys ending in `_html` hold links and are inserted as-is, so write `&amp;` there.
Every other key is plain text and is escaped by the script.

To add a language: copy `en.json` to `<code>.json`, translate it, and add one line
to `LANGS` in `scripts/build_i18n.py`. Arabic and Urdu set `"dir": "rtl"`.

`graph.json` is the schema.org data. Each page reuses it with its own ProfilePage URL.
