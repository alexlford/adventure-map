"""Rebuild the official-course overview and checkpoint-anchored elapsed time model.

No personal GPS or exact wall-clock timestamps are synthesized. Original NYRR
vertices are preserved between the official start/finish projections; intermediate
elapsed times interpolate between screenshot checkpoints along the course line.
"""
import bisect
import hashlib
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/sources/new-york-city-marathon-2026-official.kml'
SPLITS = ROOT / 'data/new-york-city-marathon-2026-official.json'
OUTPUT = ROOT / 'data/new-york-city-marathon-2026-course.geojson'
NS = {'k': 'http://www.opengis.net/kml/2.2'}
MAP = 'https://www.google.com/maps/d/embed?mid=1pHIR8TGIl2liF3A2oR52Z1RPPi_una0'
PDF = 'https://cms.prod.nyrr.org/api/document-files/file/TCSNYCM26_Map_Course_090226_RD3.pdf'

def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a, *b])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371000 * 2 * math.asin(math.sqrt(h))

def project(point, line, cumulative):
    scale = math.cos(math.radians(point[1]))
    candidates = []
    for i, (a, b) in enumerate(zip(line, line[1:])):
        dx, dy = (b[0]-a[0])*scale, b[1]-a[1]
        px, py = (point[0]-a[0])*scale, point[1]-a[1]
        t = max(0, min(1, (px*dx+py*dy)/(dx*dx+dy*dy))) if dx or dy else 0
        q = [a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1])]
        candidates.append((distance(point, q), cumulative[i]+t*(cumulative[i+1]-cumulative[i]), q))
    return min(candidates)

def main():
    tree = ET.parse(SOURCE)
    placemarks = tree.findall('.//k:Placemark', NS)
    course = next(p for p in placemarks if p.findtext('k:name', namespaces=NS) == 'Course (BLUE)')
    line = [[float(v) for v in pair.split(',')[:2]] for pair in course.findtext('.//k:coordinates', namespaces=NS).split()]
    cumulative = [0]
    for a, b in zip(line, line[1:]): cumulative.append(cumulative[-1]+distance(a,b))
    pink = next(p for p in placemarks if p.findtext('k:name', namespaces=NS) == 'Course (PINK)')
    pink_line = [[float(v) for v in pair.split(',')[:2]] for pair in pink.findtext('.//k:coordinates', namespaces=NS).split()]
    merge = project(pink_line[-1], line, cumulative)
    assert merge[0] < 20, 'Pink branch must join the shared course'
    line = pink_line + [merge[2]] + [p for d,p in zip(cumulative,line) if d > merge[1]]
    cumulative = [0]
    for a,b in zip(line,line[1:]): cumulative.append(cumulative[-1]+distance(a,b))
    splits = json.loads(SPLITS.read_text())['adventures'][0]['officialSplits']
    anchors = [project([s['lon'], s['lat']], line, cumulative) for s in splits]
    assert len(splits) == 34 and splits[-1]['elapsedSeconds'] == 15513
    assert all(a['elapsedSeconds'] < b['elapsedSeconds'] and a['distanceKm'] < b['distanceKm'] for a,b in zip(splits,splits[1:]))
    assert all(a[1] < b[1] for a,b in zip(anchors,anchors[1:])), 'Course checkpoints must progress monotonically'
    assert max(a[0] for a in anchors) < 100, 'Official markers must remain close to the official route'
    assert any(-73.924 < lon < -73.923 and 40.8118 < lat < 40.8122 for lon,lat in line), '2026 East 141st Street turn missing'
    start, finish = anchors[0][1], anchors[-1][1]
    positioned = [(d,p) for d,p in zip(cumulative,line) if start < d < finish]
    positioned.extend((a[1], a[2]) for a in anchors)
    positioned.sort()
    distances, coordinates = zip(*positioned)
    anchor_distances = [a[1] for a in anchors]
    times = []
    for d in distances:
        i = max(0, min(len(anchors)-2, bisect.bisect_right(anchor_distances,d)-1))
        f = (d-anchors[i][1])/(anchors[i+1][1]-anchors[i][1])
        times.append(round(splits[i]['elapsedSeconds']+f*(splits[i+1]['elapsedSeconds']-splits[i]['elapsedSeconds']),3))
    checkpoints = [{**s, 'projectedCoordinates': [round(v,7) for v in a[2]], 'markerOffsetMeters': round(a[0],1), 'courseDistanceMeters': round(a[1]-start,1)} for s,a in zip(splits,anchors)]
    feature = {'type':'Feature','properties':{
        'id':'new-york-city-marathon-2026-official-course', 'adventureIds':['new-york-city-marathon-2026'],
        'category':'marathon','source':'NYRR official 2026 interactive Google My Maps course and mile/kilometer markers + Alex’s NYRR tracking screenshots',
        'sourceUrl':MAP,'courseMapUrl':PDF,'sourceFile':'data/sources/new-york-city-marathon-2026-official.kml',
        'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'distanceMi':26.2,'officialDistanceKm':42.195,'geometryDistanceKm':round((finish-start)/1000,3),
        'routeType':'official-course-map-reconstruction','provenance':'historical-course',
        'startAlignment':'Pink start confirmed by Alex; official pink branch joins the shared blue/pink course in Brooklyn.',
        'note':'Official 2026 course including the East 141st Street Bronx adjustment. Not personal GPS. Pink start confirmed by Alex; official pink branch used through the Brooklyn merge. Official distance remains 42.195 km regardless of generalized map length. Checkpoint cumulative times and paces are transcribed exactly; elapsed times between checkpoints are interpolated along organizer geometry. No exact wall-clock seconds are inferred.',
        'checkpointTimingSource':'data/new-york-city-marathon-2026-official.json',
        'checkpointCount':len(checkpoints),'timingModel':'Piecewise linear elapsed time along official course, anchored at projected NYRR checkpoint markers.',
        'elapsedSeconds':times,'checkpoints':checkpoints},
        'geometry':{'type':'LineString','coordinates':[[round(v,7) for v in p] for p in coordinates]}}
    OUTPUT.write_text(json.dumps({'type':'FeatureCollection','features':[feature]},indent=2,ensure_ascii=False)+'\n')
    print(f'NYC 2026: {len(coordinates)} course vertices, {len(checkpoints)} timed checkpoints, {(finish-start)/1000:.3f} km map geometry, max marker offset {max(a[0] for a in anchors):.1f} m')

if __name__ == '__main__': main()
