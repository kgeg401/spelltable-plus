const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('cardRecognition',{identify:image=>ipcRenderer.invoke('recognize-frame',image)});
