#!/usr/bin/env python3
"""Doc-coverage x code-reachability audit for the Denowatts monorepo.

Two independent signals per source file:
  LIVE   - reachable via the import graph from a real runtime entry point
  CITED  - path appears in at least one flows/*.md doc

Cross them to get four buckets. The interesting ones are
LIVE+UNCITED (documentation gap) and DEAD+CITED (docs describing dead code).
"""
import os, re, json, sys
from collections import defaultdict, deque

ROOT = "/Users/macmini-m1-02/Documents/Projects/Denowatts-dev-docs"
BE   = os.path.join(ROOT, "denowatts-backend")
FE   = os.path.join(ROOT, "denowatts-portal")
DOCS = os.path.join(ROOT, "denowatts-dev-docs", "flows")

SKIP_DIRS = {"node_modules", "dist", "build", ".git", "coverage", ".turbo", "test-results"}
EXTS = (".ts", ".tsx", ".js", ".jsx")

FE_ALIASES = {
    "@features": "src/features", "@components": "src/components", "@common": "src/common",
    "@utils": "src/utils", "@store": "src/store", "@graphql": "src/graphql",
    "@assets": "src/assets", "@types": "src/types", "@": "src",
}

IMPORT_RE = re.compile(
    r"""(?:from\s+['"]([^'"]+)['"])"""      # from '...'
    r"""|(?:import\s*\(\s*['"]([^'"]+)['"])"""  # dynamic import('...')
    r"""|(?:require\s*\(\s*['"]([^'"]+)['"])"""  # require('...')
    r"""|(?:^\s*import\s+['"]([^'"]+)['"])""",   # bare side-effect import
    re.M,
)

def walk(base):
    out = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if fn.endswith(EXTS):
                out.append(os.path.join(dirpath, fn))
    return out

def resolve(spec, importer, repo_root):
    """Resolve an import specifier to an absolute file path, or None if external."""
    if spec.startswith("."):
        cand = os.path.normpath(os.path.join(os.path.dirname(importer), spec))
    else:
        matched = None
        for alias in sorted(FE_ALIASES, key=len, reverse=True):
            if spec == alias or spec.startswith(alias + "/"):
                matched = alias
                break
        if not matched:
            return None  # npm package
        rest = spec[len(matched):].lstrip("/")
        cand = os.path.normpath(os.path.join(repo_root, FE_ALIASES[matched], rest))
    for suffix in ("", ".ts", ".tsx", ".js", ".jsx",
                   "/index.ts", "/index.tsx", "/index.js", "/index.jsx"):
        p = cand + suffix
        if os.path.isfile(p):
            return p
    return None

def build_graph(files, repo_root):
    graph = defaultdict(set)
    for f in files:
        try:
            src = open(f, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        for m in IMPORT_RE.finditer(src):
            spec = next((g for g in m.groups() if g), None)
            if not spec:
                continue
            tgt = resolve(spec, f, repo_root)
            if tgt:
                graph[f].add(tgt)
    return graph

def reachable(graph, entries):
    seen, q = set(), deque()
    for e in entries:
        if os.path.isfile(e):
            seen.add(e); q.append(e)
    while q:
        cur = q.popleft()
        for nxt in graph.get(cur, ()):
            if nxt not in seen:
                seen.add(nxt); q.append(nxt)
    return seen

# ---- citations ----------------------------------------------------------
CITE_RE = re.compile(r"denowatts-(?:backend|portal)/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx)")
def collect_citations():
    cited = set()
    per_doc = defaultdict(set)
    for fn in sorted(os.listdir(DOCS)):
        if not fn.endswith(".md"):
            continue
        if fn.startswith(("DRIFT", "COVERAGE", "REVIEW")) or ".coverage." in fn:
            continue
        txt = open(os.path.join(DOCS, fn), encoding="utf-8", errors="ignore").read()
        for m in CITE_RE.finditer(txt):
            p = os.path.join(ROOT, m.group(0))
            cited.add(os.path.normpath(p))
            per_doc[fn].add(os.path.normpath(p))
    return cited, per_doc

# ---- run ----------------------------------------------------------------
be_files = walk(os.path.join(BE, "src"))
fe_files = walk(os.path.join(FE, "src"))
be_graph = build_graph(be_files, BE)
fe_graph = build_graph(fe_files, FE)

be_live = reachable(be_graph, [os.path.join(BE, "src", "main.ts")])
fe_entries = [os.path.join(FE, "src", "main.tsx"), os.path.join(FE, "src", "App.tsx"),
              os.path.join(FE, "src", "router.tsx"), os.path.join(FE, "src", "routeTree.gen.ts")]
fe_live = reachable(fe_graph, fe_entries)

cited, per_doc = collect_citations()

def loc(p):
    try:
        return sum(1 for _ in open(p, encoding="utf-8", errors="ignore"))
    except OSError:
        return 0

def is_noise(p):
    b = os.path.basename(p)
    return (b.endswith((".spec.ts", ".spec.tsx", ".test.ts", ".test.tsx", ".d.ts"))
            or "__generated__" in p or b == "routeTree.gen.ts")

rows = []
for files, live, repo in ((be_files, be_live, "backend"), (fe_files, fe_live, "portal")):
    for f in files:
        if is_noise(f):
            continue
        rel = os.path.relpath(f, ROOT)
        rows.append({
            "path": rel, "repo": repo, "loc": loc(f),
            "live": f in live, "cited": f in cited,
            "area": rel.split("/")[2] if len(rel.split("/")) > 2 else "?",
            "sub": "/".join(rel.split("/")[2:4]) if len(rel.split("/")) > 4 else
                   "/".join(rel.split("/")[2:3]),
        })

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit.json")
json.dump({"rows": rows,
           "per_doc": {k: sorted(os.path.relpath(p, ROOT) for p in v) for k, v in per_doc.items()}},
          open(out, "w"), indent=1)

def tot(pred):
    sel = [r for r in rows if pred(r)]
    return len(sel), sum(r["loc"] for r in sel)

print("=" * 68)
print("BUCKETS  (excludes specs, .d.ts, generated)")
print("=" * 68)
for label, pred in (
    ("LIVE + CITED      (documented, real)", lambda r: r["live"] and r["cited"]),
    ("LIVE + UNCITED    >>> DOC GAP <<<   ", lambda r: r["live"] and not r["cited"]),
    ("DEAD + CITED      >>> DOCS DEAD CODE", lambda r: not r["live"] and r["cited"]),
    ("DEAD + UNCITED    (orphan, ignore)  ", lambda r: not r["live"] and not r["cited"]),
):
    n, l = tot(pred)
    print(f"{label}  {n:5d} files  {l:7d} loc")
n, l = tot(lambda r: True)
print(f"{'TOTAL':38s}  {n:5d} files  {l:7d} loc")
