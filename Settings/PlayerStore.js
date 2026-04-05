import { create } from 'zustand';

export const usePlayerStore = create((set) => ({
  videoId: null,
  videoData: null,
  videoUrl: null,
  audioUrl: null,
  streamMode: 'combined',
  playerState: 'hidden', // 'hidden', 'full', 'mini'
  captions: [],
  selectedCC: null,
  actualQuality: 'Loading...',

  setVideoConfig: (id, data, vUrl, aUrl, mode, caps, quality) => set({ 
    videoId: id, videoData: data, videoUrl: vUrl, audioUrl: aUrl, streamMode: mode, playerState: 'full', captions: caps, actualQuality: quality 
  }),
  setPlayerState: (state) => set({ playerState: state }),
  setSelectedCC: (cc) => set({ selectedCC: cc }),
  closePlayer: () => set({ videoId: null, videoData: null, videoUrl: null, audioUrl: null, playerState: 'hidden', captions: [], selectedCC: null }),
}));