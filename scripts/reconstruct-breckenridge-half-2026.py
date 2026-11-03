"""Publish the organizer-linked half-marathon course without inventing personal GPS."""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/sources/breckenridge-half-2026-organizer-route.json'
OUTPUT = ROOT / 'data/breckenridge-half-2026-course.geojson'

def meters(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [*a[:2], *b[:2]])
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 12742000 * math.asin(math.sqrt(h))

def main():
    source = json.loads(SOURCE.read_text())
    coordinates = source['coordinates']
    length = sum(meters(a,b) for a,b in zip(coordinates,coordinates[1:]))
    assert len(coordinates) == 1676
    assert 20_500 < length < 22_000
    assert meters(coordinates[0], [-106.0207,39.46273]) < 2
    assert meters(coordinates[-1], [-106.04747,39.49346]) < 2
    assert max(point[1] for point in coordinates) > 39.547, 'Gold Hill turnaround missing'
    assert max(meters(a,b) for a,b in zip(coordinates,coordinates[1:])) < 180
    feature = {'type':'Feature','properties':{
        'id':'breckenridge-half-2026-organizer-course',
        'adventureIds':['breckenridge-half-marathon-2026'],
        'category':'road','provenance':'historical-course',
        'routeType':'official-course-map-reconstruction',
        'source':'RunBreck organizer course-map page links to Strava route 3479586316635225542; all public embedded coordinates retained.',
        'sourceUrl':source['linkedBy'],
        'organizerRouteUrl':'https://www.strava.com/routes/3479586316635225542',
        'sourceFile':'data/sources/breckenridge-half-2026-organizer-route.json',
        'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'distanceMi':13.1,'officialDistanceKm':21.0975,
        'geometryDistanceKm':round(length/1000,4),
        'sourcePointCount':len(coordinates),
        'note':'Organizer-course reconstruction, not Alex’s personal GPS. Route shape and high-start/descent/return profile agree with supplied activity screenshots. All organizer vertices and elevations are retained. Watch splits and 13.50-mile watch distance remain separate from the official 13.1-mile chip result. Inconsistent intermediate timing-provider labels are preserved in the evidence audit and are not used to synthesize elapsed-time geometry.'
    },'geometry':{'type':'LineString','coordinates':coordinates}}
    OUTPUT.write_text(json.dumps({'type':'FeatureCollection','features':[feature]},indent=2,ensure_ascii=False)+'\n')
    print(f'Breckenridge: {len(coordinates)} organizer coordinates; {length/1000:.4f} km; start/finish and Gold Hill turnaround verified.')

if __name__ == '__main__': main()
