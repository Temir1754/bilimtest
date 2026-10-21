"""Білімтест build: validates data/*.json and inlines it into one HTML page.

Data format (one file per subject):
{
  "id": "math", "icon": "π", "name": ["Математика", "Математика", "Mathematics"],
  "lang": "kk",            # optional: content exists only in this language
  "grades": { "4": [ [topicTitle, [question, ...]], ... ] }
}
A text is either a string (same in every language) or [kk, ru, en].
A question is [questionText, correctOption, wrong1, wrong2, wrong3];
options are shuffled at runtime, so the correct one is always written first.
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).parent
ORDER = ["math", "algebra", "geometry", "worldknow", "science", "physics", "chemistry",
         "biology", "geography", "histkz", "worldhist", "informatics",
         "kazakh", "kazlit", "russian", "english"]

def is_text(v):
    return isinstance(v, str) and v.strip() or (
        isinstance(v, list) and len(v) == 3 and all(isinstance(x, str) and x.strip() for x in v))

def variants(v):
    return [v] * 3 if isinstance(v, str) else v

def main():
    errors, subjects = [], []
    files = {p.stem: p for p in (ROOT / "data").glob("*.json")}
    for sid in ORDER + sorted(set(files) - set(ORDER)):
        if sid not in files:
            continue
        try:
            s = json.loads(files[sid].read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{sid}: bad JSON: {e}"); continue
        if s.get("id") != sid: errors.append(f"{sid}: id mismatch")
        if not is_text(s.get("name")): errors.append(f"{sid}: bad name")
        for g, topics in s["grades"].items():
            if int(g) not in range(4, 12): errors.append(f"{sid}: grade {g}")
            for ti, (title, qs) in enumerate(topics):
                where = f"{sid} {g} #{ti+1}"
                if not is_text(title): errors.append(f"{where}: bad title")
                if len(qs) < 5: errors.append(f"{where}: only {len(qs)} questions")
                for qi, q in enumerate(qs):
                    w = f"{where} q{qi+1}"
                    if not (4 <= len(q) <= 5): errors.append(f"{w}: needs 3-4 options"); continue
                    if not all(is_text(x) for x in q): errors.append(f"{w}: bad text {q}"); continue
                    for li in range(3):
                        opts = [variants(o)[li] for o in q[1:]]
                        if len(set(opts)) != len(opts): errors.append(f"{w}: duplicate options {opts}")
        subjects.append(s)
    if errors:
        print("\n".join(errors)); sys.exit(1)

    data = json.dumps(subjects, ensure_ascii=False, separators=(",", ":"))
    page = (ROOT / "template.html").read_text(encoding="utf-8").replace("/*DATA*/[]", data)
    (ROOT / "dist").mkdir(exist_ok=True)
    (ROOT / "dist" / "artifact.html").write_text(page, encoding="utf-8")
    site = ('<!doctype html>\n<html lang="kk">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<style>html{color-scheme:light dark}:root{padding-top:env(safe-area-inset-top,0px);'
            'padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}[hidden]{display:none!important}</style>\n')
    head, _, rest = page.partition("<header")
    site += head + "</head>\n<body>\n<header" + rest + "\n</body>\n</html>\n"
    (ROOT / "dist" / "index.html").write_text(site, encoding="utf-8")

    nq = sum(len(t[1]) for s in subjects for ts in s["grades"].values() for t in ts)
    nt = sum(len(ts) for s in subjects for ts in s["grades"].values())
    print(f"OK: {len(subjects)} subjects, {nt} topics, {nq} questions, {len(page)//1024} KB")

if __name__ == "__main__":
    main()
