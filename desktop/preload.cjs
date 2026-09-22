const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('cardRecognition',{identify:image=>ipcRenderer.invoke('recognize-frame',image),addCards:names=>ipcRenderer.invoke('recognition-add-cards',names),library:()=>ipcRenderer.invoke('recognition-library')});
