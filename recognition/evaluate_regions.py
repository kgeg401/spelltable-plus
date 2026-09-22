"""Evaluate independently labeled regions. Never auto-promotes candidates to labels."""
import argparse,json,pathlib
import cv2,numpy as np
from engine import Recognizer
parser=argparse.ArgumentParser();parser.add_argument('--labels',default='.recognition/holdout-labels.json');parser.add_argument('--index',default='.recognition/index');parser.add_argument('--output',default='.recognition/holdout-evaluation.json');args=parser.parse_args()
labels_path=pathlib.Path(args.labels);labels=json.loads(labels_path.read_text());engine=Recognizer(args.index)
def inside(point,box):return box[0]<=point[0]<=box[2] and box[1]<=point[1]<=box[3]
def iou(box,other):
    intersection=max(0,min(box[2],other[2])-max(box[0],other[0]))*max(0,min(box[3],other[3])-max(box[1],other[1]))
    area=(box[2]-box[0])*(box[3]-box[1]);other_area=(other[2]-other[0])*(other[3]-other[1])
    return intersection/max(1,area+other_area-intersection)
results=[];tp=fp=fn=0
for frame in labels['frames']:
    image=cv2.imread(str(labels_path.parent/frame['image']));detected=engine.recognize(image);predictions=[]
    for match in detected['matches']:
        points=np.array(match['corners']);center=points.mean(axis=0)
        if not any(inside(center,r) for r in frame['regions']) or any(inside(center,r) for r in frame.get('ignore',[])):continue
        predictions.append({**match,'box':[float(points[:,0].min()),float(points[:,1].min()),float(points[:,0].max()),float(points[:,1].max())]})
    claimed=set();correct=[];missed=[]
    for card in frame['cards']:
        candidates=[(i,p) for i,p in enumerate(predictions) if i not in claimed and p['name']==card['name'] and iou(p['box'],card['box'])>=.35]
        if candidates:claimed.add(candidates[0][0]);correct.append(card['name'])
        else:missed.append(card['name'])
    false=[p for i,p in enumerate(predictions) if i not in claimed]
    tp+=len(correct);fp+=len(false);fn+=len(missed)
    results.append({'image':frame['image'],'correct':correct,'missed':missed,'falsePositives':false,'milliseconds':detected['milliseconds']})
report={'scope':labels['scope'],'truePositives':tp,'falsePositives':fp,'falseNegatives':fn,'precision':tp/max(1,tp+fp),'recall':tp/max(1,tp+fn),'iouThreshold':.35,'frames':results}
pathlib.Path(args.output).write_text(json.dumps(report,indent=2));print(json.dumps(report))
