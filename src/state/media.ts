// DOM elements the services need. Components register them; the store reads them.
export const media: {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
} = { video: null, canvas: null };

export const AVATAR_VIDEO_ID = "anam-video";
