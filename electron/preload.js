// Desktop bridge: exposes the optional FFmpeg finalize pass to the editor.
// Runs sandboxed; only these two calls cross the boundary.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('frameforgeDesktop', {
  ffmpegAvailable: () => ipcRenderer.invoke('ffmpeg-available'),
  ffmpegFinalize: (mp4) => ipcRenderer.invoke('ffmpeg-finalize', mp4),
});
