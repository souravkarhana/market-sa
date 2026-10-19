"""
daily_update.py - downloads missing NSE bhavcopy days (and any CSV placed in incoming/), updates history.json, rebuilds index.html
Run daily after ~7 PM IST:   python daily_update.py
Test with a local file:      python daily_update.py --local bhavcopy.csv --date 2026-10-12
Needs:  pip install requests
"""
import argparse, csv, io, json, os, sys, zipfile, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda f: os.path.join(HERE, f)
KEEP_DAYS = 220
URL = "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{d}_F_0000.csv.zip"
HEAD = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9", "Referer": "https://www.nseindia.com/"}

def log(msg):
    line = f"{dt.datetime.now():%Y-%m-%d %H:%M} {msg}"; print(line)
    open(P("update_log.txt"), "a", encoding="utf-8").write(line + "\n")

def parse(text):
    rd = csv.reader(io.StringIO(text)); head = [h.strip().lower() for h in next(rd)]
    def f(*names):
        for n in names:
            if n in head: return head.index(n)
        return -1
    iS, iSer, iC, iP, iV = f("tckrsymb", "symbol"), f("sctysrs", "series"), f("clspric", "close"), f("prvsclsgpric", "prevclose"), f("ttltradgvol", "tottrdqty", "volume")
    if min(iS, iC, iP, iV) < 0: raise ValueError("bhavcopy columns not found: " + ", ".join(head))
    out = {}
    for r in rd:
        if iSer >= 0 and r[iSer].strip() != "EQ": continue
        try: c, p, v = float(r[iC]), float(r[iP]), float(r[iV])
        except ValueError: continue
        if c > 0: out[r[iS].strip()] = (c, p if p > 0 else None, v)
    return out

def parse_date(text):
    rd = csv.reader(io.StringIO(text)); head = [h.strip().lower() for h in next(rd)]
    for n in ("traddt", "bizdt", "timestamp", "date1"):
        if n in head:
            v = next(rd)[head.index(n)].strip()
            try:
                return dt.date.fromisoformat(v[:10]).isoformat()
            except ValueError:
                return dt.datetime.strptime(v, "%d-%b-%Y").date().isoformat()
    return None

def load_hist():
    h = json.load(open(P("history.json"), encoding="utf-8"))
    for s in h["stocks"].values():
        if "p" not in s: s["p"] = [None] + s["c"][:-1]
    return h

def add_day(h, date, rows):
    if date in h["dates"]: return False
    if len(rows) < 500: raise ValueError(f"only {len(rows)} EQ stocks for {date}, file looks wrong")
    n = len(h["dates"]); h["dates"].append(date)
    for s in h["stocks"].values():
        s["c"].append(None); s["v"].append(None); s["p"].append(None)
    for sym, (c, p, v) in rows.items():
        st = h["stocks"].get(sym)
        if st is None: st = h["stocks"][sym] = {"c": [None]*n + [None], "v": [None]*n + [None], "p": [None]*n + [None]}
        st["c"][-1], st["v"][-1], st["p"][-1] = round(c, 2), int(v), p
    if len(h["dates"]) > KEEP_DAYS:
        k = len(h["dates"]) - KEEP_DAYS; h["dates"] = h["dates"][k:]
        for s in h["stocks"].values():
            for key in ("c", "v", "p"): s[key] = s[key][k:]
    return True

def rebuild(h):
    html = open(P("template.html"), encoding="utf-8").read()
    html = html.replace("/*__CORE__*/", open(P("core.js"), encoding="utf-8").read()).replace("/*__DATA__*/", json.dumps(h, separators=(",", ":")))
    open(P("index.html"), "w", encoding="utf-8").write(html)
    json.dump(h, open(P("history.json"), "w", encoding="utf-8"), separators=(",", ":"))

def download(day):
    import requests
    s = requests.Session(); s.headers.update(HEAD); s.get("https://www.nseindia.com", timeout=20)
    r = s.get(URL.format(d=day.strftime("%Y%m%d")), timeout=40)
    if r.ok and r.content[:2] == b"PK":
        z = zipfile.ZipFile(io.BytesIO(r.content)); return z.read(z.namelist()[0]).decode("utf-8", "ignore")
    return None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--local"); ap.add_argument("--date"); a = ap.parse_args()
    h = load_hist(); added = []
    if a.local:
        if add_day(h, a.date, parse(open(a.local, encoding="utf-8").read())): added.append(a.date)
    else:
        inc = P("incoming")
        if os.path.isdir(inc):
            for fn in sorted(os.listdir(inc)):
                if fn.lower().endswith(".csv"):
                    try:
                        text = open(os.path.join(inc, fn), encoding="utf-8", errors="ignore").read(); day = parse_date(text)
                        if day and add_day(h, day, parse(text)): added.append(day)
                        os.remove(os.path.join(inc, fn))
                    except Exception as e: log(f"incoming/{fn}: {e}")
        d = dt.date.fromisoformat(h["dates"][-1]) + dt.timedelta(days=1)
        while d <= dt.date.today():
            if d.weekday() < 5:
                try: text = download(d)
                except Exception as e: log(f"{d}: download error {e}"); break
                if text is None: log(f"{d}: no file (holiday, not published yet, or blocked)")
                else:
                    if add_day(h, d.isoformat(), parse(text)): added.append(d.isoformat())
            d += dt.timedelta(days=1)
    rebuild(h); log(f"done. added: {added or 'nothing'}; last date in data: {h['dates'][-1]}")

if __name__ == "__main__": main()
