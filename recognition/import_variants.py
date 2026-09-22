"""Fetch alternate-art references via Scryfall; never upload gameplay images."""
import argparse,json,pathlib,time,urllib.request,urllib.parse
import cv2,numpy as np

parser=argparse.ArgumentParser();parser.add_argument('--videos',default=str(pathlib.Path.home()/'Videos'));parser.add_argument('--output',default='.recognition/catalog/cards');args=parser.parse_args()
out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
metadata_path=out/'metadata.json';metadata=json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
done_path=out/'completed.json';done=set(json.loads(done_path.read_text())) if done_path.exists() else set()
names=set()
for source in pathlib.Path(args.videos).glob('*/cards/metadata.json'):
    names.update(c['name'] for c in json.loads(source.read_text(encoding='utf-8')).values())
def fetch(url):
    request=urllib.request.Request(url,headers={'User-Agent':'SpellTablePlus/0.2 (local card reference library)','Accept':'application/json'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request,timeout=30) as response:return response.read()
        except Exception:
            if attempt==3:raise
            time.sleep(2**attempt)
    return None
for name in sorted(names-done):
    try:
        query='!"'+name.replace('"','')+'"'
        url='https://api.scryfall.com/cards/search?unique=art&q='+urllib.parse.quote(query)
        while url:
            data=json.loads(fetch(url));time.sleep(.15)
            for card in data.get('data',[]):
                faces=card.get('card_faces',[card])
                if card.get('image_uris'):faces=[card]
                for face_index,face in enumerate(faces):
                    key=card['id']+f'-{face_index}';image_url=face.get('image_uris',{}).get('normal')
                    if key in metadata or not image_url:continue
                    image=cv2.imdecode(np.frombuffer(fetch(image_url),np.uint8),cv2.IMREAD_COLOR)
                    if image is None:continue
                    cv2.imwrite(str(out/(key+'.png')),cv2.resize(image,(244,340),interpolation=cv2.INTER_AREA))
                    metadata[key]={**card,'id':key,'name':face.get('name',card['name'])};time.sleep(.1)
            url=data.get('next_page') if data.get('has_more') else None
        done.add(name);metadata_path.write_text(json.dumps(metadata));done_path.write_text(json.dumps(sorted(done)))
        print(json.dumps({'name':name,'referenceImages':len(metadata),'completedNames':len(done)}),flush=True)
    except Exception as error:print(json.dumps({'name':name,'error':str(error)}),flush=True)
