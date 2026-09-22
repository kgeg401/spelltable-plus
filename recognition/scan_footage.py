"""Resumable scan across original recordings; candidates are not ground truth."""
import argparse,json,pathlib,subprocess,time
import cv2
from engine import Recognizer
parser=argparse.ArgumentParser();parser.add_argument('--index',default='.recognition/index');parser.add_argument('--inventory',default='.local-media/inventory.json');parser.add_argument('--output',default='.recognition/footage-scan');parser.add_argument('--interval',type=int,default=120);args=parser.parse_args()
out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True);log=out/'detections.jsonl'
done=set()
if log.exists():
    for line in log.read_text().splitlines():
        try:r=json.loads(line);done.add((r['file'],r['seconds']))
        except (ValueError,KeyError):pass
recognizer=Recognizer(args.index)
for recording in json.loads(pathlib.Path(args.inventory).read_text()):
    if 'duration' not in recording:continue
    source=pathlib.Path(recording['file'])
    for seconds in range(30,int(recording['duration']),args.interval):
        if (str(source),seconds) in done:continue
        frame=out/f'{source.stem}-{seconds}.jpg'
        try:
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(seconds),'-i',str(source),'-frames:v','1',str(frame)],check=True,timeout=30)
            result=recognizer.recognize(cv2.imread(str(frame)))
            record={'file':str(source),'seconds':seconds,'image':frame.name,**result,'labelStatus':'unverified machine candidates'}
        except Exception as error:record={'file':str(source),'seconds':seconds,'error':str(error)}
        with log.open('a') as handle:handle.write(json.dumps(record)+'\n')
        print(json.dumps({'recording':source.name,'seconds':seconds,'matches':[m['name'] for m in record.get('matches',[])]}),flush=True)
