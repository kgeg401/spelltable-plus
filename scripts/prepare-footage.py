"""Read-only inventory and small review samples. Originals are never modified."""
import pathlib, json, subprocess, sys
root = pathlib.Path.home() / 'Videos'
out = pathlib.Path(__file__).resolve().parents[1] / '.local-media'
out.mkdir(exist_ok=True)
records=[]
(out/'file-catalog.json').write_text(json.dumps([{'file':str(p),'bytes':p.stat().st_size} for p in root.rglob('*') if p.is_file() and p.suffix.lower() in ['.mp4','.mkv','.mov']],indent=2))
for source in sorted(root.glob('2026-09-*.mp4')):
    try:
        info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(source)],stderr=subprocess.PIPE))
    except subprocess.CalledProcessError as error:
        records.append({'file':str(source),'error':error.stderr.decode(errors='replace'),'classification':'unreadable'})
        continue
    duration=float(info['format']['duration'])
    record={'file':str(source),'duration':duration,'bytes':source.stat().st_size,'classification':'unreviewed','samples':[]}
    for index,fraction in enumerate([.2,.5,.8]):
        dest=out / f'{source.stem}-{index}.jpg'
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(duration*fraction),'-i',str(source),'-frames:v','1','-vf','scale=640:-1',str(dest)],check=True)
        record['samples'].append({'seconds':round(duration*fraction,2),'image':dest.name})
    records.append(record)
    print(source.name,round(duration),flush=True)
(out/'inventory.json').write_text(json.dumps(records,indent=2))
cards={}
for metadata in root.glob('*/cards/metadata.json'):
    for value in json.loads(metadata.read_text(encoding='utf-8')).values():
        cards[value['name']]={'name':value['name'],'text':value.get('oracle_text',''),'type':value.get('type_line',''),'source':str(metadata),'url':value.get('scryfall_uri','')}
(out/'cards.json').write_text(json.dumps(list(cards.values()),indent=2))
source=root/'2026-09-13 16-23-06.mp4'
for i,timestamp in enumerate([300,1020,1800,2600]):
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(timestamp),'-i',str(source),'-t','15','-an','-vf','crop=817:460:0:80,scale=640:360','-r','15','-c:v','libx264','-preset','veryfast','-crf','25','-movflags','+faststart',str(out/f'player-{i+1}.mp4')],check=True)
print(f'{len(records)} videos sampled; {len(cards)} reference cards; four private playmat loops',flush=True)
