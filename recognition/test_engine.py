"""Deterministic geometric checks; real-footage evaluation is separate."""
import json,pathlib,unittest
import cv2,numpy as np
from engine import Recognizer

class RecognitionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine=Recognizer('.recognition/index')
        cls.card=next(c for c in cls.engine.cards if c['name']=='Frog Butler')
        cls.image=cv2.imread(cls.card['source'])
    def test_blank_rejected(self):
        self.assertEqual(self.engine.recognize(np.zeros((600,800,3),np.uint8))['matches'],[])
    def test_perspective_and_rotation(self):
        image=cv2.resize(self.image,(244,340));source=np.float32([[0,0],[243,0],[243,339],[0,339]])
        dest=np.float32([[520,420],[285,460],[270,155],[485,125]])
        transform=cv2.getPerspectiveTransform(source,dest)
        warped=cv2.warpPerspective(image,transform,(800,600))
        matches=self.engine.recognize(warped)['matches']
        self.assertIn('Frog Butler',[m['name'] for m in matches])
        match=next(m for m in matches if m['name']=='Frog Butler')
        self.assertLess(float(np.mean(np.linalg.norm(np.array(match['corners'])-dest,axis=1))),6)
    def test_real_frame(self):
        # Explicitly labeled development frame. Not an unseen/general accuracy claim.
        image=cv2.imread('.recognition/frame-1820.jpg')
        names={m['name'] for m in self.engine.recognize(image)['matches']}
        self.assertTrue({'Frog Butler','Lulu, Stern Guardian','Zegana, Utopian Speaker'}.issubset(names))
    def test_noncard_crop_rejected(self):
        image=cv2.imread('.recognition/frame-1820.jpg')[150:245,15:90]
        self.assertEqual(self.engine.recognize(image)['matches'],[])

if __name__=='__main__':unittest.main()
