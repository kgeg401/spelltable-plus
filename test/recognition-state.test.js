import test from 'node:test';
import assert from 'node:assert/strict';
import {RecognitionHistory} from '../desktop/recognition-state.js';
test('weak detections need consecutive observations and cannot accumulate across misses',()=>{
 const history=new RecognitionHistory(),weak={name:'Frog Butler',inliers:8,ratio:.5};
 assert.deepEqual(history.update('a',[weak],0),[]);history.update('a',[],1000);
 assert.deepEqual(history.update('a',[weak],2000),[]);assert.equal(history.update('a',[weak],3000).length,1);
});
test('detections stay attached to their seat, show recency, expire and clear on leave',()=>{
 const history=new RecognitionHistory(),strong={name:'Sol Ring',inliers:20,ratio:.8};history.update('a',[strong],0);history.update('b',[],1000);
 assert.equal(history.get('a',5000)[0].ageSeconds,5);assert.deepEqual(history.get('b',5000),[]);assert.deepEqual(history.get('a',21000),[]);
 history.update('a',[strong],30000);history.retain(['b']);assert.deepEqual(history.get('a',30000),[]);
 history.update('a',[strong],40000);assert.deepEqual(history.update('a',[{...strong,inliers:8,ratio:.5}],70000),[]);
});
