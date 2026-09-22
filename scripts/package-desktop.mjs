import {packager} from '@electron/packager';
import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
const withLocalMedia=process.argv.includes('--local-media');
const folders=await packager({dir:'.',name:'SpellTablePlus',platform:'win32',arch:'x64',out:'release',overwrite:true,ignore:[/^\/release($|\/)/,/^\/\.local-media($|\/)/,/^\/\.venv($|\/)/,/^\/\.recognition($|\/)/,/^\/desktop-test-results($|\/)/,/\.spec$/,/__pycache__/]});
for(const folder of folders){
 await cp('desktop/Start Four Players.cmd',path.join(folder,'Start Four Players.cmd'));
 const resources=path.join(folder,'resources');
 if(existsSync('.recognition/runtime/recognizer')){
  await cp('.recognition/runtime/recognizer',path.join(resources,'recognition'),{recursive:true});
  await mkdir(path.join(resources,'recognition/index'),{recursive:true});
  await cp('.recognition/index/features.npz',path.join(resources,'recognition/index/features.npz'));
  const cards=JSON.parse(await readFile('.recognition/index/cards.json','utf8')).map(({source,...card})=>card);
  await writeFile(path.join(resources,'recognition/index/cards.json'),JSON.stringify(cards));
 }
 if(withLocalMedia){
  await mkdir(path.join(resources,'local-media'),{recursive:true});
  for(let i=1;i<=4;i++)await cp(`.local-media/player-${i}.mp4`,path.join(resources,`local-media/player-${i}.mp4`));
  const cards=JSON.parse(await readFile('.local-media/cards.json','utf8')).map(({source,...card})=>card);
  await writeFile(path.join(resources,'local-media/cards.json'),JSON.stringify(cards));
 }
 console.log(`Packaged ${folder}; private footage included: ${withLocalMedia}`);
}
