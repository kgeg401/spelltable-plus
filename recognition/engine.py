"""Local SIFT retrieval with geometric verification; no frames leave the PC."""
import argparse, base64, json, pathlib, sys, time
import cv2
import numpy as np

cv2.setNumThreads(2)

def features(image, count=2500):
    gray=cv2.cvtColor(image,cv2.COLOR_BGR2GRAY) if image.ndim==3 else image
    return cv2.SIFT_create(nfeatures=count,contrastThreshold=.02,edgeThreshold=12).detectAndCompute(gray,None)

def build_index(videos, output, additional=None):
    records=[]; descriptors=[]; points=[]; owners=[]; seen=set()
    sources=list(pathlib.Path(videos).glob('*/cards/metadata.json'))
    if additional:sources+=list(pathlib.Path(additional).glob('*/cards/metadata.json'))
    for metadata in sources:
        for key,card in json.loads(metadata.read_text(encoding='utf-8')).items():
            source=metadata.parent/(key+'.png')
            identity=(card['name'],card.get('illustration_id') or card.get('id',key))
            if identity in seen or not source.exists():continue
            image=cv2.imread(str(source))
            if image is None:continue
            seen.add(identity)
            image=cv2.resize(image,(244,340),interpolation=cv2.INTER_AREA)
            kp,desc=features(image,800)
            if desc is None:continue
            index=len(records)
            records.append({'name':card['name'],'id':card.get('id',key),'oracle_id':card.get('oracle_id'),'url':card.get('scryfall_uri'),'width':244,'height':340,'source':str(source)})
            descriptors.append(desc);points.extend([p.pt for p in kp]);owners.extend([index]*len(kp))
    output=pathlib.Path(output);output.mkdir(parents=True,exist_ok=True)
    np.savez_compressed(output/'features.npz',descriptors=np.vstack(descriptors),points=np.array(points,dtype=np.float32),owners=np.array(owners,dtype=np.int32))
    (output/'cards.json').write_text(json.dumps(records,indent=2))
    print(json.dumps({'cards':len(records),'features':len(owners)}))

class Recognizer:
    def __init__(self,index):
        index=pathlib.Path(index);self.cards=json.loads((index/'cards.json').read_text())
        data=np.load(index/'features.npz',allow_pickle=False)
        self.descriptors=data['descriptors'];self.points=data['points'];self.owners=data['owners']
        self.matcher=cv2.FlannBasedMatcher(dict(algorithm=1,trees=5),dict(checks=80))
        self.matcher.add([self.descriptors]);self.matcher.train()

    def recognize(self,image):
        started=time.perf_counter()
        if image is None or image.shape[0]<40 or image.shape[1]<40:raise ValueError('Image too small or invalid')
        scale=min(1,1920/max(image.shape[:2]));image=cv2.resize(image,None,fx=scale,fy=scale) if scale<1 else image
        kp,desc=features(image,9000)
        if desc is None or len(desc)<10:return {'matches':[],'milliseconds':round((time.perf_counter()-started)*1000)}
        query_points=np.array([p.pt for p in kp],np.float32)
        votes={}
        for pair in self.matcher.knnMatch(desc,k=2):
            if len(pair)==2 and pair[0].distance<.72*pair[1].distance:
                owner=int(self.owners[pair[0].trainIdx]);votes[owner]=votes.get(owner,0)+1
        results=[]
        frame_matcher=cv2.FlannBasedMatcher(dict(algorithm=1,trees=4),dict(checks=80))
        frame_matcher.add([desc]);frame_matcher.train()
        for owner,vote in sorted(votes.items(),key=lambda item:-item[1])[:24]:
            if vote<4:continue
            selected=np.where(self.owners==owner)[0]
            good=[pair[0] for pair in frame_matcher.knnMatch(self.descriptors[selected],k=2) if len(pair)==2 and pair[0].distance<.72*pair[1].distance]
            # One query feature cannot serve as multiple pieces of geometric evidence.
            good=list({m.trainIdx:m for m in sorted(good,key=lambda m:-m.distance)}.values())
            if len(good)<8:continue
            src=np.array([self.points[selected[m.queryIdx]] for m in good],np.float32)
            dst=np.array([query_points[m.trainIdx] for m in good],np.float32)
            H,mask=cv2.findHomography(src,dst,cv2.RANSAC,3.0)
            if H is None:continue
            inliers=int(mask.sum());ratio=inliers/len(good)
            if inliers<8 or ratio<.5:continue
            corners=cv2.perspectiveTransform(np.array([[[0,0],[243,0],[243,339],[0,339]]],np.float32),H)[0]
            if not np.isfinite(corners).all() or not cv2.isContourConvex(corners):continue
            area=abs(cv2.contourArea(corners));frame_area=image.shape[0]*image.shape[1]
            if area<650 or area>frame_area*.8:continue
            if np.any(corners< -20) or np.any(corners[:,0]>image.shape[1]+20) or np.any(corners[:,1]>image.shape[0]+20):continue
            edges=np.linalg.norm(corners-np.roll(corners,1,axis=0),axis=1)
            if max(edges)/min(edges)>4:continue
            coverage=cv2.contourArea(cv2.convexHull(src[mask.ravel()==1]))/(244*340)
            if coverage<.035:continue
            # Geometric score is evidence strength, not a calibrated probability.
            card=self.cards[owner]
            results.append({'name':card['name'],'id':card['id'],'inliers':inliers,'ratio':round(ratio,3),'coverage':round(coverage,3),'corners':(corners/scale).round(1).tolist()})
        results.sort(key=lambda r:-r['inliers'])
        accepted=[]
        for candidate in results:
            poly=np.array(candidate['corners'],np.float32);area=abs(cv2.contourArea(poly))
            if any(cv2.intersectConvexConvex(poly,np.array(other['corners'],np.float32))[0]/area>.5 for other in accepted):continue
            accepted.append(candidate)
        return {'matches':accepted,'milliseconds':round((time.perf_counter()-started)*1000),'referenceCount':len(self.cards)}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--index',required=True);parser.add_argument('--build');parser.add_argument('--additional');parser.add_argument('--image');parser.add_argument('--worker',action='store_true');args=parser.parse_args()
    if args.build:return build_index(args.build,args.index,args.additional)
    recognizer=Recognizer(args.index)
    if args.image:print(json.dumps(recognizer.recognize(cv2.imread(args.image))));return
    if args.worker:
        print(json.dumps({'ready':True,'referenceCount':len(recognizer.cards)}),flush=True)
        for line in sys.stdin:
            try:
                request=json.loads(line);data=base64.b64decode(request['image'],validate=True)
                if len(data)>4_000_000:raise ValueError('Frame too large')
                image=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_COLOR)
                if image is None or image.size>1920*1920*3:raise ValueError('Frame dimensions exceed limit')
                print(json.dumps({'requestId':request.get('requestId'),**recognizer.recognize(image)}),flush=True)
            except Exception as error:print(json.dumps({'error':str(error)}),flush=True)

if __name__=='__main__':main()
