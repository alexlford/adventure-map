"""Reproduce the approximate organizer course from the reviewed map-matching trace."""
import hashlib
import json
import math
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/sources/air-force-5k-2026-reconstruction.json'
def meters(a,b):
    x1,y1,x2,y2=map(math.radians,[*a[:2],*b[:2]])
    return 12742000*math.asin(math.sqrt(math.sin((y2-y1)/2)**2+math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2))
def main():
    s=json.loads(SOURCE.read_text()); points=[s['nodes'][n] for n in s['routeNodeIds']]
    length=sum(meters(a,b) for a,b in zip(points,points[1:]))
    assert 4900 < length < 5250, length
    assert len(points)>150
    assert max(meters(a,b) for a,b in zip(points,points[1:]))<180
    assert min(p[0] for p in points)<-84.066 and max(p[1] for p in points)>39.788
    assert meters(points[0],[-84.0538,39.78235])<80
    assert meters(points[-1],[-84.05365,39.78165])<80
    assert len(set(s['routeNodeIds']))<len(points), 'Campus out-and-back spur must be retained'
    note='Approximate course reconstructed from the organizer’s map for the 2026 event and mapped campus roads and paths. Campus turns and start/finish placement are inferred from the schematic. Not personal GPS or a certified measurement; mapped length is shown separately from the official 5K distance. Reconcile with the next annual Strava export.'
    f={'type':'Feature','properties':{'id':'air-force-5k-2026-organizer-course','adventureIds':['air-force-5k-2026'],'category':'road','provenance':'historical-course','routeType':'official-course-map-reconstruction','source':'Air Force Marathon official 2026 course-map page; OpenStreetMap road/path alignment','sourceUrl':s['officialCoursePage'],'officialMapUrl':s['officialMapUrl'],'sourceFile':str(SOURCE.relative_to(ROOT)),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'officialDistanceKm':5,'distanceMi':3.10686,'geometryDistanceKm':round(length/1000,4),'sourcePointCount':len(points),'routeFeatureId':'air-force-5k-2026-organizer-course','reconstructionConfidence':'approximate','geometryConfidence':'approximate','geometryEvidence':'inferred','note':note},'geometry':{'type':'LineString','coordinates':points}}
    (ROOT/'data/air-force-5k-2026-course.geojson').write_text(json.dumps({'type':'FeatureCollection','features':[f]},indent=2,ensure_ascii=False)+'\n')
    print(f'{len(points)} vertices; {length/1000:.4f} km; reconstructed campus spur and Nutter start/finish verified')
if __name__=='__main__':main()
