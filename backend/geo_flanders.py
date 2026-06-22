"""Flanders cadastral + orthophoto helper.

Given a Flemish address, fetch the *real* parcel boundary (CadGIS/GRB) and a
*real* orthophoto (aerial) for that parcel, returning an aerial image path plus
the boundary as points in a 0..100 viewBox (what the long-teaser template draws
the red outline from). Pure stdlib + Pillow — no API key required.

All services are the open Flanders "Informatie Vlaanderen" endpoints and only
cover the Flemish Region; for addresses outside Flanders the calls return no
result and the caller should fall back to its previous behaviour.
"""
from __future__ import annotations
import io
import json
import urllib.parse
import urllib.request

_GEOCODE = "https://geo.api.vlaanderen.be/geolocation/v4/Location"
_PARCEL_WFS = "https://geo.api.vlaanderen.be/Adpf/wfs"
_ORTHO_WMS = "https://geo.api.vlaanderen.be/omwrgbmrvl/wms"
_UA = {"User-Agent": "rodschinson-teaser/1.0"}


def _get(url: str, timeout: int = 25) -> bytes:
    req = urllib.request.Request(url, headers=_UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def geocode(address: str):
    """Address -> (x, y) in Lambert72 (EPSG:31370), or None."""
    try:
        url = f"{_GEOCODE}?c=1&q=" + urllib.parse.quote(address)
        data = json.loads(_get(url))
        res = data.get("LocationResult") or []
        if not res:
            return None
        loc = res[0]["Location"]
        return float(loc["X_Lambert72"]), float(loc["Y_Lambert72"])
    except Exception:
        return None


def _rings(geom):
    if geom["type"] == "MultiPolygon":
        return [poly[0] for poly in geom["coordinates"]]
    if geom["type"] == "Polygon":
        return [geom["coordinates"][0]]
    return []


def _contains(ring, x, y) -> bool:
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def parcel_at(x: float, y: float):
    """Return (ring, capakey) for the cadastral parcel containing (x, y)."""
    try:
        b = 14
        url = (f"{_PARCEL_WFS}?service=WFS&version=2.0.0&request=GetFeature"
               "&typeNames=Adpf:Adpf&srsName=EPSG:31370&outputFormat=application/json&count=25"
               f"&bbox={x-b},{y-b},{x+b},{y+b},EPSG:31370")
        fc = json.loads(_get(url))
        feats = fc.get("features") or []
        # parcel that actually contains the point wins; else the nearest centroid
        best = None
        best_d = 1e30
        for f in feats:
            for ring in _rings(f["geometry"]):
                if _contains(ring, x, y):
                    return ring, f["properties"].get("CAPAKEY", "")
                cx = sum(p[0] for p in ring) / len(ring)
                cy = sum(p[1] for p in ring) / len(ring)
                d = (cx - x) ** 2 + (cy - y) ** 2
                if d < best_d:
                    best_d = d
                    best = (ring, f["properties"].get("CAPAKEY", ""))
        return best if best else (None, "")
    except Exception:
        return None, ""


def _square_bbox(ring, margin=1.8, min_half=22.0):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    cx = (min(xs) + max(xs)) / 2
    cy = (min(ys) + max(ys)) / 2
    half = max(max(xs) - min(xs), max(ys) - min(ys)) / 2 * margin
    half = max(half, min_half)
    return cx - half, cy - half, cx + half, cy + half


def aerial_for_address(address: str, out_path, size: int = 1000):
    """Fetch a real aerial + parcel outline for a Flemish address.

    `out_path` is where the orthophoto PNG is written (pathlib.Path or str).
    Returns {"aerial_view": "file://...", "boundary": [[x,y],...], "capakey": str}
    with boundary points in a 0..100 viewBox, or None when unavailable.
    """
    pt = geocode(address)
    if not pt:
        return None
    ring, capakey = parcel_at(*pt)
    if not ring or len(ring) < 3:
        return None
    import pathlib
    out_path = pathlib.Path(out_path).resolve()  # Puppeteer needs an absolute file:// URL
    bx0, by0, bx1, by1 = _square_bbox(ring)
    try:
        url = (f"{_ORTHO_WMS}?service=WMS&version=1.3.0&request=GetMap"
               "&layers=Ortho&styles=&crs=EPSG:31370"
               f"&bbox={bx0},{by0},{bx1},{by1}&width={size}&height={size}&format=image/png")
        img_bytes = _get(url)
    except Exception:
        return None
    try:
        from PIL import Image
        Image.open(io.BytesIO(img_bytes)).convert("RGB").save(str(out_path), "PNG")
    except Exception:
        # still usable: write raw bytes
        with open(out_path, "wb") as fh:
            fh.write(img_bytes)
    # parcel ring -> 0..100 viewBox (y flipped: image origin is top-left)
    boundary = [[round((x - bx0) / (bx1 - bx0) * 100, 2),
                 round((by1 - y) / (by1 - by0) * 100, 2)] for x, y in ring]
    return {"aerial_view": f"file://{out_path}", "boundary": boundary, "capakey": capakey}
